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
  if (request.castingMethod === "three-number@1") {
    const lower = TRIGRAMS[request.inputs.lowerTrigram - 1];
    const upper = TRIGRAMS[request.inputs.upperTrigram - 1];
    if (!lower || !upper) throw new Error("INVALID_INPUT");
    const bits = [...lower.lines, ...upper.lines];
    return bits.map((bit, index) => {
      if (index + 1 === request.inputs.changingPosition) return bit ? 9 : 6;
      return bit ? 7 : 8;
    });
  }
  if (request.castingMethod === "three-coin@1") {
    return request.inputs.throws.map((coinThrow) =>
      coinThrow.reduce<number>((sum, face) => sum + (face === "heads" ? 3 : 2), 0),
    ) as LineValue[];
  }
  return Object.freeze([...request.inputs.lineValues]);
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
  const normalizedInputs = request.castingMethod === "secure-random@1"
    ? { reviewed: true }
    : structuredClone(request.inputs);
  const specialLine = changingPositions.length === 6 && primary.kingWenNumber === 1
    ? { lineKey: "用九" as const }
    : changingPositions.length === 6 && primary.kingWenNumber === 2
      ? { lineKey: "用六" as const }
      : null;

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
      ...(request.castingMethod === "secure-random@1" ? { entropyCommitment: request.inputs.entropyCommitment } : {}),
    }),
    primary: compactHexagram(primary),
    relating: compactHexagram(relating),
    movingLines: Object.freeze(changingPositions.map((position) => Object.freeze({
      position,
      yinYang: primary.pattern[position - 1] === "1" ? "yang" as const : "yin" as const,
      lineKey: lineKey(primary.pattern, position),
    }))),
    specialLine,
    sourceStatus: "unapproved",
    systemStatus: "deterministic-only",
  });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createSecureRandomDraft(
  getRandomValues: (array: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (array) => crypto.getRandomValues(array),
): Promise<{ lineValues: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]; entropyCommitment: string; reviewed: true }> {
  const retained: number[] = [];
  const values: LineValue[] = [];
  for (let batch = 0; values.length < 6 && batch < 8; batch += 1) {
    const bytes = getRandomValues(new Uint8Array(32));
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error("RANDOM_FAILED");
    retained.push(...bytes);
    for (const byte of bytes) {
      if (byte < 252 && values.length < 6) values.push((6 + (byte % 4)) as LineValue);
    }
  }
  if (values.length !== 6) throw new Error("RANDOM_FAILED");
  const domain = new TextEncoder().encode("Yi secure-random@1");
  const material = new Uint8Array(domain.length + retained.length + values.length);
  material.set(domain);
  material.set(retained, domain.length);
  material.set(values, domain.length + retained.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  material.fill(0);
  retained.fill(0);
  return {
    lineValues: values as [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue],
    entropyCommitment: `random-v1:${bytesToBase64Url(digest)}`,
    reviewed: true,
  };
}
