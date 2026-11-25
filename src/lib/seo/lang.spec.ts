import { describe, expect, it } from "vitest";
import { isBilingual, langPath, splitLang } from "./lang";
import { GUIDES } from "./guides";
import { serviceSeo } from "./serviceSeo";

describe("Spanish addresses", () => {
  it("splits /es off a path", () => {
    expect(splitLang("/es/services/food")).toEqual({ lang: "es", path: "/services/food" });
    expect(splitLang("/es")).toEqual({ lang: "es", path: "/discovery" });
    expect(splitLang("/services/food")).toEqual({ lang: "en", path: "/services/food" });
    // A word that merely starts with "es" is not Spanish.
    expect(splitLang("/estates")).toEqual({ lang: "en", path: "/estates" });
  });

  it("knows which pages exist in both languages", () => {
    expect(isBilingual("/services/food")).toBe(true);
    expect(isBilingual("/guides/moving-to-roatan")).toBe(true);
    expect(isBilingual("/plans/lunch-12")).toBe(false);
    expect(langPath("/vehicles", "es")).toBe("/es/vehicles");
    expect(langPath("/vehicles", "en")).toBe("/vehicles");
  });

  it("every guide and service page has both languages", () => {
    for (const g of GUIDES) {
      expect(g.es.sections.length).toBe(g.en.sections.length);
      expect(g.es.title).not.toBe(g.en.title);
    }
    for (const key of ["food", "cleaning", "clubs", "healthcare", "entertainment", "pantry", "vehicles"]) {
      expect(serviceSeo(key, "es")!.faq.length).toBe(serviceSeo(key, "en")!.faq.length);
    }
  });
});
