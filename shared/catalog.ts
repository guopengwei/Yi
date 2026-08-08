export const CATALOG_SCHEMA_VERSION = "yi-source-catalog@1" as const;
export const IDENTIFIER_CATALOG_VERSION = "king-wen-identifiers@1" as const;

export type Locale = "zh-HK" | "zh-CN" | "en";
export type YinYang = "yin" | "yang";

export interface Trigram {
  readonly number: number;
  readonly name: string;
  readonly nature: string;
  readonly symbol: string;
  readonly lines: readonly [number, number, number];
}

export const TRIGRAMS: readonly Trigram[] = Object.freeze([
  { number: 1, name: "乾", nature: "天", symbol: "☰", lines: [1, 1, 1] },
  { number: 2, name: "兌", nature: "澤", symbol: "☱", lines: [1, 1, 0] },
  { number: 3, name: "離", nature: "火", symbol: "☲", lines: [1, 0, 1] },
  { number: 4, name: "震", nature: "雷", symbol: "☳", lines: [1, 0, 0] },
  { number: 5, name: "巽", nature: "風", symbol: "☴", lines: [0, 1, 1] },
  { number: 6, name: "坎", nature: "水", symbol: "☵", lines: [0, 1, 0] },
  { number: 7, name: "艮", nature: "山", symbol: "☶", lines: [0, 0, 1] },
  { number: 8, name: "坤", nature: "地", symbol: "☷", lines: [0, 0, 0] },
] as const);

export const KING_WEN_NAMES = Object.freeze([
  "乾為天", "坤為地", "水雷屯", "山水蒙", "水天需", "天水訟", "地水師", "水地比",
  "風天小畜", "天澤履", "地天泰", "天地否", "天火同人", "火天大有", "地山謙", "雷地豫",
  "澤雷隨", "山風蠱", "地澤臨", "風地觀", "火雷噬嗑", "山火賁", "山地剝", "地雷復",
  "天雷無妄", "山天大畜", "山雷頤", "澤風大過", "坎為水", "離為火", "澤山咸", "雷風恆",
  "天山遯", "雷天大壯", "火地晉", "地火明夷", "風火家人", "火澤睽", "水山蹇", "雷水解",
  "山澤損", "風雷益", "澤天夬", "天風姤", "澤地萃", "地風升", "澤水困", "水風井",
  "澤火革", "火風鼎", "震為雷", "艮為山", "風山漸", "雷澤歸妹", "雷火豐", "火山旅",
  "巽為風", "兌為澤", "風水渙", "水澤節", "風澤中孚", "雷山小過", "水火既濟", "火水未濟",
] as const);

export const KING_WEN_NAMES_ZH_CN = Object.freeze([
  "乾为天", "坤为地", "水雷屯", "山水蒙", "水天需", "天水讼", "地水师", "水地比",
  "风天小畜", "天泽履", "地天泰", "天地否", "天火同人", "火天大有", "地山谦", "雷地豫",
  "泽雷随", "山风蛊", "地泽临", "风地观", "火雷噬嗑", "山火贲", "山地剥", "地雷复",
  "天雷无妄", "山天大畜", "山雷颐", "泽风大过", "坎为水", "离为火", "泽山咸", "雷风恒",
  "天山遁", "雷天大壮", "火地晋", "地火明夷", "风火家人", "火泽睽", "水山蹇", "雷水解",
  "山泽损", "风雷益", "泽天夬", "天风姤", "泽地萃", "地风升", "泽水困", "水风井",
  "泽火革", "火风鼎", "震为雷", "艮为山", "风山渐", "雷泽归妹", "雷火丰", "火山旅",
  "巽为风", "兑为泽", "风水涣", "水泽节", "风泽中孚", "雷山小过", "水火既济", "火水未济",
] as const);

