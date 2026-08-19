import { Bitcoin, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "./PaymentMethodSelector";

/**
 * Payment methods as tiles, per the redesigned checkout.
 *
 * The list version reads like settings: four stacked rows, each with a
 * subtitle explaining itself. At the till the customer has already decided how
 * they pay; what they need is to see the options at once and tap one. So the
 * methods sit side by side, the chosen one is filled with the brand colour,
 * and the subtitles are gone — "Bitcoin Lightning" says everything the sentence
 * under it used to.
 *
 * The icon tile inverts on selection: normally the brand colour behind a white
 * glyph, and once the card itself turns amber, white behind a coloured glyph so
 * it stays legible. Both Bitcoin rails carry the same ₿, as the design has
 * them — the second line of the label is what tells them apart.
 */

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Methods to show. Disabled ones never reach here. */
  available?: PaymentMethod[];
}

const ALL: PaymentMethod[] = ["lightning", "onchain", "paypal"];

/** The ₿ the design uses for both Bitcoin rails. */
const BitcoinGlyph = ({ className }: { className?: string }) => (
  <Bitcoin className={className} strokeWidth={2.5} />
);

const META: Record<
  PaymentMethod,
  { label: string; sub: string | null; tile: string; glyph: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  lightning: { label: "Bitcoin", sub: "Lightning", tile: "bg-[#f7931a]", glyph: "text-[#f7931a]", Icon: BitcoinGlyph },
  onchain:   { label: "Bitcoin", sub: "On-chain",  tile: "bg-[#f7931a]", glyph: "text-[#f7931a]", Icon: BitcoinGlyph },
  paypal:    { label: "PayPal",  sub: null,        tile: "bg-[#5b6ee1]", glyph: "text-[#5b6ee1]", Icon: CreditCard },
};

export function PaymentMethodTiles({ value, onChange, disabled, available }: Props) {
  const methods = ALL.filter((m) => (available ?? ALL).includes(m));

  if (methods.length === 0) {
    return (
      <p className="rounded-radius-md bg-inset p-3 text-sm text-muted-foreground">
        No payment methods are currently available. Please try again later.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {methods.map((m) => {
        const active = value === m;
        const { label, sub, tile, glyph, Icon } = META[m];
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={cn(
              "flex h-[120px] flex-col justify-between rounded-radius-md p-2 text-left tracking-[-0.02em] transition-colors",
              active ? "bg-primary" : "bg-inset hover:bg-muted",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]",
                  // White in both themes: it sits on the amber fill, which does
                  // not change with the theme, so `bg-card` would have gone
                  // black at night and swallowed the glyph.
                  active ? "bg-white" : tile,
                )}
              >
                <Icon className={cn("h-[22px] w-[22px]", active ? glyph : "text-white")} />
              </span>
              {/* The radio is the only thing that says "chosen" on a tile whose
                  colour a colour-blind eye may not separate from its neighbour. */}
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  active ? "border-white" : "border-muted-foreground/50",
                )}
                aria-hidden
              >
                {active && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
              </span>
            </span>
            <span
              className={cn(
                "block text-[14px] font-semibold leading-tight",
                active ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {label}
              {sub && <><br />{sub}</>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
