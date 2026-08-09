export type TakashimaTextBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "guidance"; items: TakashimaGuidanceItem[] };

export interface TakashimaGuidanceItem {
  label: string;
  text: string;
}

const CJK_EDGE = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]$/u;
const CJK_START = /^[\p{Script=Han}\u3000-\u303f\uff00-\uffef〇○]/u;

function joinWrappedLine(current: string, next: string): string {
  const separator = CJK_EDGE.test(current) && CJK_START.test(next) ? "" : " ";
  return `${current}${separator}${next}`;
}

function logicalLines(value: string): string[] {
  const lines: string[] = [];
  let prose = "";
  const flushProse = () => {
    if (prose) lines.push(prose);
    prose = "";
  };

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushProse();
      continue;
    }
    if (/^(?:#{1,6}|[*+-])\s+/u.test(line)) {
      flushProse();
      lines.push(line);
      continue;
    }
    prose = prose ? joinWrappedLine(prose, line) : line;
  }
  flushProse();
  return lines;
}

function guidanceItem(value: string): TakashimaGuidanceItem | null {
  const match = value.trim().match(/^([^：:]{1,48})[：:]\s*(.+)$/su);
  return match ? { label: match[1]!.trim(), text: match[2]!.trim() } : null;
}

function circleGuidance(value: string): { preface: string; items: TakashimaGuidanceItem[] } | null {
  const parts = value.split(/[〇○]\s*/u);
  if (parts.length < 2) return null;
  const items = parts.slice(1).map(guidanceItem);
  if (items.some((item) => !item)) return null;
  return { preface: parts[0]!.trim(), items: items as TakashimaGuidanceItem[] };
}

export function parseTakashimaText(value: string): TakashimaTextBlock[] {
  const blocks: TakashimaTextBlock[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ kind: "list", items: listItems });
    listItems = [];
  };

  for (const line of logicalLines(value)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/u);
    const listItem = line.match(/^[*+-]\s+(.+)$/u);
    if (listItem) {
      listItems.push(listItem[1]!.trim());
      continue;
    }
    flushList();
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1]!.trim() });
      continue;
    }
    const guidance = circleGuidance(line);
    if (guidance) {
      if (guidance.preface) blocks.push({ kind: "paragraph", text: guidance.preface });
      blocks.push({ kind: "guidance", items: guidance.items });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line });
  }
  flushList();
  return blocks;
}
