import { describe, expect, it } from "vitest";
import { createSecureRandomDraft, deriveReadingFacts, lineValuesFromReading, type LineValue } from "../shared/casting";
import { IDENTIFIER_CATALOG, getHexagramByPattern } from "../shared/catalog";
import { readingCreateSchema, type ReadingCreate } from "../shared/contracts";

function secureRequest(values: readonly LineValue[]): ReadingCreate {
  return readingCreateSchema.parse({
    schemaVersion: "reading-create@1",
    clientRequestId: crypto.randomUUID(),
    castingMethod: "secure-random@1",
    inputs: {
      lineValues: values,
      entropyCommitment: `random-v1:${"A".repeat(43)}`,
      reviewed: true,
    },
    question: { kind: "none" },
    timezone: "Asia/Hong_Kong",
  });
}

function valuesFor(pattern: string, mask = 0): LineValue[] {
  return [...pattern].map((bit, index) => {
    const changing = (mask & (1 << index)) !== 0;
    return bit === "1" ? changing ? 9 : 7 : changing ? 6 : 8;
  });
}

describe("versioned deterministic casting contracts", () => {
  it("maps every one of the 64 bottom-to-top King Wen patterns", () => {
    expect(IDENTIFIER_CATALOG).toHaveLength(64);
    expect(new Set(IDENTIFIER_CATALOG.map((entry) => entry.pattern))).toHaveLength(64);
    for (const expected of IDENTIFIER_CATALOG) {
      const facts = deriveReadingFacts(secureRequest(valuesFor(expected.pattern)));
      expect(facts.primary.kingWenNumber).toBe(expected.kingWenNumber);
      expect(facts.primary.pattern).toBe(expected.pattern);
      expect(facts.relating.pattern).toBe(expected.pattern);
      expect(facts.cast.changingPositions).toEqual([]);
    }
  });

  it("covers all 384 single-line changes with one-based, bottom-to-top positions", () => {
    let cases = 0;
    for (const expected of IDENTIFIER_CATALOG) {
      for (let position = 1; position <= 6; position += 1) {
        const facts = deriveReadingFacts(secureRequest(valuesFor(expected.pattern, 1 << (position - 1))));
        const relating = [...expected.pattern];
        relating[position - 1] = relating[position - 1] === "1" ? "0" : "1";
        expect(facts.primary.kingWenNumber).toBe(expected.kingWenNumber);
        expect(facts.cast.changingPositions).toEqual([position]);
        expect(facts.relating.kingWenNumber).toBe(getHexagramByPattern(relating.join("")).kingWenNumber);
        expect(facts.movingLines[0]?.position).toBe(position);
        cases += 1;
      }
    }
    expect(cases).toBe(384);
  });

  it("covers all 4,096 primary-pattern and changing-mask combinations", () => {
    let cases = 0;
    for (const expected of IDENTIFIER_CATALOG) {
      for (let mask = 0; mask < 64; mask += 1) {
        const facts = deriveReadingFacts(secureRequest(valuesFor(expected.pattern, mask)));
        const relating = [...expected.pattern].map((bit, index) => (mask & (1 << index)) ? bit === "1" ? "0" : "1" : bit).join("");
        expect(facts.primary.pattern).toBe(expected.pattern);
        expect(facts.relating.pattern).toBe(relating);
        expect(facts.cast.changingPositions).toEqual(Array.from({ length: 6 }, (_, index) => index + 1).filter((position) => mask & (1 << (position - 1))));
        cases += 1;
      }
    }
    expect(cases).toBe(4096);
  });

  it("maps all three-coin outcomes to the canonical 6, 7, 8, 9 values", () => {
    const faces = ["tails", "heads"] as const;
    for (let combination = 0; combination < 8; combination += 1) {
      const oneThrow = [0, 1, 2].map((index) => faces[(combination >> index) & 1]!) as ["tails" | "heads", "tails" | "heads", "tails" | "heads"];
      const request = readingCreateSchema.parse({
        schemaVersion: "reading-create@1",
        clientRequestId: crypto.randomUUID(),
        castingMethod: "three-coin@1",
        inputs: { throws: Array.from({ length: 6 }, () => [...oneThrow]) },
        question: { kind: "none" },
        timezone: "UTC",
      });
      const expected = 6 + oneThrow.filter((face) => face === "heads").length;
      expect(lineValuesFromReading(request)).toEqual(Array(6).fill(expected));
    }
  });

  it("uses the pure-hexagram special lines only when all six lines change", () => {
    expect(deriveReadingFacts(secureRequest([9, 9, 9, 9, 9, 9])).specialLine).toEqual({ lineKey: "用九" });
    expect(deriveReadingFacts(secureRequest([6, 6, 6, 6, 6, 6])).specialLine).toEqual({ lineKey: "用六" });
    expect(deriveReadingFacts(secureRequest([9, 9, 9, 9, 9, 7])).specialLine).toBeNull();
  });

  it("strictly rejects malformed, unreviewed, fractional, and extra input", () => {
    const valid = {
      schemaVersion: "reading-create@1",
      clientRequestId: crypto.randomUUID(),
      castingMethod: "three-number@1",
      inputs: { upperTrigram: 1, lowerTrigram: 2, changingPosition: 6 },
      question: { kind: "none" },
      timezone: "UTC",
    };
    expect(readingCreateSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(readingCreateSchema.safeParse({ ...valid, inputs: { ...valid.inputs, upperTrigram: 1.5 } }).success).toBe(false);
    expect(readingCreateSchema.safeParse({ ...valid, inputs: { ...valid.inputs, changingPosition: 0 } }).success).toBe(false);
    expect(readingCreateSchema.safeParse({ ...valid, clientRequestId: "predictable" }).success).toBe(false);
    expect(readingCreateSchema.safeParse({ ...valid, castingMethod: "secure-random@1", inputs: { lineValues: [7, 7, 7, 7, 7, 7], entropyCommitment: `random-v1:${"A".repeat(43)}`, reviewed: false } }).success).toBe(false);
  });
});

describe("browser cryptographic random casting", () => {
  it("uses rejection sampling, commits to entropy, and returns six reviewed values", async () => {
    const bytes = new Uint8Array(32);
    bytes.set([252, 253, 254, 255, 0, 1, 2, 3, 4, 5]);
    const draft = await createSecureRandomDraft(() => bytes);
    expect(draft.lineValues).toEqual([6, 7, 8, 9, 6, 7]);
    expect(draft.reviewed).toBe(true);
    expect(draft.entropyCommitment).toMatch(/^random-v1:[A-Za-z0-9_-]{43}$/);
  });

  it("fails closed when the entropy source violates its contract", async () => {
    await expect(createSecureRandomDraft(() => new Uint8Array(3))).rejects.toThrow("RANDOM_FAILED");
  });
});
