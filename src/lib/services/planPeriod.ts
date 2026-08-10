import { addDays, addMonths, addYears } from "date-fns";

/**
 * The vocabulary of `provider_plans.period`, in one place.
 *
 * The admin editor writes one_time / weekly / monthly / quarterly / yearly.
 * The checkout used to switch on "day" / "week" / "year" — none of which the
 * editor produces — so every period except monthly fell through to a one-month
 * default and a yearly plan sold a month. Money depends on these, so they live
 * together rather than being re-typed at each call site.
 */
export const PLAN_PERIODS = ["one_time", "weekly", "monthly", "quarterly", "yearly"] as const;
export type PlanPeriod = typeof PLAN_PERIODS[number];

/** Tolerates "Monthly", "one time", "one-time" — anything unknown reads as monthly. */
export function normPeriod(period: string | null | undefined): PlanPeriod {
  const p = (period ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (PLAN_PERIODS as readonly string[]).includes(p) ? (p as PlanPeriod) : "monthly";
}

/**
 * When a purchase made on `startISO` runs out.
 *
 * one_time gets a month like anything else: the row still needs an end_date,
 * because null reads as "never expires" in every downstream lifecycle check —
 * the opposite of what "once" means.
 */
export function endDateFor(startISO: string, period: string | null | undefined): Date {
  const start = new Date(`${startISO}T00:00:00`);
  switch (normPeriod(period)) {
    case "weekly":    return addDays(start, 7);
    case "quarterly": return addMonths(start, 3);
    case "yearly":    return addYears(start, 1);
    default:          return addMonths(start, 1);
  }
}

/** How long one purchase lasts, for the checkout summary. */
export function termLabel(period: string | null | undefined): string {
  switch (normPeriod(period)) {
    case "weekly":    return "1 week";
    case "quarterly": return "3 months";
    case "yearly":    return "1 year";
    case "one_time":  return "One-time";
    default:          return "1 month";
  }
}

/** The noun a quantity is measured against: "4 massages / month". */
export function periodNoun(period: string | null | undefined): string {
  switch (normPeriod(period)) {
    case "weekly":    return "week";
    case "quarterly": return "quarter";
    case "yearly":    return "year";
    case "one_time":  return "";
    default:          return "month";
  }
}

/**
 * "4 massages a month". Returns null when the plan doesn't meter anything, so
 * callers render nothing rather than an empty line.
 *
 * Pluralisation is deliberately naive — an "s" — because the unit is a short
 * noun an admin types (massage, wash, class, visit) and those all take one. A
 * unit ending in s, x, ch or sh gets "es"; anything stranger is the admin's to
 * word as they like in the plan name.
 */
export function includedLabel(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  period: string | null | undefined,
): string | null {
  if (typeof quantity !== "number" || quantity <= 0) return null;
  const noun = (unit ?? "").trim();
  const counted = noun
    ? `${quantity} ${quantity === 1 ? noun : pluralise(noun)}`
    : String(quantity);
  const per = periodNoun(period);
  return per ? `${counted} a ${per}` : counted;
}

function pluralise(noun: string): string {
  return /(s|x|ch|sh)$/i.test(noun) ? `${noun}es` : `${noun}s`;
}
