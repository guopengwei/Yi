import type { ReadingCreate } from "./contracts";
import { IDENTIFIER_CATALOG_VERSION, TRIGRAMS, getHexagramByPattern, lineKey } from "./catalog";

export type LineValue = 6 | 7 | 8 | 9;

export interface CastFacts {
  readonly schemaVersion: "reading-facts@1";
  readonly identifierCatalogVersion: typeof IDENTIFIER_CATALOG_VERSION;
  readonly cast: {
    readonly schemaVersion: "cast@1";
    readonly castingMethod: ReadingCreate["castingMethod"];
    readonly lineValues: readonly LineValue[];
    readonly changingPositions: readonly number[];
    readonly primaryPattern: string;
    readonly relatingPattern: string;
    readonly normalizedInputs: unknown;
    readonly entropyCommitment?: string;
  };
  readonly primary: ReturnType<typeof compactHexagram>;
  readonly relating: ReturnType<typeof compactHexagram>;
  readonly movingLines: readonly { position: number; yinYang: "yin" | "yang"; lineKey: string }[];
  readonly specialLine: { lineKey: "用九" | "用六" } | null;
  readonly sourceStatus: "unapproved" | "reviewed";
  readonly systemStatus: "deterministic-only" | "source-grounded-enabled";
}

function compactHexagram(hexagram: ReturnType<typeof getHexagramByPattern>) {
  return Object.freeze({
    id: hexagram.id,
    kingWenNumber: hexagram.kingWenNumber,
    name: hexagram.name,
    names: hexagram.names,
    unicodeSymbol: hexagram.unicodeSymbol,
    pattern: hexagram.pattern,
    upperTrigram: hexagram.upperTrigram.name,
    lowerTrigram: hexagram.lowerTrigram.name,
  });
}

export function lineValuesFromReading(request: ReadingCreate): readonly LineValue[] {
  const lower = TRIGRAMS[request.inputs.lowerTrigram - 1];
  const upper = TRIGRAMS[request.inputs.upperTrigram - 1];
  if (!lower || !upper) throw new Error("INVALID_INPUT");
  const bits = [...lower.lines, ...upper.lines];
  return bits.map((bit, index) => {
    if (index + 1 === request.inputs.changingPosition) return bit ? 9 : 6;
    return bit ? 7 : 8;
  });
}

export function deriveReadingFacts(request: ReadingCreate): CastFacts {
  const lineValues = lineValuesFromReading(request);
  const primaryBits = lineValues.map((value) => (value === 7 || value === 9 ? 1 : 0));
  const changingPositions = lineValues.flatMap((value, index) => (value === 6 || value === 9 ? [index + 1] : []));
  const relatingBits = primaryBits.map((bit, index) => changingPositions.includes(index + 1) ? 1 - bit : bit);
  const primaryPattern = primaryBits.join("");
  const relatingPattern = relatingBits.join("");
  const primary = getHexagramByPattern(primaryPattern);
  const relating = getHexagramByPattern(relatingPattern);
  const normalizedInputs = structuredClone(request.inputs);

  return Object.freeze({
    schemaVersion: "reading-facts@1",
    identifierCatalogVersion: IDENTIFIER_CATALOG_VERSION,
    cast: Object.freeze({
      schemaVersion: "cast@1",
      castingMethod: request.castingMethod,
      lineValues: Object.freeze([...lineValues]),
      changingPositions: Object.freeze(changingPositions),
      primaryPattern,
      relatingPattern,
      normalizedInputs,
    }),
    primary: compactHexagram(primary),
    relating: compactHexagram(relating),
    movingLines: Object.freeze(changingPositions.map((position) => Object.freeze({
      position,
      yinYang: primary.pattern[position - 1] === "1" ? "yang" as const : "yin" as const,
      lineKey: lineKey(primary.pattern, position),
    }))),
    specialLine: null,
    sourceStatus: "unapproved",
    systemStatus: "deterministic-only",
  });
}
