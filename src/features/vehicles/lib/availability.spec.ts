import { describe, expect, it } from "vitest";
import {
  overlapsHeld,
  PENDING_NO_REFERENCE_HOLD_MINUTES,
  PENDING_WITH_REFERENCE_HOLD_HOURS,
} from "./availability";

/**
 * Which bookings hold a car.
 *
 * This module and the database disagreed once, and it cost a bookable car:
 * the calendar released an abandoned checkout after twenty minutes while the
 * exclusion constraint kept holding those dates, so the page offered days
 * Postgres was always going to refuse. The overlap rule below is what the
 * calendar draws from; the hold windows are what the release path uses to
 * decide a row is dead.
 */
describe("overlapsHeld", () => {
  const held = [{ start: "2026-09-10", end: "2026-09-12" }];

  it("refuses a range that touches a held one at either edge", () => {
    // Inclusive on both ends: a car handed back on the 12th is not free that day.
    expect(overlapsHeld("2026-09-12", "2026-09-14", held)).toBe(true);
    expect(overlapsHeld("2026-09-08", "2026-09-10", held)).toBe(true);
  });

  it("allows the days either side of a hold", () => {
    expect(overlapsHeld("2026-09-13", "2026-09-15", held)).toBe(false);
    expect(overlapsHeld("2026-09-07", "2026-09-09", held)).toBe(false);
  });

  it("catches a range that swallows the hold entirely", () => {
    expect(overlapsHeld("2026-09-01", "2026-09-30", held)).toBe(true);
  });

  it("is free when nothing is held", () => {
    expect(overlapsHeld("2026-09-10", "2026-09-12", [])).toBe(false);
  });
});

describe("hold windows", () => {
  it("keeps an invoiced checkout far longer than an abandoned one", () => {
    // A customer who reached an invoice may be waiting on a slow on-chain
    // confirmation; one who never did is just gone.
    expect(PENDING_WITH_REFERENCE_HOLD_HOURS * 60).toBeGreaterThan(PENDING_NO_REFERENCE_HOLD_MINUTES);
  });

  it("holds an invoiced booking at least as long as the server retries it", () => {
    expect(PENDING_WITH_REFERENCE_HOLD_HOURS).toBeGreaterThanOrEqual(24);
  });
});
