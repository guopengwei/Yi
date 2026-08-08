import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hexagram, lineValuesForPattern } from "../src/components/Hexagram";

describe("hexagram line order", () => {
  it("keeps line data in bottom-to-top order for visual stacking", () => {
    const markup = renderToStaticMarkup(
      Hexagram({ lineValues: [7, 8, 9, 6, 7, 8], label: "Test hexagram" }),
    );

    expect([...markup.matchAll(/data-line-position="(\d)"/g)].map((match) => Number(match[1])))
      .toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("preserves bottom-up patterns so the lower trigram precedes the upper trigram", () => {
    expect(lineValuesForPattern("100011")).toEqual([7, 8, 8, 8, 7, 7]);
  });
});
