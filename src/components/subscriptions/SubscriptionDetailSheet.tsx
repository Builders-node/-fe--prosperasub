import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { StatusPill } from "@/components/patterns/StatusPill";
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import { formatUSD } from "@/lib/pricing";
import { formatRangeHN, formatDateHN } from "@/lib/timezone";
import { TipPanel } from "@/components/subscriptions/TipPanel";

/**
 * What a customer sees when they tap a subscription: the purchase, not the
 * product.
 *
 * Not the storefront page for the plan — they already own it — but the receipt:
 * the tariff they took, what it covers, and how it was paid. One shape for
 * every service, filled by the card that opened it.
 */
export interface PurchaseDetail {
  title: string;
  provider?: string | null;
  status: string;
  /** Total charged for the period, in cents. */
  amountCents: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  purchasedAt?: string | null;
  /** Tariff facts — "2 guests", "3 meals a day", "4 weeks". */
  facts?: { label: string; value: ReactNode }[];
  /** Booked sessions to show inside the purchase — cleaning visits, grouped. */
  sessions?: { label: string; items: { id: string; date: string; time?: string | null; status: string }[] }[];
  /** Optional link out, e.g. food's weekly menu. */
  action?: { label: string; onClick: () => void };
  /** Cancel (or Resume) the subscription — the quiet action, at the very bottom. */
  cancel?: { label: string; destructive?: boolean; onClick: () => void };
  /** Leave a tip — the same panel on every service. */
  tip?: { service: string; subscriptionRef: string; providerId?: string | null; providerName?: string | null; customerName?: string | null };
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-[14px] text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-[14px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function SubscriptionDetailSheet({
  detail, onClose,
}: {
  detail: PurchaseDetail | null;
  onClose: () => void;
}) {
  return (
    <ResponsiveDialog open={!!detail} onOpenChange={(o) => !o && onClose()} title="Your purchase">
      {detail && (
        <div className="pb-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[18px] font-semibold leading-[22px] tracking-[-0.36px] text-foreground">
                {detail.title}
              </p>
              {detail.provider && (
                <p className="mt-0.5 text-[13px] text-muted-foreground">{detail.provider}</p>
              )}
            </div>
            <StatusPill status={detail.status} />
          </div>

          {detail.amountCents != null && (
            <div className="mb-2 rounded-radius-md bg-inset p-4">
              <p className="text-[13px] text-muted-foreground">Paid</p>
              <p className="mt-0.5 text-[24px] font-semibold leading-[29px] tabular-nums text-foreground">
                {formatUSD(detail.amountCents)}
              </p>
            </div>
          )}

          <div className="divide-y divide-border/60">
            <Row label="Period" value={formatRangeHN(detail.periodStart, detail.periodEnd) ?? undefined} />
            {detail.facts?.map((f, i) => <Row key={i} label={f.label} value={f.value} />)}
            <Row label="Paid with"
              value={detail.paymentMethod ? <PaymentMethodBadge method={detail.paymentMethod} /> : undefined} />
            <Row label="Reference"
              value={detail.paymentReference
                ? <PaymentReference method={detail.paymentMethod} reference={detail.paymentReference} />
                : undefined} />
            <Row label="Purchased" value={detail.purchasedAt ? formatDateHN(detail.purchasedAt) : undefined} />
          </div>

          {/* The visits this subscription booked — the schedule lives in the
              purchase now, not on the list. */}
          {detail.sessions?.filter((g) => g.items.length).map((group) => (
            <div key={group.label} className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                {group.label} · <span className="tabular-nums">{group.items.length}</span>
              </p>
              <div className="space-y-2">
                {group.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 rounded-radius-md bg-inset px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">{it.date}</p>
                      {it.time && <p className="text-[12px] text-muted-foreground">{it.time}</p>}
                    </div>
                    <StatusPill status={it.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {detail.tip && (
            <div className="mt-4">
              <TipPanel
                service={detail.tip.service}
                subscriptionRef={detail.tip.subscriptionRef}
                providerId={detail.tip.providerId}
                providerName={detail.tip.providerName ?? detail.provider}
                customerName={detail.tip.customerName}
              />
            </div>
          )}

          {detail.action && (
            <button
              type="button"
              onClick={detail.action.onClick}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-foreground px-5 py-3 text-[14px] font-semibold text-background transition-colors hover:bg-foreground/90"
            >
              {detail.action.label}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {/* The quiet one: nobody opens the purchase to cancel it, so it sits
              last, as text — a Cancel that stretches full-width reads as the
              point of the screen. */}
          {detail.cancel && (
            <button
              type="button"
              onClick={detail.cancel.onClick}
              className={
                "mt-3 w-full py-2 text-center text-[14px] font-semibold transition-colors " +
                (detail.cancel.destructive
                  ? "text-destructive hover:text-destructive/80"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {detail.cancel.label}
            </button>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
