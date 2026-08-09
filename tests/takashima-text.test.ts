import { describe, expect, it } from "vitest";
import { parseTakashimaText } from "../src/lib/takashima-text";

describe("Takashima source text formatting", () => {
  it("repairs source line wraps and groups circle-prefixed readings", () => {
    const blocks = parseTakashimaText([
      "九二：遇主于巷，无咎。",
      "〇问时运：值遇乖睽的卦，最近才有了绝好的际遇。〇问",
      "征战：二爻为我军，五爻为敌军，在曲折的里巷相遇。〇问经商：应当遇到一位财主共同经",
      "营。",
    ].join("\n"));

    expect(blocks).toEqual([
      { kind: "paragraph", text: "九二：遇主于巷，无咎。" },
      { kind: "guidance", items: [
        { label: "问时运", text: "值遇乖睽的卦，最近才有了绝好的际遇。" },
        { label: "问征战", text: "二爻为我军，五爻为敌军，在曲折的里巷相遇。" },
        { label: "问经商", text: "应当遇到一位财主共同经营。" },
      ] },
    ]);
  });

  it("preserves list semantics for markdown source lists", () => {
    expect(parseTakashimaText("Initial Nine: text.\n#### Readings\n* Business: Shared purpose.\n* Home: Keep watch.")).toEqual([
      { kind: "paragraph", text: "Initial Nine: text." },
      { kind: "heading", text: "Readings" },
      { kind: "list", items: ["Business: Shared purpose.", "Home: Keep watch."] },
    ]);
  });
});
