import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Coffee as CoffeeIcon } from "lucide-react";
import { CategoryBannerArt, hasCategoryBannerArt } from "./categoryBannerArt";

/**
 * The home page's orange category cards are always drawn, never a photo.
 * Coffee once showed a roastery photo beside three drawings; these guard
 * against that coming back.
 */
describe("category banner art", () => {
  it("has its own drawing for every live category", () => {
    for (const key of [
      "apartment_cleaning", "beach_membership", "car_wash", "coffee",
      "diving", "healthcare", "massage", "meal_subscription",
    ]) {
      expect(hasCategoryBannerArt(key), key).toBe(true);
    }
  });

  it("still draws something for a category it has never heard of", () => {
    const html = renderToStaticMarkup(
      createElement(CategoryBannerArt, { categoryKey: "brand_new_category", icon: CoffeeIcon }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<circle");
    expect(html).not.toContain("<img");
  });

  it("the carousel has no photo path", () => {
    const src = readFileSync(path.resolve(__dirname, "CategoryCarousel.tsx"), "utf8");
    expect(src).not.toMatch(/<img\b/);
    expect(src).not.toMatch(/\bitem\.imageUrl\b(?!\s+is deliberately)/);
  });
});
