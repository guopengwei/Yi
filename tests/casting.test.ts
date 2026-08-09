import { describe, expect, it } from "vitest";
import { deriveReadingFacts, lineValuesFromReading } from "../shared/casting";
import { IDENTIFIER_CATALOG, getHexagramByPattern } from "../shared/catalog";
import { readingCreateSchema, type ReadingCreate } from "../shared/contracts";

function threeNumberRequest(
  expected: (typeof IDENTIFIER_CATALOG)[number],
  changingPosition: number,
): ReadingCreate {
  return readingCreateSchema.parse({
    schemaVersion: "reading-create@1",
    clientRequestId: crypto.randomUUID(),
    castingMethod: "three-number@1",
    inputs: {
      upperTrigram: expected.upperTrigram.number,
      lowerTrigram: expected.lowerTrigram.number,
      changingPosition,
    },
    question: { kind: "none" },
    timezone: "Asia/Hong_Kong",
  });
}

describe("versioned deterministic casting contracts", () => {
  it("maps every one of the 64 bottom-to-top King Wen patterns", () => {
    expect(IDENTIFIER_CATALOG).toHaveLength(64);
    expect(new Set(IDENTIFIER_CATALOG.map((entry) => entry.pattern))).toHaveLength(64);
    for (const expected of IDENTIFIER_CATALOG) {
      const facts = deriveReadingFacts(threeNumberRequest(expected, 1));
      expect(facts.primary.kingWenNumber).toBe(expected.kingWenNumber);
      expect(facts.primary.pattern).toBe(expected.pattern);
    }
  });

  it("covers all 384 single-line changes with one-based, bottom-to-top positions", () => {
    let cases = 0;
    for (const expected of IDENTIFIER_CATALOG) {
      for (let position = 1; position <= 6; position += 1) {
        const request = threeNumberRequest(expected, position);
        const lineValues = lineValuesFromReading(request);
        const facts = deriveReadingFacts(request);
        const relating = [...expected.pattern];
        relating[position - 1] = relating[position - 1] === "1" ? "0" : "1";

        expect(lineValues.filter((value) => value === 6 || value === 9)).toHaveLength(1);
        expect(facts.cast.changingPositions).toEqual([position]);
        expect(facts.relating.kingWenNumber).toBe(getHexagramByPattern(relating.join("")).kingWenNumber);
        expect(facts.movingLines).toHaveLength(1);
        expect(facts.movingLines[0]?.position).toBe(position);
        expect(facts.specialLine).toBeNull();
        cases += 1;
      }
    }
    expect(cases).toBe(384);
  });

  it("rejects casting methods that can produce zero or multiple changing lines", () => {
    const base = {
      schemaVersion: "reading-create@1",
      clientRequestId: crypto.randomUUID(),
      question: { kind: "none" },
      timezone: "UTC",
    };
    expect(readingCreateSchema.safeParse({
      ...base,
      castingMethod: "three-coin@1",
      inputs: { throws: Array.from({ length: 6 }, () => ["heads", "tails", "heads"]) },
    }).success).toBe(false);
    expect(readingCreateSchema.safeParse({
      ...base,
      castingMethod: "secure-random@1",
      inputs: { lineValues: [7, 7, 7, 7, 7, 7], entropyCommitment: `random-v1:${"A".repeat(43)}`, reviewed: true },
    }).success).toBe(false);
  });

  it("strictly rejects malformed, fractional, and extra three-number input", () => {
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
  });
});
