import { describe, expect, it } from "vitest";
import type { UserNotification } from "@/hooks/useNotifications";
import {
  applyFilter, collapseChains, dayGroup, groupByDay, isBusinessNotification, present, shortTime, stepLabel, tidyText,
} from "./present";

const NOW = new Date(2026, 10, 24, 18, 0); // Nov 24 2026, 6 PM local

let seq = 0;
function n(over: Partial<UserNotification>): UserNotification {
  seq += 1;
  return {
    id: `n${seq}`, recipientUserId: "u", category: "subscription", type: "x", title: "T", body: "",
    isRead: true, isArchived: false, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    ...over,
  };
}

describe("tidyText", () => {
  it("puts every date in one short format", () => {
    expect(tidyText("It runs until 2026-12-04; nothing changes.", NOW)).toBe("It runs until Dec 4; nothing changes.");
    expect(tidyText("ended on November 17, 2026. You can", NOW)).toBe("ended on Nov 17. You can");
    expect(tidyText("until 2027-01-02", NOW)).toBe("until Jan 2, 2027");
  });
  it("un-shouts names but leaves codes and acronyms", () => {
    expect(tidyText("Meal plan for LUKE FRAZIER — $135.00.", NOW)).toBe("Meal plan for Luke Frazier — $135.00.");
    expect(tidyText("with the code BACKB2E437 in USD", NOW)).toBe("with the code BACKB2E437 in USD");
    expect(tidyText("Standard Plan - 3 Times", NOW)).toBe("Standard Plan - 3 Times");
  });
});

describe("time", () => {
  it("groups by calendar day", () => {
    expect(dayGroup(new Date(2026, 10, 24, 1).toISOString(), NOW)).toBe("Today");
    expect(dayGroup(new Date(2026, 10, 23, 23).toISOString(), NOW)).toBe("Yesterday");
    expect(dayGroup(new Date(2026, 10, 17).toISOString(), NOW)).toBe("Earlier");
  });
  it("says it short", () => {
    expect(shortTime(new Date(2026, 10, 24, 17, 35).toISOString(), NOW)).toBe("25m");
    expect(shortTime(new Date(2026, 10, 24, 15, 0).toISOString(), NOW)).toBe("3h");
    expect(shortTime(new Date(2026, 10, 17, 9).toISOString(), NOW)).toBe("Nov 17");
  });
});

describe("chains", () => {
  const sub = { relatedEntityType: "food_subscription", relatedEntityId: "s1" };
  it("folds one plan's lifecycle into one card, newest first", () => {
    const winback = n({ ...sub, type: "reminder_general", title: "Want it back?", metadata: { stage: "winback_7" }, isRead: false });
    const other = n({ type: "provider_new_order", category: "business" });
    const ended = n({ ...sub, type: "subscription_expired", metadata: { stage: "expired" } });
    const tomorrow = n({ ...sub, type: "subscription_expiring_tomorrow", metadata: { stage: "1_day" } });
    const groups = collapseChains([winback, other, ended, tomorrow]);
    expect(groups).toHaveLength(2);
    expect(groups[0].lead).toBe(winback);
    expect(groups[0].earlier.map(stepLabel)).toEqual(["Ended", "Ends tomorrow"]);
    expect(groups[0].isRead).toBe(false);
    expect(groups[0].ids).toHaveLength(3);
  });
  it("keeps unrelated rows apart", () => {
    const a = n({ relatedEntityId: "x", type: "payment_received", category: "payment" });
    const b = n({ relatedEntityId: "x", type: "payment_received", category: "payment" });
    expect(collapseChains([a, b])).toHaveLength(2);
  });
});

describe("present", () => {
  it("gives a renew button to a plan about to end", () => {
    const p = present(n({ type: "subscription_expiring_tomorrow", actionUrl: "/my-subscriptions" }), NOW);
    expect(p.action).toEqual({ label: "Renew", primary: true, url: "/my-subscriptions" });
  });
  it("has no button without a link", () => {
    expect(present(n({ type: "subscription_expiring_tomorrow" }), NOW).action).toBeNull();
  });
  it("tells business from personal", () => {
    expect(isBusinessNotification(n({ category: "business", type: "provider_new_order" }))).toBe(true);
    expect(isBusinessNotification(n({ category: "payout", type: "payout_paid" }))).toBe(true);
    expect(isBusinessNotification(n({ category: "booking", type: "reminder_general", actionUrl: "/my-provider/1?tab=bookings" }))).toBe(true);
    expect(isBusinessNotification(n({ category: "announcement", type: "provider_broadcast" }))).toBe(false);
    expect(isBusinessNotification(n({ category: "reminder", type: "reminder_occurrence" }))).toBe(false);
  });
  it("filters and buckets", () => {
    const list = collapseChains([
      n({ isRead: false }),
      n({ category: "business", type: "provider_new_order", createdAt: new Date(2026, 10, 23, 10).toISOString() }),
    ]);
    expect(applyFilter(list, "unread")).toHaveLength(1);
    expect(applyFilter(list, "business")).toHaveLength(1);
    expect(groupByDay(list, NOW).map((g) => g.day)).toEqual(["Today", "Yesterday"]);
  });
});
