import { describe, expect, it } from "vitest";
import { englishTranslationIssue } from "../scripts/catalog-language-quality";

describe("catalog language quality", () => {
  it("accepts complete English and a separately quoted source character", () => {
    expect(englishTranslationIssue("Initial Nine: advance with care. Business: wait for the right time.")).toBeNull();
    expect(englishTranslationIssue('The source character "perhaps" (或) marks uncertainty.')).toBeNull();
  });

  it("rejects untranslated Chinese blocks", () => {
    expect(englishTranslationIssue("六二：包容承顺，小人吉祥，大人否塞亨通。商业买卖双方都有利。")).toContain("untranslated Chinese block");
  });

  it("rejects malformed mixed-language tokens and untranslated line labels", () => {
    expect(englishTranslationIssue("There is nothing不利 in proceeding.")).toContain("mixed-language token");
    expect(englishTranslationIssue("九五: The eastern neighbor makes an offering.")).toContain("untranslated Chinese label");
  });
});
