import { describe, expect, it } from "vitest";
import { businessHref, planHref, planSegment, providerHref, publicNoOf, wordsAddress } from "./serviceUrls";

describe("addresses made of words", () => {
  it("joins the words and the number", () => {
    expect(wordsAddress({ slug: "beach-club-membership", public_no: 1042 })).toBe("beach-club-membership-1042");
    expect(wordsAddress({ slug: null, public_no: 1042 })).toBe("1042");
    expect(wordsAddress({ slug: "beach-club-membership", public_no: null })).toBeNull();
    expect(wordsAddress(null)).toBeNull();
  });

  it("links a plan by its words, else by its original id, else its own", () => {
    expect(planHref("clubs", planSegment({ id: "u-1", slug: "beach-club-membership", public_no: 1042 })))
      .toBe("/plans/beach-club-membership-1042");
    expect(planSegment({ id: "6d258149-6cf5-43d8-a0ce-fa60fcc8dfa0", source_plan_id: "legacy-7" })).toBe("legacy-7");
    expect(planSegment({ id: "6d258149-6cf5-43d8-a0ce-fa60fcc8dfa0" })).toBe("6d258149-6cf5-43d8-a0ce-fa60fcc8dfa0");
  });

  it("reads the number back out of an address", () => {
    expect(publicNoOf("beach-club-membership-1042")).toBe(1042);
    expect(publicNoOf("tunets-rio-mare-v-olyvkovii-olii-160h-164389")).toBe(164389);
    expect(publicNoOf("1042")).toBe(1042);
    // Renamed since the link was shared: the number still finds it.
    expect(publicNoOf("old-name-1042")).toBe(1042);
  });

  it("leaves ids alone", () => {
    expect(publicNoOf("6d258149-6cf5-43d8-a0ce-fa60fcc8dfa0")).toBeNull();
    expect(publicNoOf("basic-cleaning")).toBeNull();
    expect(publicNoOf("")).toBeNull();
    expect(publicNoOf(null)).toBeNull();
  });

  it("addresses a business flat, without its service", () => {
    expect(businessHref("scuba-shop")).toBe("/businesses/scuba-shop");
    expect(providerHref("clubs", "scuba-shop")).toBe("/businesses/scuba-shop");
  });
});
