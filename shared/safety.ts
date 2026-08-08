import type { Locale } from "./catalog";
import type { ReadingQuestion } from "./contracts";

export type SafetyCategory = "self-harm" | "medical" | "pregnancy" | "financial" | "legal" | "abuse-or-coercion";

const rules: readonly { category: SafetyCategory; patterns: readonly RegExp[] }[] = [
  { category: "self-harm", patterns: [/自殺|自杀|自殘|自残|不想活|結束生命|结束生命|活不下去|suicid|self[- ]?harm|kill myself|end my life/i] },
  { category: "medical", patterns: [/癌|腫瘤|肿瘤|疾病|確診|确诊|治療|治疗|用藥|用药|手術|手术|醫生|医生|症狀|症状|diagnos|disease|cancer|medicine|surgery|symptom|doctor/i] },
  { category: "pregnancy", patterns: [/懷孕|怀孕|孕期|胎兒|胎儿|生男|生女|流產|流产|分娩|pregnan|fetus|miscarriage|fetal sex/i] },
  { category: "financial", patterns: [/股票|期貨|期货|投資|投资|買入|买入|賣出|卖出|貸款|贷款|債務|债务|破產|破产|幣價|币价|梭哈|stock|crypto|invest|bankrupt|loan|debt|all[- ]?in/i] },
  { category: "legal", patterns: [/起訴|起诉|判決|判决|坐牢|律師|律师|合同|違法|违法|有罪|無罪|无罪|拘留|離婚|离婚|lawsuit|legal|lawyer|guilty|contract|prison|divorce/i] },
  { category: "abuse-or-coercion", patterns: [/家暴|家庭暴力|毆打|殴打|威脅|威胁|恐嚇|恐吓|控制我|逼我|強迫|强迫|性侵|虐待|abuse|coerc|threat|hit me|controls me|sexual assault/i] },
] as const;

const messages: Record<Locale, Record<SafetyCategory, string>> = {
  "zh-HK": {
    "self-harm": "如果你正處於即時危險，請立即聯絡當地緊急服務，並盡快告訴一位你信任的人。本工具不能評估或處理危機。",
    medical: "卦象不能用於診斷、預後或治療決定。請向合資格醫療專業人員說明你的情況。",
    pregnancy: "卦象不能判斷懷孕結果、胎兒性別或醫療風險。請諮詢合資格醫療專業人員。",
    financial: "此結果不是投資、信貸或稅務建議，也不能預測價格。請依據可核實資料及專業意見決策。",
    legal: "此結果不能得出法律結論或代替律師意見。如需保障權利或遵守時限，請儘快諮詢合資格法律專業人員。",
    "abuse-or-coercion": "暴力與強迫不是你的錯。如果當下不安全，請先到安全地方並聯絡緊急服務或可信任的支援機構。",
  },
  "zh-CN": {
    "self-harm": "如果你正处于即时危险，请立即联系当地紧急服务，并尽快告诉一位你信任的人。本工具不能评估或处理危机。",
    medical: "卦象不能用于诊断、预后或治疗决定。请向合格医疗专业人员说明你的情况。",
    pregnancy: "卦象不能判断怀孕结果、胎儿性别或医疗风险。请咨询合格医疗专业人员。",
    financial: "此结果不是投资、信贷或税务建议，也不能预测价格。请依据可核实资料及专业意见决策。",
    legal: "此结果不能得出法律结论或代替律师意见。如需保障权利或遵守时限，请尽快咨询合格法律专业人员。",
    "abuse-or-coercion": "暴力与强迫不是你的错。如果当下不安全，请先到安全地方并联系紧急服务或可信任的支持机构。",
  },
  en: {
    "self-harm": "If you may be in immediate danger, contact local emergency services now and tell someone you trust. This tool cannot assess or handle a crisis.",
    medical: "A reading cannot diagnose, predict outcomes, or guide treatment. Please speak with a qualified medical professional.",
    pregnancy: "A reading cannot determine pregnancy outcomes, fetal sex, or medical risk. Please consult a qualified medical professional.",
    financial: "This is not investment, credit, or tax advice and cannot predict prices. Decide using verifiable information and qualified advice.",
    legal: "This cannot establish a legal conclusion or replace a lawyer. Seek qualified legal advice promptly when rights or deadlines are involved.",
    "abuse-or-coercion": "Violence and coercion are not your fault. If you are unsafe, move to safety and contact emergency services or a trusted support organization.",
  },
};

export function routeSafety(question: ReadingQuestion, locale: Locale = "zh-HK") {
  if (question.kind === "none") return Object.freeze({ routed: false, categories: [] as SafetyCategory[], limitations: [] as string[], providerTransmission: "not-requested" as const });
  const categories = rules.filter((rule) => rule.patterns.some((pattern) => pattern.test(question.text))).map((rule) => rule.category);
  return Object.freeze({
    routed: categories.length > 0,
    categories: Object.freeze(categories),
    limitations: Object.freeze(categories.map((category) => messages[locale][category])),
    providerTransmission: categories.length > 0 ? "blocked" as const : "eligible" as const,
  });
}
