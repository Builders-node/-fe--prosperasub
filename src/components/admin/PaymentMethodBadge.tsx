import { Zap, Bitcoin, Coins, Wallet, Banknote, Gift, HandCoins, Minus, ExternalLink, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

/** Collapse the various stored values into a canonical payment method. */
export function normalizePaymentMethod(method?: string | null): PaymentMethodKey {
  const m = (method || "").toLowerCase();
  if (m === "lightning" || m === "blink") return "lightning";
  if (m === "onchain" || m === "bitcoin") return "onchain";
  // Solana settles through the Infinita wallet (LIVES). The Infinita checkout
  // stores this as "crypto", so treat crypto/solana/lives as Infinita.
  if (m === "infinita" || m === "lives" || m === "crypto" || m === "solana") return "infinita";
  if (m === "paypal") return "paypal";
  // Any non-Bitcoin coin through the gateway (NOWPayments…). Not "crypto":
  // that value belongs to historical Infinita/LIVES rows.
  if (m === "crypto_gateway") return "crypto_gateway";
  if (m === "cash") return "cash";
  if (m === "free" || m === "comp") return "free";
  if (m === "manual" || m === "external" || m === "offline" || m === "bank") return "manual";
  return "unknown";
}

type PaymentMethodKey = "lightning" | "onchain" | "infinita" | "crypto_gateway" | "paypal" | "cash" | "free" | "manual" | "unknown";

const META: Record<PaymentMethodKey, { label: string; Icon: LucideIcon; className: string }> = {
  lightning: { label: tr("Lightning"), Icon: Zap,      className: "bg-muted text-foreground" },
  onchain:   { label: tr("On-chain"),  Icon: Bitcoin,  className: "bg-muted text-foreground" },
  infinita:  { label: "LIVES",     Icon: Coins,    className: "bg-muted text-foreground" },
  crypto_gateway: { label: tr("Crypto"), Icon: Coins, className: "bg-muted text-foreground" },
  paypal:    { label: tr("PayPal"),    Icon: Wallet,   className: "bg-muted text-foreground" },
  cash:      { label: tr("Cash"),      Icon: Banknote, className: "bg-muted text-foreground" },
  free:      { label: tr("Free"),      Icon: Gift,     className: "bg-muted text-foreground" },
  manual:    { label: tr("Manual"),    Icon: HandCoins, className: "bg-muted text-foreground" },
  unknown:   { label: "—",         Icon: Minus,    className: "bg-muted text-muted-foreground" },
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
        title={tr("View on Solscan: {reference}", { reference })}
        className="inline-flex items-center gap-1 font-mono text-meta text-primary hover:underline"
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
      title={key === "unknown" ? tr("Payment method not recorded") : tr("Paid with {label}", { label })}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
