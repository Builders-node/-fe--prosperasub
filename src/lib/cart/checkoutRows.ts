import { addDaysISO, addMonthsISO } from "@/lib/timezone";
import { CART_SERVICES, lineTotalCents, type CartItem, type CartService } from "@/lib/cart/cartItem";
import { MEAL_KEYS, type MealKey } from "@/components/food/MealSelectionPicker";
import { buildSubscriptionWrite, type CheckoutAnswers } from "@/lib/checkout/subscriptionWriter";
import type { CheckoutPlan } from "@/lib/checkout/planCheckoutModel";

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
/**
 * A cart line becomes the same row a single-item checkout would write.
 *
 * These were four adapters of their own, and the copies drifted exactly as
 * copies do: a cleaning subscription bought from the cart was written without
 * `cleanings_remaining`, so a customer who paid for four visits owned a
 * subscription that said none were left. One builder, one shape, whether the
 * basket holds one thing or five.
 *
 * `plan` is resolved by the caller because it is a query and this is not.
 */
export function buildRows(item: CartItem, plan: CheckoutPlan, ctx: RowContext): Record<string, unknown>[] {
  const endISO = servicePeriodEnd(item, ctx.today);
  const paidBits = {
    batch_id: ctx.batchId,
    payment_reference: ctx.paymentReference,
    ...(ctx.paid ? paidPatch(item.service, ctx.paymentReference ?? "") : {}),
  };

  const answers = (surcharge: number, selections: string[]): CheckoutAnswers => ({
    userId: ctx.userId,
    userUuid: isUuid(ctx.userId) ? ctx.userId : null,
    startDate: ctx.today,
    periods: item.periods,
    people: item.qty,
    totalCents: lineTotalCents(item),
    chargedCents: lineTotalCents(item) + surcharge,
    paymentMethod: ctx.paymentMethod,
    phone: ctx.customerWhatsapp,
    notes: ctx.notes ?? "",
    customerName: ctx.customerName,
    customerEmail: ctx.customerEmail,
    address: ctx.address ?? "",
    area: ctx.residence ?? "",
    selections,
  });

  // Food is the one service where a quantity means separate subscriptions
  // rather than a bigger one — two portions are two people eating.
  if (item.service === "food") {
    const per = Math.round(ctx.surchargeCents / Math.max(1, item.qty));
    const meals = MEAL_KEYS.slice(0, Math.max(1, Math.min(item.mealsPerDay || 3, 3))) as MealKey[];
    return Array.from({ length: item.qty }, (_, index) => {
      // The remainder rides on the first portion so the rows sum to the fee
      // that was actually charged.
      const surcharge = index === 0 ? ctx.surchargeCents - per * (item.qty - 1) : per;
      return buildSubscriptionWrite(plan, { ...answers(surcharge, meals), people: 1 }, paidBits).row;
    });
  }

  return [buildSubscriptionWrite(plan, answers(ctx.surchargeCents, []), paidBits).row];
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
