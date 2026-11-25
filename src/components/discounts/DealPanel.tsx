import { CalendarClock, Percent, Sparkles } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import {
  appliesTo, displayDiscount, endsLabel, prepayMax, useActiveDiscounts, valueLabel,
  type ActiveDiscount, type DiscountSubject,
} from "@/lib/discounts";
import { tr, trx } from "@/lib/tr";

/**
 * Every discount the business runs on this offer, said plainly on its page —
 * and what it costs after, so nobody is surprised at the second payment.
 * One line each: the sale (old price struck), the new-customer price, the
 * pay-ahead steps. Who actually gets which is decided at checkout.
 */
export function DealPanel({ subject, unit }: { subject: DiscountSubject; unit?: string | null }) {
  const { data } = useActiveDiscounts();
  const now = Date.now();
  const live = (data ?? []).filter((d) =>
    Date.parse(d.starts_at) <= now && (!d.ends_at || Date.parse(d.ends_at) > now) && appliesTo(d, subject));
  const price = Number(subject.priceCents) || 0;
  if (!live.length || price <= 0) return null;
  const sale = displayDiscount(live, subject, now);
  const intro = live.find((d) => d.kind === "intro");
  const prepay = live.find((d) => d.kind === "prepay");
  const per = unit ? ` ${unit}` : "";

  return (
    <div className="space-y-1 rounded-radius-lg bg-destructive/5 p-3">
      {sale?.kind === "sale" && (
        <Row icon={<Percent className="h-4 w-4" />} tone="sale">
          <span className="font-semibold text-destructive">{formatUSD(sale.nowCents)}{per}</span>
          {sale.wasCents && <span className="ml-1.5 text-muted-foreground line-through">{formatUSD(sale.wasCents)}</span>}
          <span className="text-muted-foreground"> · {sale.discount.title || "Sale"}{sale.note ? ` · ${sale.note.toLowerCase()}` : ""}</span>
        </Row>
      )}
      {intro && <Row icon={<Sparkles className="h-4 w-4" />}>{introLine(intro, price, per)}</Row>}
      {prepay && (
        <Row icon={<CalendarClock className="h-4 w-4" />}>
          <span className="font-semibold text-foreground">{trx("Pay ahead, save up to {prepayMax}%", { prepayMax: prepayMax(prepay) })}</span>
          <span className="text-muted-foreground">
            {" "}· {(prepay.tiers ?? []).map((t) => `${t.periods} for −${t.percent_off}%`).join(", ")}
          </span>
        </Row>
      )}
    </div>
  );
}

function introLine(d: ActiveDiscount, price: number, per: string) {
  const off = d.value_type === "percent" ? Math.floor((price * (d.percent_off ?? 0)) / 100) : (d.amount_off_cents ?? 0);
  const first = Math.max(1, price - off);
  const n = d.intro_periods > 1 ? tr("the first {intro_periods} periods", { intro_periods: d.intro_periods }) : tr("the first period");
  const ends = endsLabel(d.ends_at);
  return (
    <>
      <span className="font-semibold text-foreground">{trx("New here? {first}{per} for {n}", { first: formatUSD(first), per, n })}</span>
      <span className="text-muted-foreground">{" "}{trx("({valueLabel}), then {price}{per}", { valueLabel: valueLabel(d), price: formatUSD(price), per })}{ends ? ` · ${ends.toLowerCase()}` : ""}</span>
    </>
  );
}

function Row({ icon, children, tone }: { icon: React.ReactNode; children: React.ReactNode; tone?: "sale" }) {
  return (
    <p className="flex items-start gap-2 text-meta leading-5">
      <span className={tone === "sale" ? "mt-0.5 text-destructive" : "mt-0.5 text-muted-foreground"}>{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
