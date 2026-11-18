import { describe, expect, it } from "vitest";
import { mergeSpans } from "./useUnifiedBookings";

describe("mergeSpans", () => {
  it("joins a renewal onto the week before it", () => {
    expect(mergeSpans([["2026-11-19", "2026-11-26"], ["2026-11-11", "2026-11-18"]])).toEqual([["2026-11-11", "2026-11-26"]]);
  });
  it("keeps a gap a gap", () => {
    expect(mergeSpans([["2026-11-02", "2026-11-09"], ["2026-11-12", "2026-11-17"]])).toEqual([["2026-11-02", "2026-11-09"], ["2026-11-12", "2026-11-17"]]);
  });
  it("swallows a duplicate of the row's own dates", () => {
    expect(mergeSpans([["2026-11-10", "2026-11-17"], ["2026-11-10", "2026-11-17"]])).toEqual([["2026-11-10", "2026-11-17"]]);
  });
});
