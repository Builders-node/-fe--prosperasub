import { addDaysISO, addMonthsISO } from "@/lib/timezone";
import { CART_SERVICES, lineTotalCents, type CartItem, type CartService } from "@/lib/cart/cartItem";
import { MEAL_KEYS, type MealKey } from "@/components/food/MealSelectionPicker";

/**
 * Turning cart lines into subscription rows.
 *
 * Each service keeps its own table and its own column names — that is the
 * platform as it stands, and inventing a universal subscriptions table here
 * would mean re-pointing every provider screen, every reminder and every
 * reconcile cron at it. So this file is four small adapters: the same line,
 * four shapes.
 *
 * The rules that are NOT per-service live here once:
 *  • the payment-method fee is recorded separately from the service price;
 *  • a row is written pending the moment the invoice exists and promoted on
 *    payment, so a customer who pays and closes the tab still has their order;
 *  • every row of one checkout shares a batch id.
 */

export interface RowContext {
  userId: string;
  today: string;
  batchId: string;
  paid: boolean;
  paymentMethod: string;
  paymentReference: string | null;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string | null;
  residence: string | null;
  /** Street / apartment. Cleaning cannot be delivered without it. */
  address: string | null;
  notes: string | null;
  /** This line's share of the payment-method fee, in cents. */
  surchargeCents: number;
}

/**
 * `provider_subscriptions.user_id` is a uuid; the three legacy tables store the
 * same thing as text, and some of their rows hold a Google subject id rather
 * than a uuid. Writing a non-uuid into the universal table fails the insert
 * outright, so the cart refuses to check that line out until the real database
 * uuid is known (useUserUuid resolves it by email).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const needsUuidUser = (service: CartService) => service === "plan";
export const isUuid = (value: string | null | undefined) => !!value && UUID_RE.test(value);

/** Which table each service's rows go to. */
export const CART_TABLES: Record<CartService, string> = {
  food: "food_subscriptions",
  cleaning: "cleaning_subscriptions",
  beach: "beach_club_subscriptions",
  plan: "provider_subscriptions",
};

/** The end of a line's service period, given how that service counts periods. */
export function servicePeriodEnd(item: CartItem, startISO: string): string {
  return CART_SERVICES[item.service].periodNoun === "week"
    ? addDaysISO(startISO, item.periods * 7)
    : addMonthsISO(startISO, item.periods);
}

/**
 * One line → one or more rows.
 *
 * Food is the odd one: a portion is a whole separate subscription, because the
 * kitchen cooks and delivers per subscription. Everywhere else quantity is a
 * number ON the row — three people on one beach membership is one membership.
 */
export function buildRows(item: CartItem, ctx: RowContext): Record<string, unknown>[] {
  const base = item.unitPriceCents * item.periods;
  const endISO = servicePeriodEnd(item, ctx.today);

  if (item.service === "food") {
    const perPortionSurcharge = Math.round(ctx.surchargeCents / Math.max(1, item.qty));
    return Array.from({ length: item.qty }, (_, index) => ({
      user_id: ctx.userId,
      provider_id: item.providerId,
      meal_plan_id: item.planId,
      weekly_price_cents: item.unitPriceCents,
      // The remainder rides on the first portion so the rows sum to the fee
      // that was actually charged.
      surcharge_cents: index === 0
        ? ctx.surchargeCents - perPortionSurcharge * (item.qty - 1)
        : perPortionSurcharge,
      commitment_weeks: item.periods,
      started_at: ctx.today,
      end_date: endISO,
      status: ctx.paid ? "active" : "pending",
      payment_status: ctx.paid ? "paid" : "pending",
      payment_method: ctx.paymentMethod,
      payment_reference: ctx.paymentReference,
      periods_paid: 1,
      batch_id: ctx.batchId,
      customer_name: ctx.customerName,
      customer_whatsapp: ctx.customerWhatsapp,
      residence: ctx.residence,
      delivery_address: ctx.address,
      notes: ctx.notes,
      // The kitchen reads this and the cart has no picker, so seed the plan's
      // default: the first `mealsPerDay` meals in canonical day order.
      selected_meals: MEAL_KEYS.slice(
        0, Math.max(1, Math.min(item.mealsPerDay || 3, 3)),
      ) as MealKey[],
    }));
  }

  if (item.service === "cleaning") {
    return [{
      user_id: ctx.userId,
      package_id: item.planId,
      start_date: ctx.today,
      end_date: endISO,
      service_start_date: ctx.today,
      service_end_date: endISO,
      paid_until: endISO,
      billing_period_months: item.periods,
      monthly_price_cents: item.unitPriceCents,
      total_price_cents: base,
      surcharge_cents: ctx.surchargeCents,
      payment_status: ctx.paid ? "paid" : "pending",
      payment_method: ctx.paymentMethod,
      payment_reference: ctx.paymentReference,
      is_active: ctx.paid,
      // Paid but not yet scheduled is a real state with a screen behind it —
      // the customer picks their weekday and time in /services/cleaning/book.
      subscription_status: ctx.paid ? "pending_schedule" : "pending_payment",
      batch_id: ctx.batchId,
      // Required: the cleaner has to know which door. The cart form makes the
      // address mandatory as soon as a cleaning line is in the basket.
      apartment_note: ctx.address ?? "",
      customer_whatsapp: ctx.customerWhatsapp,
    }];
  }

  if (item.service === "beach") {
    return [{
      plan_id: item.planId,
      plan_name: item.planName,
      user_id: ctx.userId,
      customer_name: ctx.customerName,
      customer_email: ctx.customerEmail,
      customer_whatsapp: ctx.customerWhatsapp,
      notes: ctx.notes,
      people: item.qty,
      start_date: ctx.today,
      end_date: endISO,
      price_per_person_cents: item.unitPriceCents,
      total_cents: lineTotalCents(item),
      surcharge_cents: ctx.surchargeCents,
      payment_status: ctx.paid ? "paid" : "pending",
      payment_method: ctx.paymentMethod,
      payment_reference: ctx.paymentReference,
      status: ctx.paid ? "active" : "pending",
      batch_id: ctx.batchId,
    }];
  }

  return [{
    provider_id: item.providerId,
    plan_id: item.planId,
    user_id: ctx.userId,
    start_date: ctx.today,
    end_date: endISO,
    status: ctx.paid ? "active" : "pending",
    payment_status: ctx.paid ? "paid" : "pending",
    payment_method: ctx.paymentMethod,
    payment_reference: ctx.paymentReference,
    customer_whatsapp: ctx.customerWhatsapp,
    notes: ctx.notes,
    batch_id: ctx.batchId,
  }];
}

/**
 * How a paid row is marked, per table. Column names differ, so promoting a
 * pending row after payment cannot be one shared patch.
 */
export function paidPatch(service: CartService, paymentReference: string): Record<string, unknown> {
  if (service === "cleaning") {
    return {
      payment_status: "paid",
      subscription_status: "pending_schedule",
      is_active: true,
      payment_reference: paymentReference,
    };
  }
  return { status: "active", payment_status: "paid", payment_reference: paymentReference };
}
