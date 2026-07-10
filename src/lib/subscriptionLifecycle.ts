/**
 * Effective subscription status.
 *
 * The `status` column in each service table is a lagging indicator — a daily
 * cron flips "active" → "expired" once `end_date` has passed. Between the
 * expiration and the next cron run, the row still reads as active in DB, which
 * misleads admin lists and (worse) causes today's delivery manifest to include
 * a subscription that has actually ended.
 *
 * These helpers derive the *effective* status client-side by combining the
 * stored status with `end_date` (or the service's equivalent expiry field) vs.
 * today in Honduras. The cron still owns persistence; the UI just doesn't wait
 * for it.
 */

import { todayHN } from "./timezone";

export type FoodSubStatus = "pending" | "active" | "paused" | "cancelled" | "expired";

/** Food-subscription lifecycle — end_date is authoritative and inclusive. */
export function effectiveFoodStatus(
  sub: { status?: string | null; end_date?: string | null } | null | undefined,
  today: string = todayHN(),
): FoodSubStatus {
  const raw = (sub?.status ?? "").toLowerCase() as FoodSubStatus;
  if (!sub) return "cancelled";
  if (raw === "active" && sub.end_date && String(sub.end_date).slice(0, 10) < today) {
    return "expired";
  }
  return (raw || "active") as FoodSubStatus;
}

/** True when today's / a future date's delivery manifest should include this sub. */
export function isFoodDeliverable(
  sub: { status?: string | null; end_date?: string | null; started_at?: string | null } | null | undefined,
  date: string,
  today: string = todayHN(),
): boolean {
  if (!sub) return false;
  if (effectiveFoodStatus(sub, today) !== "active") return false;
  if (sub.started_at && String(sub.started_at).slice(0, 10) > date) return false;
  if (sub.end_date && String(sub.end_date).slice(0, 10) < date) return false;
  return true;
}

/**
 * Cleaning-subscription lifecycle — checks the strongest expiry field available
 * (`service_end_date` > `end_date` > `paid_until`).
 */
export function effectiveCleaningStatus(
  sub: {
    subscription_status?: string | null;
    service_end_date?: string | null;
    end_date?: string | null;
    paid_until?: string | null;
    is_active?: boolean | null;
  } | null | undefined,
  today: string = todayHN(),
): string {
  if (!sub) return "cancelled";
  const raw = (sub.subscription_status ?? "").toLowerCase();
  if (raw !== "active") return raw || "cancelled";
  const expiry =
    sub.service_end_date ||
    sub.end_date ||
    sub.paid_until ||
    null;
  if (expiry && String(expiry).slice(0, 10) < today) return "expired";
  return "active";
}

/** Beach-club subscription lifecycle (end_date-driven). */
export function effectiveBeachStatus(
  sub: { status?: string | null; end_date?: string | null } | null | undefined,
  today: string = todayHN(),
): string {
  if (!sub) return "cancelled";
  const raw = (sub.status ?? "").toLowerCase();
  if (raw === "active" && sub.end_date && String(sub.end_date).slice(0, 10) < today) {
    return "expired";
  }
  return raw || "active";
}
