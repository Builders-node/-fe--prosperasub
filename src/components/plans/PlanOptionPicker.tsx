import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { findVariant, type PlanOffer, type PlanVariant } from "@/hooks/usePlanOffers";

/**
 * "5 days a week, 2 meals a day" — one card, two rows of chips, a live price.
 *
 * The chips are the same vocabulary as the booking hour picker, deliberately:
 * a customer who has chosen a cleaning slot already knows what a selected chip
 * looks like.
 *
 * An option that no variant sells with the current selection renders disabled
 * rather than vanishing, so the row doesn't reflow under the finger and the
 * customer can see that the combination simply isn't offered.
 */
export function PlanOptionPicker({
  offer,
  selection,
  onSelect,
  className,
}: {
  offer: PlanOffer;
  selection: Record<string, string>;
  /** Called with the whole new selection, so the caller decides what to do next. */
  onSelect: (next: Record<string, string>) => void;
  className?: string;
}) {
  if (!offer.groups.length) return null;

  /**
   * Would picking this option leave a combination that exists?
   *
   * Checked against the OTHER groups only: switching "2 meals" to "3 meals"
   * must stay possible even though the pair with the current day count is what
   * is being replaced.
   */
  const isAvailable = (groupKey: string, optionKey: string) => {
    const candidate = { ...selection, [groupKey]: optionKey };
    return offer.variants.some((v) =>
      Object.entries(candidate).every(([g, o]) => v.optionKeys[g] === o));
  };

  const priceFor = (groupKey: string, optionKey: string): PlanVariant | null =>
    findVariant(offer, { ...selection, [groupKey]: optionKey });

  return (
    <div className={cn("space-y-4", className)}>
      {offer.groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => {
              const selected = selection[group.key] === option.key;
              const available = isAvailable(group.key, option.key);
              const variant = priceFor(group.key, option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={!available}
                  onClick={() => onSelect({ ...selection, [group.key]: option.key })}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-2.5 text-left transition-all duration-150",
                    selected
                      ? "border-transparent bg-foreground text-background"
                      : available
                        ? "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted"
                        : "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-50",
                  )}
                >
                  <span className="text-sm font-bold">{option.label}</span>
                  {/* The price of the combination this chip would produce —
                      so the cost of one more meal a day is visible before
                      tapping, not after. */}
                  {variant && (
                    <span className={cn("text-[11px] tabular-nums", selected ? "text-background/70" : "text-muted-foreground")}>
                      {formatUSD(variant.priceCents)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
