/**
 * What a cart line is, now that it isn't only food.
 *
 * The cart was written for one service: a line was a meal plan, its period was
 * weeks, its quantity was portions, and checkout inserted into
 * `food_subscriptions`. Everything else on the platform — cleaning, the beach
 * membership, a universal plan — sent the customer straight to its own
 * checkout, so buying a cleaning plan and a meal plan meant paying twice.
 *
 * A line now says which service it belongs to, and the service decides three
 * things: what a period is, what a quantity means, and which table the row
 * lands in. Everything else — the form, the payment, the surcharge split — is
 * shared.
 *
 * Cars are deliberately absent. A rental holds specific dates on a specific
 * car, and a cart is a place things sit for a while; two customers with the
 * same car in their carts would both be told yes. Rentals keep their own
 * booking flow, where availability is checked at the moment of payment.
 */

export type CartService = "food" | "cleaning" | "beach" | "plan";

export interface CartItem {
  /** Stable key = service + plan + period, so identical lines stack as quantity. */
  key: string;
  service: CartService;
  /** Legacy provider id for food; the universal providers.id for the rest. */
  providerId: string;
  providerName: string;
  /** The legacy row this line buys — food_meal_plans, cleaning_packages, … */
  planId: string;
  planName: string;
  /** Price of one unit for one period. */
  unitPriceCents: number;
  /** How many periods — weeks for food, months for everything else. */
  periods: number;
  /** Portions for food, people for the beach, 1 for a plan or a cleaning. */
  qty: number;
  /** Food only: how many meals a day this plan includes. */
  mealsPerDay?: number;
}

export interface ServiceShape {
  label: string;
  /** What one period is called, singular. */
  periodNoun: "week" | "month";
  /** What one unit is called, singular. Null when quantity is meaningless. */
  unitNoun: string | null;
  /** Periods a customer may choose for this service. */
  periodOptions: number[];
  /** Whether a line of this service can be bought more than once. */
  allowsQuantity: boolean;
}

export const CART_SERVICES: Record<CartService, ServiceShape> = {
  food: {
    label: "Meals",
    periodNoun: "week",
    unitNoun: "portion",
    periodOptions: [1, 2, 4, 8, 12],
    allowsQuantity: true,
  },
  cleaning: {
    label: "Cleaning",
    periodNoun: "month",
    unitNoun: null,
    periodOptions: [1, 2, 3],
    // Two subscriptions to the same cleaning plan would need two schedules and
    // two sets of visits; the platform has no idea which is which.
    allowsQuantity: false,
  },
  beach: {
    label: "Beach Club",
    periodNoun: "month",
    unitNoun: "person",
    periodOptions: [1],
    allowsQuantity: true,
  },
  plan: {
    label: "Subscriptions",
    periodNoun: "month",
    unitNoun: null,
    periodOptions: [1, 3, 6, 12],
    allowsQuantity: false,
  },
};

export const lineTotalCents = (item: CartItem) =>
  item.unitPriceCents * Math.max(1, item.periods) * Math.max(1, item.qty);

export const cartItemKey = (item: Pick<CartItem, "service" | "planId" | "periods">) =>
  `${item.service}_${item.planId}_${item.periods}`;

/** "4 weeks", "1 month" — said the way the service actually bills. */
export function periodLabel(item: Pick<CartItem, "service" | "periods">): string {
  const noun = CART_SERVICES[item.service]?.periodNoun ?? "week";
  return `${item.periods} ${noun}${item.periods === 1 ? "" : "s"}`;
}

/** "2 portions", "3 people" — empty when quantity means nothing for the service. */
export function quantityLabel(item: CartItem): string {
  const noun = CART_SERVICES[item.service]?.unitNoun;
  if (!noun) return "";
  return `${item.qty} ${noun}${item.qty === 1 ? "" : "s"}`;
}

/**
 * Old carts.
 *
 * The stored shape had no `service` and called the period `durationWeeks`;
 * anything already in someone's localStorage is a meal plan by definition,
 * because nothing else could be added. Reading it back as food rather than
 * dropping it means a customer who left the tab open doesn't lose their basket.
 */
export function migrateStoredItem(raw: any): CartItem | null {
  if (!raw || typeof raw !== "object" || !raw.planId) return null;
  const service: CartService = raw.service ?? "food";
  const periods = Number(raw.periods ?? raw.durationWeeks ?? 1);
  const item: CartItem = {
    key: "",
    service,
    providerId: String(raw.providerId ?? ""),
    providerName: String(raw.providerName ?? ""),
    planId: String(raw.planId),
    planName: String(raw.planName ?? ""),
    unitPriceCents: Number(raw.unitPriceCents ?? 0),
    periods: Number.isFinite(periods) && periods > 0 ? periods : 1,
    qty: Math.max(1, Number(raw.qty ?? 1)),
    mealsPerDay: raw.mealsPerDay != null ? Number(raw.mealsPerDay) : undefined,
  };
  return { ...item, key: cartItemKey(item) };
}
