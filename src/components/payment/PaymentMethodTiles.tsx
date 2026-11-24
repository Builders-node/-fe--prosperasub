import { Bitcoin, Check, Coins, CreditCard, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "./PaymentMethodSelector";

/**
 * Payment methods as tiles.
 *
 * Ordered the way a visitor thinks about paying, not the way the platform was
 * built: card first (PayPal takes cards, and the tile now says so), then
 * Bitcoin, then every other coin. "Lightning" and "On-chain" are not two ways
 * to pay — they are two networks for the same coin — so they are one Bitcoin
 * tile with the network picked underneath it once Bitcoin is chosen.
 *
 * A chosen tile is the selected-segment fill with a check, not the accent:
 * the accent orange sat next to Bitcoin's own orange and the two read as one.
 */

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Methods to show. Disabled ones never reach here. */
  available?: PaymentMethod[];
}

const ALL: PaymentMethod[] = ["paypal", "lightning", "onchain", "crypto_gateway"];
const BTC: PaymentMethod[] = ["lightning", "onchain"];

type Tile = "card" | "bitcoin" | "crypto";

const TILES: Record<Tile, { label: string; sub: string; tile: string; Icon: LucideIcon }> = {
  card:    { label: "Card or PayPal", sub: "Visa · Mastercard · PayPal", tile: "bg-[#5b6ee1]", Icon: CreditCard },
  bitcoin: { label: "Bitcoin",        sub: "Lightning or on-chain",       tile: "bg-[#f7931a]", Icon: Bitcoin },
  crypto:  { label: "Other crypto",   sub: "USDT · ETH…",                 tile: "bg-[#26a17b]", Icon: Coins },
};

const tileOf = (m: PaymentMethod): Tile =>
  m === "paypal" ? "card" : m === "crypto_gateway" ? "crypto" : "bitcoin";

export function PaymentMethodTiles({ value, onChange, disabled, available }: Props) {
  const methods = ALL.filter((m) => (available ?? ALL).includes(m));
  const rails = BTC.filter((m) => methods.includes(m));

  if (methods.length === 0) {
    return (
      <p className="rounded-radius-md bg-inset p-3 text-sm text-muted-foreground">
        No payment methods are currently available. Please try again later.
      </p>
    );
  }

  const tiles: Tile[] = [];
  if (methods.includes("paypal")) tiles.push("card");
  if (rails.length) tiles.push("bitcoin");
  if (methods.includes("crypto_gateway")) tiles.push("crypto");

  const activeTile = tileOf(value);
  const pick = (t: Tile) => {
    if (t === "card") onChange("paypal");
    else if (t === "crypto") onChange("crypto_gateway");
    // Keep the network already chosen; otherwise Lightning — instant and cheap.
    else onChange(BTC.includes(value) && rails.includes(value) ? value : rails[0]);
  };

  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", tiles.length === 1 ? "grid-cols-1" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {tiles.map((t) => {
          const active = activeTile === t;
          const { label, sub, tile, Icon } = TILES[t];
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => pick(t)}
              aria-pressed={active}
              className={cn(
                "flex min-h-[112px] flex-col justify-between gap-2 rounded-radius-md p-2 text-left transition-colors",
                active ? "bg-segment ring-2 ring-foreground" : "bg-inset hover:bg-muted",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-sm", tile)}>
                  <Icon className="h-[22px] w-[22px] text-white" strokeWidth={2.25} />
                </span>
                {/* The check, not a colour, is what says "chosen". */}
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-foreground text-background" : "border-2 border-muted-foreground/50",
                  )}
                  aria-hidden
                >
                  {active && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
              </span>
              <span className="block">
                <span className="block text-body font-semibold leading-tight text-foreground">{label}</span>
                <span className="mt-0.5 block text-meta leading-tight text-muted-foreground">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* The network, only once Bitcoin is the choice and both are offered. */}
      {activeTile === "bitcoin" && rails.length > 1 && (
        <div className="flex rounded-radius-md bg-inset p-0.5" role="radiogroup" aria-label="Bitcoin network">
          {rails.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value === m}
              disabled={disabled}
              onClick={() => onChange(m)}
              className={cn(
                "flex-1 rounded-radius-md px-3 py-2 text-center text-body font-semibold transition-colors",
                value === m ? "bg-segment text-foreground" : "text-foreground/70 hover:text-foreground",
              )}
            >
              {m === "lightning" ? "Lightning · instant" : "On-chain"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
