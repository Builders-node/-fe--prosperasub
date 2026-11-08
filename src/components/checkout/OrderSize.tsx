import { Minus, Plus } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * How long and how many — the one control for both, on the checkout AND in the
 * cart.
 *
 * The two screens used to disagree: the cart offered 1/2/4/8/12 weeks in a
 * dropdown and a bare −/+ pill, the checkout a stepper that only appeared when
 * the provider had set a maximum (almost never), and no portions at all. A
 * customer who wanted a month of meals for two had to know to use the cart.
 *
 * Terms are chips with the total for each written on it, so a longer term is
 * one tap and its price is never a surprise. Quantity is one stepper, worded in
 * the service's own noun — portions, people.
 */
export function OrderSize({ termOptions, periods, onPeriods, periodNoun, priceForTerm, quantity, className }: {
  termOptions: number[];
  periods: number;
  onPeriods: (n: number) => void;
  /** "week", "month" — singular. */
  periodNoun: string;
  /** Total for a term, quantity included — written on each chip. */
  priceForTerm: (n: number) => number;
  quantity?: { value: number; onChange: (n: number) => void; noun: string; max?: number } | null;
  className?: string;
}) {
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const people = (n: number, noun: string) => (noun === "person" ? (n === 1 ? "1 person" : `${n} people`) : plural(n, noun));
  const showTerms = termOptions.length > 1 && !!periodNoun;

  if (!showTerms && !quantity) return null;
  return (
    <div className={cn("space-y-4", className)}>
      {showTerms && (
        <div>
          <p className="text-meta font-semibold text-muted-foreground">How long</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {termOptions.map((n) => {
              const on = n === periods;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPeriods(n)}
                  className={cn(
                    "flex flex-col items-center rounded-radius-md px-2 py-2 transition-colors",
                    on ? "bg-foreground text-background" : "bg-inset text-foreground hover:bg-muted",
                  )}
                >
                  <span className="text-body font-semibold">{plural(n, periodNoun)}</span>
                  <span className={cn("text-meta tabular-nums", on ? "text-background/70" : "text-muted-foreground")}>
                    {formatUSD(priceForTerm(n))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {quantity && (
        <div>
          <p className="text-meta font-semibold text-muted-foreground">How many</p>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-inset">
              <button
                type="button" aria-label={`Fewer ${quantity.noun}s`}
                disabled={quantity.value <= 1}
                onClick={() => quantity.onChange(Math.max(1, quantity.value - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-title font-semibold tabular-nums text-foreground">{quantity.value}</span>
              <button
                type="button" aria-label={`More ${quantity.noun}s`}
                disabled={quantity.value >= (quantity.max ?? 20)}
                onClick={() => quantity.onChange(Math.min(quantity.max ?? 20, quantity.value + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-body text-muted-foreground">{people(quantity.value, quantity.noun)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The −/+ pill on its own — a cart row puts it on the right, like a shop does. */
export function QtyStepper({ value, onChange, noun, max = 20 }: { value: number; onChange: (n: number) => void; noun: string; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-full bg-inset">
      <button
        type="button" aria-label={value <= 1 ? "Remove" : `Fewer ${noun}s`}
        onClick={() => onChange(value - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-7 text-center text-body font-semibold tabular-nums text-foreground">{value}</span>
      <button
        type="button" aria-label={`More ${noun}s`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Terms as small pills — the cart row's version of "How long". */
export function TermPills({ options, value, onChange, noun }: { options: number[]; value: number; onChange: (n: number) => void; noun: string }) {
  if (options.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={n === value}
          onClick={() => onChange(n)}
          className={cn(
            "h-8 rounded-full px-3 text-meta font-semibold transition-colors",
            n === value ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground",
          )}
        >
          {n} {noun}{n === 1 ? "" : "s"}
        </button>
      ))}
    </div>
  );
}
