import type { CastFacts } from "../../shared/casting";
import type { AppLocale } from "../i18n";

type CompactHexagram = CastFacts["primary"];

export function hexagramName(hexagram: CompactHexagram, locale: string): string {
  return hexagram.names?.[locale as AppLocale] ?? hexagram.name;
}
