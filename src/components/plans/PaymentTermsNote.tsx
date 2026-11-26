import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import type { PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { formatUSD } from "@/lib/pricing";
import { tr } from "@/lib/tr";

/**
 * What the customer will actually pay, on the plan page — before checkout.
 *
 * A processing fee that first appears on the last step is the single most
 * common reason people abandon a purchase (Baymard: 40% of abandonments are
 * "extra costs too high"). The fee is set per method by an admin, so the page
 * reads the same settings the checkout does and says it up front: which ways
 * to pay, and what each one adds to this price.
 *
 * Subscriptions also say how to get out — cancel or pause from My
 * subscriptions — because "can I stop this?" is the other question people
 * carry into a recurring purchase.
 */

/** The methods a plan checkout takes (PlanCheckout, new purchase). */
const PLAN_CHECKOUT_METHODS: PaymentMethod[] = ["lightning", "onchain", "crypto_gateway", "paypal"];

const LABELS: Record<PaymentMethod, string> = {
  lightning: tr("Bitcoin"),
  onchain: tr("Bitcoin"),
  crypto_gateway: tr("USDT, USDC & other crypto"),
  paypal: tr("Card or PayPal"),
};

interface Props {
  priceCents: number;
  /** One purchase, not a subscription — no cancel/pause line. */
  oneTime?: boolean;
  /** A membership the customer can pause themselves (beach and universal plans). */
  pausable?: boolean;
  className?: string;
}

export function PaymentTermsNote({ priceCents, oneTime, pausable, className }: Props) {
  const { enabled, isLoading, surchargePercent } = usePaymentMethods({ supported: PLAN_CHECKOUT_METHODS });
  if (isLoading || priceCents <= 0 || enabled.length === 0) return null;

  // One line per label: the two Bitcoin rails read as one choice to a buyer.
  const lines = new Map<string, number>();
  for (const m of enabled) {
    const label = LABELS[m];
    const pct = surchargePercent(m);
    lines.set(label, Math.min(lines.get(label) ?? Infinity, pct));
  }

  const parts = Array.from(lines, ([label, pct]) => {
    const feeCents = Math.round(priceCents * pct / 100);
    return {
      label,
      text: feeCents > 0 ? tr("+{feeCents} fee ({pct}%)", { feeCents: formatUSD(feeCents), pct }) : tr("no fee"),
    };
  });

  return (
    <div className={className}>
      <p className="text-meta leading-4 text-muted-foreground">{tr("Pay with")}{" "}{parts.map((p, i) => (
          <span key={p.label}>
            {i > 0 && (i === parts.length - 1 ? tr(" or ") : ", ")}
            <span className="text-foreground">{p.label}</span> · {p.text}
          </span>
        ))}
        .
      </p>
      {!oneTime && (
        <p className="mt-1 text-meta leading-4 text-muted-foreground">
          {pausable ? tr("Cancel or pause any time") : tr("Cancel any time")}{" "}{tr("from My subscriptions.")}</p>
      )}
    </div>
  );
}
