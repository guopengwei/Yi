import type { LineValue } from "../../shared/casting";

export function Hexagram({ lineValues, label, compact = false }: { lineValues: readonly LineValue[]; label: string; compact?: boolean }) {
  return <div className={compact ? "hexagram compact" : "hexagram"} role="img" aria-label={label}>
    {lineValues.map((value, index) => {
      const position = index + 1;
      const yin = value === 6 || value === 8;
      const changing = value === 6 || value === 9;
      return <div className={`hex-line ${yin ? "yin" : "yang"} ${changing ? "changing" : ""}`} data-line-position={position} key={position}>
        {yin ? <><span /><span /></> : <span />}
      </div>;
    })}
  </div>;
}

export function lineValuesForPattern(pattern: string): LineValue[] {
  return pattern.split("").map((bit) => bit === "1" ? 7 : 8) as LineValue[];
}
