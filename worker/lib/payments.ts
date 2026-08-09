import Stripe from "stripe";
import type { Env } from "../env";
import { ApiError } from "./errors";

function stripeClient(secret: string): Stripe {
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 15_000,
  });
}

export async function createCheckoutSession(env: Env, input: {
  contributionId: string;
  readingId: string;
  amountHkd: number;
  locale: "zh-HK" | "zh-CN" | "en";
  userEmail?: string;
}) {
  if (!env.STRIPE_SECRET_KEY) throw new ApiError("PAYMENTS_NOT_CONFIGURED", 503, "Payments are not configured.");
  const stripe = stripeClient(env.STRIPE_SECRET_KEY);
  const names = { "zh-HK": "Yi · 易 自願掛金", "zh-CN": "Yi · 易 随喜赞助", en: "Yi voluntary contribution" };
  try {
    return await stripe.checkout.sessions.create({
      mode: "payment",
      locale: input.locale === "en" ? "en" : input.locale === "zh-CN" ? "zh" : "zh-HK",
      success_url: `${env.APP_ORIGIN}/reading/${encodeURIComponent(input.readingId)}?checkout=returned`,
      cancel_url: `${env.APP_ORIGIN}/reading/${encodeURIComponent(input.readingId)}?checkout=cancelled`,
      client_reference_id: input.readingId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "hkd",
          unit_amount: input.amountHkd * 100,
          product_data: { name: names[input.locale] },
        },
      }],
      customer_email: input.userEmail,
      metadata: {
        schema_version: "yi-contribution@1",
        reading_operation_id: input.readingId,
        contribution_id: input.contributionId,
      },
      payment_intent_data: {
        metadata: {
          schema_version: "yi-contribution@1",
          reading_operation_id: input.readingId,
          contribution_id: input.contributionId,
        },
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      // payment_method_types is intentionally omitted: Stripe dynamic payment methods
      // select eligible cards, Alipay and WeChat Pay from Dashboard configuration.
    }, { idempotencyKey: input.contributionId });
  } catch {
    throw new ApiError("CHECKOUT_CREATE_FAILED", 502, "Checkout could not be created.", true);
  }
}

function paymentIntentId(value: string | Stripe.PaymentIntent | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function handleStripeWebhook(env: Env, request: Request): Promise<{ duplicate: boolean; eventType?: string }> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new ApiError("PAYMENTS_NOT_CONFIGURED", 503, "Payments are not configured.");
  }
  const signature = request.headers.get("Stripe-Signature");
  if (!signature) throw new ApiError("WEBHOOK_SIGNATURE_MISSING", 400, "Webhook signature is missing.");
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripeClient(env.STRIPE_SECRET_KEY).webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new ApiError("WEBHOOK_SIGNATURE_INVALID", 400, "Webhook signature is invalid.");
  }
  if (event.livemode !== (env.APP_ENV === "production")) {
    throw new ApiError("WEBHOOK_MODE_MISMATCH", 400, "Webhook mode does not match this environment.");
  }

  const seen = await env.DB.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(event.id).first();
  if (seen) return { duplicate: true, eventType: event.type };
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO stripe_events(event_id, event_type, livemode, processed_at) VALUES (?, ?, ?, ?)")
      .bind(event.id, event.type, event.livemode ? 1 : 0, now),
  ];

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const contributionId = session.metadata?.contribution_id;
    const readingId = session.metadata?.reading_operation_id;
    const contribution = contributionId && readingId
      ? await env.DB.prepare(`
          SELECT amount_hkd FROM contributions
          WHERE id = ? AND reading_operation_id = ? AND stripe_checkout_session_id = ?
        `).bind(contributionId, readingId, session.id).first<{ amount_hkd: number }>()
      : null;
    if (contribution && session.client_reference_id === readingId && session.payment_status === "paid" &&
      session.currency?.toLowerCase() === "hkd" && session.amount_total === contribution.amount_hkd * 100) {
      statements.push(
        env.DB.prepare(`
          UPDATE contributions SET status = 'paid', stripe_payment_intent_id = ?, paid_at = ?, updated_at = ?
          WHERE id = ? AND reading_operation_id = ? AND stripe_checkout_session_id = ? AND status IN ('checkout_created', 'paid')
        `).bind(paymentIntentId(session.payment_intent), now, now, contributionId, readingId, session.id),
        env.DB.prepare(`
          UPDATE reading_operations SET status = 'ready', updated_at = ?
          WHERE id = ? AND status IN ('payment_pending', 'ready')
            AND EXISTS (
              SELECT 1 FROM contributions
              WHERE id = ? AND reading_operation_id = ? AND stripe_checkout_session_id = ?
                AND status IN ('checkout_created', 'paid')
            )
        `).bind(now, readingId, contributionId, readingId, session.id),
      );
    }
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const contributionId = session.metadata?.contribution_id;
    const readingId = session.metadata?.reading_operation_id;
    if (contributionId && readingId) {
      statements.push(
        env.DB.prepare("UPDATE contributions SET status = ?, updated_at = ? WHERE id = ? AND reading_operation_id = ? AND stripe_checkout_session_id = ? AND status = 'checkout_created'")
          .bind(event.type === "checkout.session.expired" ? "expired" : "failed", now, contributionId, readingId, session.id),
        env.DB.prepare(`
          UPDATE reading_operations SET status = 'awaiting_contribution', updated_at = ?
          WHERE id = ? AND status = 'payment_pending'
            AND EXISTS (SELECT 1 FROM contributions WHERE id = ? AND reading_operation_id = ? AND stripe_checkout_session_id = ?)
        `).bind(now, readingId, contributionId, readingId, session.id),
      );
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntent = paymentIntentId(charge.payment_intent);
    if (paymentIntent) {
      statements.push(env.DB.prepare("UPDATE contributions SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE stripe_payment_intent_id = ?")
        .bind(now, now, paymentIntent));
    }
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const replay = await env.DB.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(event.id).first();
    if (replay) return { duplicate: true, eventType: event.type };
    throw error;
  }
  return { duplicate: false, eventType: event.type };
}
