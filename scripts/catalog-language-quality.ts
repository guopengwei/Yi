const HAN_CHARACTER = /[\u3400-\u9fff]/gu;
const MIXED_TOKEN = /[A-Za-z][\u3400-\u9fff]|[\u3400-\u9fff][A-Za-z]/u;
const UNTRANSLATED_LINE_LABEL = /^[\u3400-\u9fff]{2,}[：:]/mu;

/** Returns a release-blocking reason when an English entry still contains source-language prose. */
export function englishTranslationIssue(text: string): string | null {
  const hanCount = text.match(HAN_CHARACTER)?.length ?? 0;
  const characterCount = [...text].length;
  if (hanCount > 20 || hanCount / characterCount > 0.08) return "contains an untranslated Chinese block";
  if (MIXED_TOKEN.test(text)) return "contains a malformed mixed-language token";
  if (UNTRANSLATED_LINE_LABEL.test(text)) return "starts a line with an untranslated Chinese label";
  return null;
}
