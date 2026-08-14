import { supabaseDb } from "@/integrations/supabase/client";
import { addDays, addMonths, format } from "date-fns";
import { nowHN } from "@/lib/timezone";
import type { CheckoutService, CheckoutPlan } from "./planCheckoutModel";

/**
 * Renewing is not buying again.
 *
 * A purchase inserts a row; a renewal extends the one that exists — server
 * side, with the payment verified against the provider and an idempotency key
 * so a double-tap cannot buy two months. That distinction was only implemented
 * for food, on food's own screen. Cleaning and beach had endpoints nobody
 * called, and a universal plan had no endpoint at all: its "Renew" button
 * opened the checkout and bought a *second* subscription.
 *
 * This module is the part the shared checkout needs to tell the two apart:
 * where the existing subscription lives, what it already said, and which
 * endpoint extends it.
 */

/** What the renewal is prefilled from — the answers the customer already gave. */
export interface RenewalSubject {
  id: string;
  service: CheckoutService;
  /** Where the current period ends. The renewal starts the day after. */
  currentEnd: string | null;
  /** Only the beach needs this: its term is the span it was sold for. */
  currentStart: string | null;
  status: string;
  /** The term that was bought. A renewal buys the same one — see below. */
  periods: number;
  people: number;
  phone: string;
  notes: string;
  address: string;
  area: string;
  selections: string[];
}

const TABLE: Record<CheckoutService, string> = {
  food: "food_subscriptions",
  cleaning: "cleaning_subscriptions",
  beach: "beach_club_subscriptions",
  universal: "provider_subscriptions",
};

/** All four take the same payload; only the path differs. */
export function renewalEndpoint(service: CheckoutService, subId: string): string {
  switch (service) {
    case "food":     return `/account/food/subscriptions/${subId}/renew`;
    case "cleaning": return `/account/cleaning/subscriptions/${subId}/renew`;
    case "beach":    return `/account/beach/subscriptions/${subId}/renew`;
    default:         return `/account/plan/subscriptions/${subId}/renew`;
  }
}

const str = (v: unknown) => (v == null ? "" : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const date = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export async function fetchRenewalSubject(
  service: CheckoutService,
  subId: string,
): Promise<RenewalSubject | null> {
  const { data, error } = await supabaseDb
    .from(TABLE[service])
    .select("*")
    .eq("id", subId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, any>;

  const base = {
    id: subId,
    service,
    people: 1,
    area: "",
    selections: [] as string[],
    currentStart: date(r.start_date ?? r.started_at),
    currentEnd: date(r.end_date),
  };

  if (service === "food") {
    return {
      ...base,
      status: str(r.status || r.payment_status),
      periods: Math.max(1, Number(r.commitment_weeks) || 1),
      phone: str(r.customer_whatsapp),
      notes: str(r.notes),
      address: str(r.delivery_address),
      area: str(r.residence),
      selections: arr(r.selected_meals),
    };
  }
  if (service === "cleaning") {
    return {
      ...base,
      status: str(r.subscription_status),
      periods: Math.max(1, Number(r.billing_period_months) || 1),
      phone: str(r.customer_whatsapp),
      notes: "",
      address: str(r.apartment_note),
    };
  }
  if (service === "beach") {
    return {
      ...base,
      status: str(r.status),
      periods: 1,
      people: Math.max(1, Number(r.people) || 1),
      phone: str(r.customer_whatsapp),
      notes: str(r.notes),
      address: "",
    };
  }
  return {
    ...base,
    status: str(r.status),
    periods: Math.max(1, Number(r.periods_paid) || 1),
    people: Math.max(1, Number(r.metadata?.people) || 1),
    phone: str(r.customer_whatsapp),
    notes: str(r.notes),
    address: str(r.service_address),
    selections: arr(r.selections),
  };
}

/**
 * The dates the server will land on, computed the same way here so the customer
 * is not shown one period and charged for another.
 *
 * Continuous, not from today: renewing early must not cost the customer the
 * days they already paid for, and renewing late must not back-date a period
 * they never had.
 */
export function renewalWindow(plan: CheckoutPlan, subject: RenewalSubject) {
  const today = format(nowHN(), "yyyy-MM-dd");
  const dayAfterEnd = subject.currentEnd
    ? format(addDays(new Date(`${subject.currentEnd}T00:00:00`), 1), "yyyy-MM-dd")
    : today;
  const start = dayAfterEnd > today ? dayAfterEnd : today;

  const n = Math.max(1, subject.periods);
  const from = new Date(`${start}T00:00:00`);

  // The beach has no term column — its membership runs for however many days it
  // was sold for, and the server renews by that same span. Adding a month here
  // instead would print an end date the server disagrees with.
  if (plan.service === "beach") {
    const span = subject.currentStart && subject.currentEnd
      ? Math.max(1, Math.round(
          (Date.parse(`${subject.currentEnd}T00:00:00Z`) - Date.parse(`${subject.currentStart}T00:00:00Z`)) / 86_400_000,
        ))
      : 30;
    return { start, end: addDays(from, span) };
  }

  const end =
    plan.period === "weekly"    ? addDays(from, 7 * n)
    : plan.period === "quarterly" ? addMonths(from, 3 * n)
    : plan.period === "yearly"    ? addMonths(from, 12 * n)
    : addMonths(from, n);

  return { start, end };
}