export const KING_WEN_NAMES_EN = Object.freeze([
  "Qian · Creative Sky", "Kun · Receptive Earth", "Zhun · Beginning", "Meng · Learning", "Xu · Waiting", "Song · Conflict", "Shi · The Army", "Bi · Union",
  "Xiao Chu · Small Restraint", "Lü · Treading", "Tai · Peace", "Pi · Standstill", "Tong Ren · Fellowship", "Da You · Great Possession", "Qian · Modesty", "Yu · Enthusiasm",
  "Sui · Following", "Gu · Repair", "Lin · Approach", "Guan · Contemplation", "Shi He · Biting Through", "Bi · Grace", "Bo · Splitting Apart", "Fu · Return",
  "Wu Wang · Innocence", "Da Chu · Great Restraint", "Yi · Nourishment", "Da Guo · Great Exceeding", "Kan · Deep Water", "Li · Clinging Fire", "Xian · Influence", "Heng · Duration",
  "Dun · Retreat", "Da Zhuang · Great Power", "Jin · Progress", "Ming Yi · Darkened Light", "Jia Ren · The Family", "Kui · Opposition", "Jian · Obstruction", "Xie · Release",
  "Sun · Decrease", "Yi · Increase", "Guai · Breakthrough", "Gou · Encounter", "Cui · Gathering", "Sheng · Rising", "Kun · Oppression", "Jing · The Well",
  "Ge · Revolution", "Ding · The Cauldron", "Zhen · Arousing Thunder", "Gen · Still Mountain", "Jian · Development", "Gui Mei · Marrying Maiden", "Feng · Abundance", "Lü · The Wanderer",
  "Xun · Gentle Wind", "Dui · Joyous Lake", "Huan · Dispersion", "Jie · Limitation", "Zhong Fu · Inner Truth", "Xiao Guo · Small Exceeding", "Ji Ji · After Completion", "Wei Ji · Before Completion",
] as const);

// Immutable King Wen identifiers. Every pattern is bottom-to-top.
export const KING_WEN_PATTERNS = Object.freeze([
  "111111", "000000", "100010", "010001", "111010", "010111", "010000", "000010",
  "111011", "110111", "111000", "000111", "101111", "111101", "001000", "000100",
  "100110", "011001", "110000", "000011", "100101", "101001", "000001", "100000",
  "100111", "111001", "100001", "011110", "010010", "101101", "001110", "011100",
  "001111", "111100", "000101", "101000", "101011", "110101", "001010", "010100",
  "110001", "100011", "111110", "011111", "000110", "011000", "010110", "011010",
  "101110", "011101", "100100", "001001", "001011", "110100", "101100", "001101",
  "011011", "110110", "010011", "110010", "110011", "001100", "101010", "010101",
] as const);

export interface HexagramIdentifier {
  readonly id: string;
  readonly kingWenNumber: number;
  readonly name: string;
  readonly names: Readonly<Record<Locale, string>>;
  readonly unicodeSymbol: string;
  readonly pattern: string;
  readonly lowerTrigram: Trigram;
  readonly upperTrigram: Trigram;
}

const trigramByPattern = new Map(TRIGRAMS.map((trigram) => [trigram.lines.join(""), trigram]));

export const IDENTIFIER_CATALOG: readonly HexagramIdentifier[] = Object.freeze(
  KING_WEN_PATTERNS.map((pattern, index) => {
    const lowerTrigram = trigramByPattern.get(pattern.slice(0, 3));
    const upperTrigram = trigramByPattern.get(pattern.slice(3));
    if (!lowerTrigram || !upperTrigram) throw new Error(`Invalid King Wen pattern ${pattern}`);
    return Object.freeze({
      id: `kw-${String(index + 1).padStart(2, "0")}`,
      kingWenNumber: index + 1,
      name: KING_WEN_NAMES[index] ?? `第${index + 1}卦`,
      names: Object.freeze({
        "zh-HK": KING_WEN_NAMES[index] ?? `第${index + 1}卦`,
        "zh-CN": KING_WEN_NAMES_ZH_CN[index] ?? `第${index + 1}卦`,
        en: KING_WEN_NAMES_EN[index] ?? `Hexagram ${index + 1}`,
      }),
      unicodeSymbol: String.fromCodePoint(0x4dc0 + index),
      pattern,
      lowerTrigram,
      upperTrigram,
    });
  }),
);

const identifierByPattern = new Map(IDENTIFIER_CATALOG.map((entry) => [entry.pattern, entry]));

export function getHexagramByPattern(pattern: string): HexagramIdentifier {
  const value = identifierByPattern.get(pattern);
  if (!value) throw new Error(`Unknown hexagram pattern: ${pattern}`);
  return value;
}

export function lineKey(pattern: string, position: number): string {
  const bit = pattern[position - 1];
  if ((bit !== "0" && bit !== "1") || position < 1 || position > 6) throw new Error("Invalid line");
  const positionLabel = ["初", "二", "三", "四", "五", "上"][position - 1];
  const stem = bit === "1" ? "九" : "六";
  return position === 1 || position === 6 ? `${positionLabel}${stem}` : `${stem}${positionLabel}`;
}
