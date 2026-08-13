import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { findVariant, type PlanOffer, type PlanVariant } from "@/hooks/usePlanOffers";

/**
 * "Studio · 1 Br · 2 Br" — one segmented control per axis, with a live price.
 *
 * It used to be rows of bordered chips. The design makes each axis a single
 * track: a #f6f6f6 rail with 2px of padding, and the chosen option is the white
 * tile inside it. That reads as "pick exactly one of these" without needing a
 * label to say so, which is why the group titles are gone — an axis called
 * "Apartment size" whose options are Studio / 1 Br / 2 Br was saying it twice.
 *
 * An option no variant sells with the current selection renders disabled rather
 * than vanishing, so the track doesn't reflow under the finger and the customer
 * can see the combination simply isn't offered.
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
    <div className={cn("space-y-3", className)}>
      {offer.groups.map((group) => (
        <div
          key={group.key}
          role="radiogroup"
          aria-label={group.label}
          className="flex w-full items-stretch gap-0 rounded-[18px] bg-background p-0.5 shadow-figma"
        >
          {group.options.map((option) => {
            const selected = selection[group.key] === option.key;
            const available = isAvailable(group.key, option.key);
            const variant = priceFor(group.key, option.key);
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!available}
                onClick={() => onSelect({ ...selection, [group.key]: option.key })}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-radius-md px-1.5 py-2 transition-colors",
                  selected ? "bg-card" : "bg-transparent",
                  !available && "cursor-not-allowed opacity-40",
                )}
              >
                <span className="w-full truncate text-center text-[16px] font-semibold leading-[22px] tracking-[-0.32px] text-foreground">
                  {option.label}
                </span>
                {/* The caption slot the design gives to "per month" carries the
                    price of the combination this tile would produce — so the
                    cost of one more bedroom is visible before tapping. */}
                {variant && (
                  <span className={cn(
                    "w-full truncate text-center text-[12px] leading-4 tabular-nums tracking-[-0.24px]",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {formatUSD(variant.priceCents)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
