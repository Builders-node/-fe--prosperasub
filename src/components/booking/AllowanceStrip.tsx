import { formatDateHN } from "@/lib/timezone";

/** What this customer's plan still allows on a calendar. */
export interface Allowance {
  limit: number;
  used: number;
  remaining: number;
  period: "weekly" | "monthly" | "quarterly" | "yearly";
  /** ISO instant the count starts again. */
  resetsOn: string;
}

const PERIOD_LABEL: Record<Allowance["period"], string> = {
  weekly: "this week",
  monthly: "this month",
  quarterly: "this quarter",
  yearly: "this year",
};

/** "1.5" but "2" — an allowance reads as a number, not as 2.00. */
const formatHours = (h: number) => (Number.isInteger(h) ? String(h) : String(Math.round(h * 10) / 10));

/**
 * How many hours are left, before the customer picks a time.
 *
 * A plan can include a number of hours, and the booking endpoint refuses the
 * one past it with `hour_allowance_reached`. Refusing is not the same as
 * telling: this is the sentence that makes the limit part of the product
 * rather than an error somebody hits.
 */
export function AllowanceStrip({ allowance }: { allowance: Allowance }) {
  const spent = Math.min(100, Math.round((allowance.used / Math.max(allowance.limit, 1)) * 100));
  const none = allowance.remaining <= 0;

  return (
    <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[16px] leading-[22px] text-foreground">
          {none
            ? `You've used all ${formatHours(allowance.limit)} hours your plan includes ${PERIOD_LABEL[allowance.period]}`
            : `${formatHours(allowance.remaining)} of ${formatHours(allowance.limit)} hours left ${PERIOD_LABEL[allowance.period]}`}
        </p>
        <span className="shrink-0 text-[12px] leading-[16px] text-muted-foreground">
          resets {formatDateHN(allowance.resetsOn, { month: "short", day: "numeric" })}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${none ? "bg-muted-foreground" : "bg-primary"}`}
          style={{ width: `${spent}%` }}
        />
      </div>
    </section>
  );
}
