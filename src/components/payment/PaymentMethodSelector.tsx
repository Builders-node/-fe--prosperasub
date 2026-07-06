import { Zap, Bitcoin } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentMethod = "lightning" | "onchain" | "infinita" | "paypal";

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Methods to show. Defaults to all. Disabled methods are hidden entirely. */
  available?: PaymentMethod[];
}

const InfinitaIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M7 12c0-1.5 1-3 2.5-3s2 1.5 2.5 3 1 3 2.5 3 2.5-1.5 2.5-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PayPalIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.4 21.5H4.6c-.3 0-.5-.3-.5-.6L6.9 3.6c.1-.4.4-.6.8-.6h6.1c2.7 0 4.6.6 5.5 1.8.8 1.1.9 2.4.5 4-.6 2.9-2.6 4.4-5.9 4.4H11c-.4 0-.7.3-.8.7l-.9 5.9c-.1.4-.4.7-.8.7H7.4z" opacity=".55" />
    <path d="M19.3 8.8c-.6 2.9-2.6 4.4-5.9 4.4H11c-.4 0-.7.3-.8.7l-.9 5.9-.3 1.7c0 .3.2.5.5.5h2.5c.4 0 .7-.3.7-.6l.6-3.7c.1-.4.4-.6.8-.6h.5c2.9 0 5.1-1.2 5.7-4.6.3-1.4.1-2.5-.6-3.3-.2-.2-.5-.4-.9-.6z" />
  </svg>
);

const ALL: PaymentMethod[] = ["lightning", "onchain", "infinita", "paypal"];

const META: Record<PaymentMethod, { label: string; icon: (active: boolean) => JSX.Element; activeCls: string; activeText: string }> = {
  lightning: {
    label: "Lightning",
    icon: (active) => <Zap className={cn("h-6 w-6", active ? "text-[#f7931a]" : "text-muted-foreground")} />,
    activeCls: "border-[#f7931a] bg-[#f7931a]/10",
    activeText: "text-[#f7931a]",
  },
  onchain: {
    label: "On-chain",
    icon: (active) => <Bitcoin className={cn("h-6 w-6", active ? "text-[#f7931a]" : "text-muted-foreground")} />,
    activeCls: "border-[#f7931a] bg-[#f7931a]/10",
    activeText: "text-[#f7931a]",
  },
  infinita: {
    label: "LIVES",
    icon: () => <InfinitaIcon />,
    activeCls: "border-purple-500 bg-purple-500/10",
    activeText: "text-purple-500",
  },
  paypal: {
    label: "PayPal",
    icon: (active) => <span className={cn(active ? "text-[#0070ba]" : "text-muted-foreground")}><PayPalIcon /></span>,
    activeCls: "border-[#0070ba] bg-[#0070ba]/10",
    activeText: "text-[#0070ba]",
  },
};

export function PaymentMethodSelector({ value, onChange, disabled, available }: Props) {
  const base = "flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all";
  const dim = "border-border bg-card hover:border-muted-foreground/30";
  const methods = ALL.filter((m) => (available ?? ALL).includes(m));

  if (methods.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
        No payment methods are currently available. Please try again later.
      </p>
    );
  }

  return (
    <div className={cn("grid gap-3", methods.length === 1 ? "grid-cols-1" : methods.length === 2 ? "grid-cols-2" : methods.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
      {methods.map((m) => {
        const active = value === m;
        const meta = META[m];
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(base, active ? meta.activeCls : dim, disabled && "opacity-50 pointer-events-none")}
          >
            {meta.icon(active)}
            <span className={cn("text-sm font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
