import { z } from "zod";

export const castingMethodSchema = z.enum(["three-number@1", "three-coin@1", "secure-random@1"]);
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

const coinFace = z.enum(["heads", "tails"]);
const coinThrow = z.tuple([coinFace, coinFace, coinFace]);
const threeCoinInputs = z.object({
  throws: z.tuple([coinThrow, coinThrow, coinThrow, coinThrow, coinThrow, coinThrow]),
}).strict();

const secureRandomInputs = z.object({
  lineValues: z.tuple([
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]),
  ]),
  entropyCommitment: z.string().regex(/^random-v1:[A-Za-z0-9_-]{22,128}$/),
  reviewed: z.literal(true),
}).strict();

export const readingCreateSchema = z.discriminatedUnion("castingMethod", [
  z.object({
    schemaVersion: z.literal("reading-create@1"),
    clientRequestId: z.string().uuid(),
    castingMethod: z.literal("three-number@1"),
    inputs: threeNumberInputs,
    question: questionSchema,
    timezone: z.string().min(1).max(64),
  }).strict(),
  z.object({
    schemaVersion: z.literal("reading-create@1"),
    clientRequestId: z.string().uuid(),
    castingMethod: z.literal("three-coin@1"),
    inputs: threeCoinInputs,
    question: questionSchema,
    timezone: z.string().min(1).max(64),
  }).strict(),
  z.object({
    schemaVersion: z.literal("reading-create@1"),
    clientRequestId: z.string().uuid(),
    castingMethod: z.literal("secure-random@1"),
    inputs: secureRandomInputs,
    question: questionSchema,
    timezone: z.string().min(1).max(64),
  }).strict(),
]);
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
