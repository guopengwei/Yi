import { z } from "zod";

export const castingMethodSchema = z.literal("three-number@1");
export type CastingMethod = z.infer<typeof castingMethodSchema>;

export const questionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("question"), text: z.string().trim().min(1).max(280) }).strict(),
]);
export type ReadingQuestion = z.infer<typeof questionSchema>;

const threeNumberInputs = z.object({
  upperTrigram: z.number().int().min(1).max(8),
  lowerTrigram: z.number().int().min(1).max(8),
  changingPosition: z.number().int().min(1).max(6),
}).strict();

export const readingCreateSchema = z.object({
  schemaVersion: z.literal("reading-create@1"),
  clientRequestId: z.string().uuid(),
  castingMethod: castingMethodSchema,
  inputs: threeNumberInputs,
  question: questionSchema,
  timezone: z.string().min(1).max(64),
}).strict();
export type ReadingCreate = z.infer<typeof readingCreateSchema>;

export const localeSchema = z.enum(["zh-HK", "zh-CN", "en"]);

export const aiConsentSchema = z.object({
  schemaVersion: z.literal("ai-consent@1"),
  consent: z.literal(true),
  includeReadingFacts: z.literal(true),
  includeQuestion: z.boolean(),
  includeSourceMaterial: z.boolean(),
  turnstileToken: z.string().max(2048).optional(),
}).strict();

export const contributionSchema = z.object({
  amountHkd: z.number().int().min(0).max(888),
  turnstileToken: z.string().max(2048).optional(),
}).strict();

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    fieldErrors?: Record<string, string>;
  };
}
