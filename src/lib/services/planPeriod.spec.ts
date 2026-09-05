import { describe, expect, it } from "vitest";
import {
  endDateFor, normPeriod, periodNoun, termLabel, termLabelFor,
} from "./planPeriod";

/**
 * The period vocabulary is what the whole platform bills by, and the rules in
 * it are choices rather than conventions — a one-time purchase still gets an
 * end date, an unknown period reads as monthly. Both are load-bearing: a null
 * end_date means "never expires" to every lifecycle check downstream, which is
 * the opposite of what "once" means.
 */
describe("normPeriod", () => {
  it("accepts the spellings a human or an old row might carry", () => {
    expect(normPeriod("Monthly")).toBe("monthly");
    expect(normPeriod("one time")).toBe("one_time");
    expect(normPeriod("one-time")).toBe("one_time");
    expect(normPeriod("  WEEKLY ")).toBe("weekly");
  });

  it("falls back to monthly rather than throwing on nonsense", () => {
    expect(normPeriod(null)).toBe("monthly");
    expect(normPeriod(undefined)).toBe("monthly");
    expect(normPeriod("fortnightly")).toBe("monthly");
  });
});

describe("endDateFor", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("advances by the period, times the number bought", () => {
    expect(iso(endDateFor("2026-01-15", "weekly", 2))).toBe("2026-01-29");
    expect(iso(endDateFor("2026-01-15", "monthly", 3))).toBe("2026-04-15");
    expect(iso(endDateFor("2026-01-15", "quarterly", 1))).toBe("2026-04-15");
    expect(iso(endDateFor("2026-01-15", "yearly", 1))).toBe("2027-01-15");
  });

  it("gives a one-time purchase a real end date, not null", () => {
    // A month, deliberately: null would read as "never expires".
    expect(iso(endDateFor("2026-01-15", "one_time"))).toBe("2026-02-15");
  });

  it("never returns a date before the start", () => {
    for (const periods of [0, -3, 0.4]) {
      expect(endDateFor("2026-01-15", "monthly", periods).getTime())
        .toBeGreaterThan(new Date("2026-01-15T00:00:00").getTime());
    }
  });

  it("lands on the end of a short month rather than overflowing", () => {
    // 31 Jan + 1 month has no 31 Feb; date-fns clamps to the 28th.
    expect(iso(endDateFor("2026-01-31", "monthly", 1))).toBe("2026-02-28");
  });
});

describe("what the customer is told they bought", () => {
  it("says the term in the plan's own unit", () => {
    expect(termLabel("weekly")).toBe("1 week");
    expect(termLabelFor("weekly", 3)).toBe("3 weeks");
    expect(termLabelFor("quarterly", 2)).toBe("6 months");
  });

  it("never counts periods for a one-time purchase", () => {
    expect(termLabel("one_time")).toBe("One-time");
    expect(termLabelFor("one_time", 4)).toBe("One-time");
  });

  it("has a noun for every period a price can be quoted in", () => {
    for (const p of ["weekly", "monthly", "quarterly", "yearly"]) {
      expect(periodNoun(p)).toBeTruthy();
    }
  });
});
