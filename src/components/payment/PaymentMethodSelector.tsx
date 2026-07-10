import { Zap, Bitcoin, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentMethod = "lightning" | "onchain" | "infinita" | "paypal";

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Methods to show. Defaults to all. Disabled methods are hidden entirely. */
  available?: PaymentMethod[];
}

const InfinitaIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M7 12c0-1.5 1-3 2.5-3s2 1.5 2.5 3 1 3 2.5 3 2.5-1.5 2.5-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PayPalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M7.4 21.5H4.6c-.3 0-.5-.3-.5-.6L6.9 3.6c.1-.4.4-.6.8-.6h6.1c2.7 0 4.6.6 5.5 1.8.8 1.1.9 2.4.5 4-.6 2.9-2.6 4.4-5.9 4.4H11c-.4 0-.7.3-.8.7l-.9 5.9c-.1.4-.4.7-.8.7H7.4z" opacity=".55" />
    <path d="M19.3 8.8c-.6 2.9-2.6 4.4-5.9 4.4H11c-.4 0-.7.3-.8.7l-.9 5.9-.3 1.7c0 .3.2.5.5.5h2.5c.4 0 .7-.3.7-.6l.6-3.7c.1-.4.4-.6.8-.6h.5c2.9 0 5.1-1.2 5.7-4.6.3-1.4.1-2.5-.6-3.3-.2-.2-.5-.4-.9-.6z" />
  </svg>
);

const ALL: PaymentMethod[] = ["lightning", "onchain", "infinita", "paypal"];

// Yandex Lavka pattern: each method is a row with a brand-tinted icon tile
// (48×48 rounded), title + subtitle, and a filled/outlined radio circle on the
// right. Whole row is tappable. No borders on the row itself — only the tile
// and the checkmark carry visual weight.
const META: Record<
  PaymentMethod,
  { label: string; subtitle: string; tileBg: string; iconColor: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  lightning: {
    label: "Lightning",
    subtitle: "Instant Bitcoin payment",
    tileBg: "bg-[#f7931a]/15",
    iconColor: "text-[#f7931a]",
    Icon: ({ className }) => <Zap className={className} />,
  },
  onchain: {
    label: "On-chain Bitcoin",
    subtitle: "Send BTC to an address",
    tileBg: "bg-[#f7931a]/15",
    iconColor: "text-[#f7931a]",
    Icon: ({ className }) => <Bitcoin className={className} />,
  },
  infinita: {
    label: "LIVES",
    subtitle: "Pay with Solana (Infinita)",
    tileBg: "bg-purple-500/15",
    iconColor: "text-purple-400",
    Icon: InfinitaIcon,
  },
  paypal: {
    label: "PayPal",
    subtitle: "Card or PayPal balance",
    tileBg: "bg-[#0070ba]/15",
    iconColor: "text-[#0070ba]",
    Icon: PayPalIcon,
  },
};

export function PaymentMethodSelector({ value, onChange, disabled, available }: Props) {
  const methods = ALL.filter((m) => (available ?? ALL).includes(m));

  if (methods.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
        No payment methods are currently available. Please try again later.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {methods.map((m) => {
        const active = value === m;
        const { label, subtitle, tileBg, iconColor, Icon } = META[m];
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors",
              "hover:bg-muted/40",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tileBg)}>
              <Icon className={cn("h-6 w-6", iconColor)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-foreground">{label}</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span>
            </span>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                active ? "bg-foreground" : "border border-border bg-transparent",
              )}
              aria-hidden
            >
              {active && <Check className="h-3.5 w-3.5 text-background" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
