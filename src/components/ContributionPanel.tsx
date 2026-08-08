import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { postJson } from "../lib/api";
import { Turnstile } from "./Turnstile";

const presets = [0, 8, 18, 38, 68] as const;

export function ContributionPanel({ readingId, cancelled = false }: { readingId: string; cancelled?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [amount, setAmount] = useState<number>(0);
  const [custom, setCustom] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = (value: number) => { setAmount(value); setCustom(""); setToken(""); };
  const onToken = useCallback((value: string) => setToken(value), []);
  const actualAmount = custom ? Number(custom) : amount;
  const valid = Number.isInteger(actualAmount) && actualAmount >= 0 && actualAmount <= 888 && (actualAmount === 0 || actualAmount >= 1);
  const submit = async () => {
    if (!valid || (actualAmount > 0 && !token)) return;
    setBusy(true); setError("");
    try {
      const response = await postJson<{ status: string; checkoutUrl?: string }>(`/api/v1/readings/${readingId}/contribution`, {
        amountHkd: actualAmount,
        ...(actualAmount > 0 ? { turnstileToken: token } : {}),
      }, { "Idempotency-Key": crypto.randomUUID() });
      if (response.checkoutUrl) window.location.assign(response.checkoutUrl);
      else navigate(`/reading/${readingId}`, { replace: true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("common.error")); }
    finally { setBusy(false); }
  };
  return <section className="contribution glass-panel" aria-labelledby="contribution-title">
    <h2 id="contribution-title">{t("contribution.title")}</h2>
    <p className="muted max-copy">{t("contribution.body")}</p>
    {cancelled && <p className="notice warm">{t("contribution.cancelled")}</p>}
    <div className="amount-grid">
      {presets.map((value) => <button key={value} type="button" className={!custom && amount === value ? "amount active" : "amount"} onClick={() => choose(value)}>
        <small>HK$</small>{value}
      </button>)}
    </div>
    <label className="field custom-amount">
      <span>{t("contribution.custom")}</span>
      <div><span>HK$</span><input inputMode="numeric" min="1" max="888" value={custom} onChange={(event) => { setCustom(event.target.value.replace(/\D/g, "").slice(0, 3)); setToken(""); }} /></div>
    </label>
    {actualAmount > 0 && <Turnstile action="payment_create" onToken={onToken} resetKey={actualAmount} />}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary wide" disabled={!valid || busy || (actualAmount > 0 && !token)} onClick={() => void submit()}>
      {busy ? t("common.loading") : actualAmount > 0 ? t("contribution.checkout") : t("contribution.proceed")}
    </button>
  </section>;
}
