import { addDays, addMonths, addYears, format } from "date-fns";
import type { CheckoutPlan } from "./planCheckoutModel";

/**
 * Where a purchase is written, per service.
 *
 * This is the one thing the unified checkout cannot make uniform yet. A paid
 * subscription lives in its legacy table and everything that reads it —
 * renewals, access verification at the door, the reconcile cron, the
 * provider's own screens — points there. Collapsing the tables is phase F.
 *
 * So the screen is one screen, and this is the seam: four row shapes, built
 * from the same answers, each named after the table it belongs to. When phase
 * F lands, three of these functions go and the fourth stays.
 */

export interface CheckoutAnswers {
  /**
   * The legacy tables keep `user_id` as TEXT — Google logins historically
   * stored the auth id, not a uuid — while `provider_subscriptions` is uuid
   * and rejects anything else with a 22P02 that fails the whole insert. So the
   * caller supplies both and each writer takes the one its table can hold.
   */
  userId: string;
  userUuid: string | null;
  startDate: string;              // yyyy-mm-dd
  periods: number;
  people: number;
  /** Base price, before the payment-method fee. */
  totalCents: number;
  /** What the customer is actually charged. */
  chargedCents: number;
  paymentMethod: string;
  phone: string;
  notes: string;
  customerName: string | null;
  customerEmail: string | null;
  address: string;
  area: string;
  /** Whatever the plan's selection group offered, as chosen. */
  selections: string[];
}

export interface SubscriptionWrite {
  table: string;
  row: Record<string, unknown>;
}

/** The end of `periods` periods of this plan, in the plan's own unit. */
export function endDateOf(plan: CheckoutPlan, startISO: string, periods: number): Date {
  const start = new Date(`${startISO}T00:00:00`);
  const n = Math.max(1, Math.round(periods));
  switch (plan.period) {
    case "weekly":    return addDays(start, 7 * n);
    case "quarterly": return addMonths(start, 3 * n);
    case "yearly":    return addYears(start, n);
    default:          return addMonths(start, n);
  }
}

export function buildSubscriptionWrite(
  plan: CheckoutPlan,
  a: CheckoutAnswers,
  /** Merged over the row — the cart's batch id, a payment reference, a paid status. */
  extra: Record<string, unknown> = {},
): SubscriptionWrite {
  const end = format(endDateOf(plan, a.startDate, a.periods), "yyyy-MM-dd");
  const surcharge = Math.max(0, a.chargedCents - a.totalCents);
  const included = (plan.unitQuantity ?? 0) * Math.max(1, a.periods);

  if (plan.service === "food") {
    return {
      table: "food_subscriptions",
      row: withExtra({
        user_id: a.userId,
        provider_id: plan.providerLegacyId,
        meal_plan_id: plan.subjectPlanId,
        weekly_price_cents: plan.unitCents,
        surcharge_cents: surcharge,
        commitment_weeks: a.periods,
        started_at: a.startDate,
        end_date: end,
        status: "pending",
        payment_status: "pending",
        payment_method: a.paymentMethod,
        customer_name: a.customerName,
        customer_whatsapp: a.phone || null,
        residence: a.area || null,
        delivery_address: a.address || null,
        notes: a.notes || null,
        selected_meals: a.selections.length ? a.selections : null,
      }, extra),
    };
  }

  if (plan.service === "cleaning") {
    return {
      table: "cleaning_subscriptions",
      row: withExtra({
        user_id: a.userId,
        package_id: plan.subjectPlanId,
        start_date: a.startDate,
        end_date: end,
        service_start_date: a.startDate,
        service_end_date: end,
        paid_until: end,
        billing_period_months: a.periods,
        monthly_price_cents: plan.unitCents,
        total_price_cents: a.totalCents,
        surcharge_cents: surcharge,
        // How many visits the period buys. It used to be computed from
        // `cleanings_per_month`; the same number now sits on the plan as a
        // quantity and a noun, so this line does not know what a cleaning is.
        cleanings_remaining: included,
        payment_status: "pending",
        payment_method: a.paymentMethod,
        is_active: false,
        subscription_status: "pending_payment",
        apartment_note: a.address || null,
        customer_whatsapp: a.phone || null,
      }, extra),
    };
  }

  if (plan.service === "beach") {
    return {
      table: "beach_club_subscriptions",
      row: withExtra({
        plan_id: plan.subjectPlanId,
        // The name is snapshotted: a plan can be renamed and the receipt must
        // still say what was bought.
        plan_name: plan.name,
        user_id: a.userId,
        customer_name: a.customerName,
        customer_email: a.customerEmail,
        customer_whatsapp: a.phone || null,
        people: Math.max(1, a.people),
        start_date: a.startDate,
        end_date: end,
        price_per_person_cents: plan.unitCents,
        total_cents: a.totalCents,
        surcharge_cents: surcharge,
        payment_status: "pending",
        payment_method: a.paymentMethod,
        status: "pending",
        notes: a.notes || null,
      }, extra),
    };
  }

  return {
    table: "provider_subscriptions",
    row: withExtra({
      provider_id: plan.providerUniversalId,
      plan_id: plan.universalId,
      user_id: a.userUuid,
      start_date: a.startDate,
      end_date: end,
      price_cents: a.totalCents,
      periods_paid: a.periods,
      payment_status: "pending",
      payment_method: a.paymentMethod,
      status: "pending",
      customer_whatsapp: a.phone || null,
      notes: a.notes || null,
      selections: a.selections.length ? a.selections : null,
      service_address: a.address || null,
      // `provider_subscriptions` has no columns for the plan's name or the
      // processing fee, and a purchase has to survive the plan being renamed.
      metadata: {
        plan_name: plan.name,
        provider_name: plan.providerName,
        period: plan.period,
        periods: a.periods,
        people: plan.pricingMode === "per_person" ? Math.max(1, a.people) : null,
        unit_price_cents: plan.unitCents,
        pricing_mode: plan.pricingMode,
        included_quantity: plan.unitQuantity,
        included_unit: plan.unitLabel,
        customer_name: a.customerName,
        customer_email: a.customerEmail,
        surcharge_cents: surcharge,
        total_charged_cents: a.chargedCents,
      },
    }, extra),
  };
}

const withExtra = (row: Record<string, unknown>, extra: Record<string, unknown>) => ({ ...row, ...extra });
