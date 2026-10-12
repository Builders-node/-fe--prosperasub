import { describe, it, expect } from "vitest";
import { buildBookingSeries, droppedCount, dowOf } from "./bookingSeries";
import { addMonthsISO } from "@/lib/timezone";

describe("buildBookingSeries", () => {
  it("books exactly one visit for a one-off", () => {
    expect(buildBookingSeries({ anchor: "2026-10-13", cadence: "once", count: 9 }))
      .toEqual(["2026-10-13"]);
  });

  it("asks for N and returns N", () => {
    for (const cadence of ["daily", "weekly", "biweekly", "monthly"] as const) {
      expect(buildBookingSeries({ anchor: "2026-10-13", cadence, count: 4 }))
        .toHaveLength(4);
    }
  });

  // The reported bug: four visits were created thirty days apart, so the day
  // of the month walked backwards and only the first was anywhere near.
  it("keeps a monthly customer on their day of the month", () => {
    expect(buildBookingSeries({ anchor: "2026-10-13", cadence: "monthly", count: 4 }))
      .toEqual(["2026-10-13", "2026-11-13", "2026-12-13", "2027-01-13"]);
  });

  it("clamps a monthly visit into a shorter month instead of overflowing it", () => {
    expect(addMonthsISO("2027-01-31", 1)).toBe("2027-02-28");
    expect(buildBookingSeries({ anchor: "2026-12-31", cadence: "monthly", count: 3 }))
      .toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("steps weekly and fortnightly in exact weeks", () => {
    expect(buildBookingSeries({ anchor: "2026-10-13", cadence: "weekly", count: 3 }))
      .toEqual(["2026-10-13", "2026-10-20", "2026-10-27"]);
    expect(buildBookingSeries({ anchor: "2026-10-13", cadence: "biweekly", count: 3 }))
      .toEqual(["2026-10-13", "2026-10-27", "2026-11-10"]);
  });

  it("slides a visit off a day the provider doesn't work", () => {
    // Shut on Sundays. 2026-10-18 is a Sunday.
    const open = (d: string) => dowOf(d) !== 0;
    const out = buildBookingSeries({
      anchor: "2026-10-11", cadence: "weekly", count: 2, isWorkingDay: open,
    });
    // The anchor itself is a Sunday, so both visits slide to the Monday.
    expect(out).toEqual(["2026-10-12", "2026-10-19"]);
    expect(out.every(open)).toBe(true);
  });

  it("never collapses two visits onto one day", () => {
    // Only Mondays are worked: a daily-ish weekly series must not stack up.
    const open = (d: string) => dowOf(d) === 1;
    const out = buildBookingSeries({
      anchor: "2026-10-13", cadence: "weekly", count: 4, isWorkingDay: open,
    });
    expect(new Set(out).size).toBe(out.length);
  });

  it("skips, rather than slides, when named weekdays are chosen", () => {
    const out = buildBookingSeries({
      anchor: "2026-10-12", cadence: "weekly", count: 4, weekdays: [1, 4], // Mon + Thu
    });
    expect(out).toEqual(["2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"]);
  });

  it("honours alternate weeks when named weekdays repeat fortnightly", () => {
    const out = buildBookingSeries({
      anchor: "2026-10-12", cadence: "biweekly", count: 4, weekdays: [1, 4],
    });
    expect(out).toEqual(["2026-10-12", "2026-10-15", "2026-10-26", "2026-10-29"]);
  });

  it("drops the days off a daily run rather than inventing them", () => {
    const open = (d: string) => dowOf(d) !== 0 && dowOf(d) !== 6;
    const out = buildBookingSeries({
      anchor: "2026-10-12", cadence: "daily", count: 5, isWorkingDay: open,
    });
    expect(out).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("reports the visits it could not place", () => {
    // The grid ends after the anchor — nothing further can be booked, and the
    // dialog has to say so rather than quietly booking fewer.
    const open = (d: string) => d <= "2026-10-14";
    const input = { anchor: "2026-10-12", cadence: "weekly" as const, count: 4, isWorkingDay: open };
    expect(buildBookingSeries(input)).toEqual(["2026-10-12"]);
    expect(droppedCount(input)).toBe(3);
  });

  it("clamps an absurd count instead of booking a year", () => {
    expect(buildBookingSeries({ anchor: "2026-10-13", cadence: "daily", count: 9999 }))
      .toHaveLength(60);
  });

  it("returns nothing without an anchor date", () => {
    expect(buildBookingSeries({ anchor: "", cadence: "weekly", count: 3 })).toEqual([]);
  });
});
