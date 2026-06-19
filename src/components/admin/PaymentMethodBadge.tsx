import { Zap, Bitcoin, Coins, Wallet, Minus, ExternalLink, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapse the various stored values into a canonical payment method. */
export function normalizePaymentMethod(method?: string | null): PaymentMethodKey {
  const m = (method || "").toLowerCase();
  if (m === "lightning" || m === "blink") return "lightning";
  if (m === "onchain" || m === "bitcoin") return "onchain";
  // Solana settles through the Infinita wallet (LIVES). The Infinita checkout
  // stores this as "crypto", so treat crypto/solana/lives as Infinita.
  if (m === "infinita" || m === "lives" || m === "crypto" || m === "solana") return "infinita";
  if (m === "paypal") return "paypal";
  return "unknown";
}

type PaymentMethodKey = "lightning" | "onchain" | "infinita" | "paypal" | "unknown";

const META: Record<PaymentMethodKey, { label: string; Icon: LucideIcon; className: string }> = {
  lightning: { label: "Lightning", Icon: Zap,     className: "bg-yellow-500/15 text-yellow-500" },
  onchain:   { label: "On-chain",  Icon: Bitcoin, className: "bg-orange-500/15 text-orange-400" },
  infinita:  { label: "LIVES",     Icon: Coins,   className: "bg-violet-500/15 text-violet-400" },
  paypal:    { label: "PayPal",    Icon: Wallet,  className: "bg-blue-500/15 text-blue-400" },
  unknown:   { label: "—",         Icon: Minus,   className: "bg-muted text-muted-foreground" },
};

/** The transaction reference for a payment. For Infinita/Solana it links to Solscan. */
export function PaymentReference({ method, reference }: { method?: string | null; reference?: string | null }) {
  if (!reference) return null;
  const key = normalizePaymentMethod(method);
  const short = reference.length > 16 ? `${reference.slice(0, 6)}…${reference.slice(-6)}` : reference;

  if (key === "infinita") {
    return (
      <a
        href={`https://solscan.io/tx/${reference}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`View on Solscan: ${reference}`}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-violet-400 hover:underline"
      >
        {short}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <span className="font-mono text-[11px] text-muted-foreground" title={reference}>{short}</span>
  );
}

/** A compact pill showing how a subscription was paid (LIVES / Lightning / On-chain / PayPal). */
export function PaymentMethodBadge({ method, className }: { method?: string | null; className?: string }) {
  const key = normalizePaymentMethod(method);
  const { label, Icon, className: tint } = META[key];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tint, className)}
      title={key === "unknown" ? "Payment method not recorded" : `Paid with ${label}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
