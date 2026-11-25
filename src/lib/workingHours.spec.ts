import { describe, expect, it } from "vitest";
import { openStatus, openStatusLabel } from "./workingHours";

// 2026-11-25 is a Wednesday.
const at = (hh: number, mm = 0, day = 25) => new Date(2026, 10, day, hh, mm);
const daily = [{ days: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], open: "08:00", close: "20:00" }];
const weekdays = [{ days: ["MO", "TU", "WE", "TH", "FR"], open: "09:00", close: "17:00" }];

describe("openStatus", () => {
  it("is open inside the hours", () => {
    expect(openStatus(daily, at(12))).toEqual({ open: true, until: "20:00" });
    expect(openStatusLabel(openStatus(daily, at(12))!)).toBe("Open until 8:00 PM");
  });
  it("opens later today before opening time", () => {
    expect(openStatusLabel(openStatus(daily, at(7, 30))!)).toBe("Closed · opens 8:00 AM");
  });
  it("opens tomorrow after closing time", () => {
    expect(openStatusLabel(openStatus(daily, at(20))!)).toBe("Closed · opens tomorrow 8:00 AM");
  });
  it("skips closed days", () => {
    // Friday 18:00 → Monday.
    expect(openStatusLabel(openStatus(weekdays, at(18, 0, 27))!)).toBe("Closed · opens Mon 9:00 AM");
  });
  it("handles hours past midnight", () => {
    const night = [{ days: ["WE"], open: "22:00", close: "02:00" }];
    expect(openStatus(night, at(23)).open).toBe(true);
    expect(openStatus(night, at(1, 0, 26)).open).toBe(true);
    expect(openStatus(night, at(3, 0, 26)).open).toBe(false);
  });
  it("says nothing for free-text hours", () => {
    expect(openStatus("By appointment", at(12))).toBeNull();
  });
});
