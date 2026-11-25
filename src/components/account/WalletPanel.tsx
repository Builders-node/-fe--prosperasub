import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { PaymentMethodTiles } from "@/components/payment/PaymentMethodTiles";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { useAuth } from "@/contexts/AuthContext";
import { accountApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { tr, trx, dfLocale } from "@/lib/tr";

/**
 * The wallet (Edge routes/wallet.ts): a balance in dollars, topped up with an
 * ordinary invoice, and subscriptions that renew from it on their own.
 *
 * For people who pay in Bitcoin, renewing used to mean coming back every week
 * or month to pay again — the moment most subscriptions are lost. Now the
 * balance pays: the day before a period ends, the price is taken and the
 * subscription runs on. If the balance is short, the customer is told once,
 * with the amount, in-app and by email.
 */

/** The marker the server checks a top-up invoice by — same string in routes/wallet.ts. */
export const TOPUP_SERVICE_NAME = tr("EverySub balance top-up");

interface RenewableSub { id: string; planName: string; endDate: string | null; priceCents: number; autoRenew: boolean; viaPayPal: boolean }
interface WalletData {
  balanceCents: number;
  entries: Array<{ id: string; amount_cents: number; kind: string; note: string | null; created_at: string }>;
  subscriptions: RenewableSub[];
  minTopupCents: number;
}

const PRESETS = [2500, 5000, 10000];
const KEY = ["wallet"];

export function WalletPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    retry: false,
    queryFn: async (): Promise<WalletData> => {
      const { data, error } = await accountApi("/account/wallet");
      if (error) throw error;
      return data as WalletData;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await accountApi(`/account/subscriptions/${id}/auto-renew`, { method: "POST", body: JSON.stringify({ enabled }) });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.enabled ? tr("Renews from your balance") : tr("Auto-renew off"));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(e.message || tr("Couldn't change that")),
  });

  /**
   * PayPal renewals can now be switched off here. The endpoint existed; the
   * switch was greyed out with "renews through PayPal", so the only way to
   * stop the charges was inside PayPal itself.
   */
  const [confirmPayPalOff, setConfirmPayPalOff] = useState<string | null>(null);
  const stopPayPal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await accountApi(`/account/subscriptions/${id}/auto-renew/cancel`, { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("PayPal won't charge again. Your plan runs to the end of this term."));
      setConfirmPayPalOff(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(tr("We couldn't reach PayPal. Try again in a minute.")),
  });

  if (q.isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (q.isError || !q.data) {
    // A network blip is not a missing feature — say which one this is.
    return (
      <section className="rounded-radius-md bg-card p-6 text-center shadow-figma">
        <p className="text-title font-semibold text-foreground">{tr("Couldn't load your wallet")}</p>
        <p className="mt-1 text-meta text-muted-foreground">{tr("Check your connection and try again.")}</p>
        <Button variant="secondary" className="mt-3" onClick={() => void q.refetch()}>{tr("Try again")}</Button>
      </section>
    );
  }

  const w = q.data;
  const on = w.subscriptions.filter((s) => s.autoRenew && !s.viaPayPal);
  const nextDue = on[0] ?? null;
  const shortBy = nextDue ? Math.max(0, nextDue.priceCents - w.balanceCents) : 0;

  return (
    <div className="space-y-4">
      {/* Balance, and what it is about to pay for. */}
      <section className="rounded-radius-md bg-card p-4 shadow-figma">
        <p className="text-meta text-muted-foreground">{tr("Balance")}</p>
        <p className="text-[32px] font-semibold leading-[40px] tracking-tight tabular-nums text-foreground">{formatUSD(w.balanceCents)}</p>
        {nextDue ? (
          <p className={cn("mt-1 text-[14px]", shortBy > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
            {shortBy > 0
              ? tr("Top up {shortBy} to renew {planName}{value}.", { shortBy: formatUSD(shortBy), planName: nextDue.planName, value: nextDue.endDate ? tr(" before {date}", { date: formatDateHN(nextDue.endDate) }) : "" })
              : tr("Next: {planName}, {priceCents}{value}.", { planName: nextDue.planName, priceCents: formatUSD(nextDue.priceCents), value: nextDue.endDate ? tr(" on {date}", { date: formatDateHN(nextDue.endDate) }) : "" })}
          </p>
        ) : (
          <p className="mt-1 text-[14px] text-muted-foreground">{tr("Switch on auto-renew below and your subscriptions pay for themselves from here.")}</p>
        )}
      </section>

      <TopUp suggestedCents={shortBy > 0 ? Math.max(shortBy, w.minTopupCents) : null} minCents={w.minTopupCents}
        onDone={() => void qc.invalidateQueries({ queryKey: KEY })} />

      {/* Which subscriptions renew from it. */}
      <section className="space-y-2">
        <h2 className="text-[20px] font-semibold text-foreground">{tr("Auto-renew")}</h2>
        {w.subscriptions.length === 0 ? (
          <p className="rounded-radius-md bg-card p-4 text-[14px] text-muted-foreground shadow-figma">{tr("No running subscriptions to renew.")}</p>
        ) : (
          <div className="rounded-radius-md bg-card p-1.5 shadow-figma">
            {w.subscriptions.map((s) => (
              <div key={s.id}>
              <div className="flex items-center gap-3 rounded-radius-md p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-foreground">{s.planName}</p>
                  <p className="truncate text-meta text-muted-foreground">{trx("{priceCents} per term", { priceCents: formatUSD(s.priceCents) })}{s.endDate ? tr(" · current term ends {endDate}", { endDate: formatDateHN(s.endDate) }) : ""}
                    {s.viaPayPal ? tr(" · renews through PayPal") : ""}
                  </p>
                </div>
                <Switch
                  checked={s.autoRenew}
                  disabled={toggle.isPending || stopPayPal.isPending}
                  aria-label={s.viaPayPal ? tr("Auto-renew {planName} through PayPal", { planName: s.planName }) : tr("Auto-renew {planName} from balance", { planName: s.planName })}
                  onCheckedChange={(v) => {
                    if (s.viaPayPal && !v) { setConfirmPayPalOff(s.id); return; }
                    toggle.mutate({ id: s.id, enabled: v });
                  }}
                />
              </div>
              {confirmPayPalOff === s.id && (
                <div className="mx-3 mb-3 rounded-radius-md bg-inset p-3">
                  <p className="text-[14px] text-foreground">{trx("PayPal stops charging {priceCents}. {planName} keeps running", { priceCents: formatUSD(s.priceCents), planName: s.planName })}{s.endDate ? ` until ${formatDateHN(s.endDate)}` : tr(" to the end of this term")}.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" loading={stopPayPal.isPending} onClick={() => stopPayPal.mutate(s.id)}>{tr("Turn off")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmPayPalOff(null)}>{tr("Keep it")}</Button>
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        )}
      </section>

      {w.entries.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[20px] font-semibold text-foreground">{tr("History")}</h2>
          <div className="rounded-radius-md bg-card p-1.5 shadow-figma">
            {w.entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-radius-md p-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-foreground">{e.note ?? (e.kind === "topup" ? "Top-up" : "Renewal")}</p>
                  <p className="text-meta text-muted-foreground">{format(new Date(e.created_at), "MMM d, yyyy · h:mm a", { locale: dfLocale })}</p>
                </div>
                <span className={cn("shrink-0 text-[16px] font-semibold tabular-nums", e.amount_cents > 0 ? "text-positive" : "text-foreground")}>
                  {e.amount_cents > 0 ? "+" : "−"}{formatUSD(Math.abs(e.amount_cents))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Pick an amount and a way to pay; the invoice is the checkout's own. */
function TopUp({ suggestedCents, minCents, onDone }: { suggestedCents: number | null; minCents: number; onDone: () => void }) {
  const { userData } = useAuth();
  const { enabled, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const { convertToSats, btcPrice } = useBtcPrice();
  const methods = useMemo(() => enabled.filter((m): m is PaymentMethod => m === "lightning" || m === "onchain" || m === "paypal"), [enabled]);
  const [method, setMethod] = useState<PaymentMethod>("lightning");
  useEffect(() => { if (methods.length && !methods.includes(method)) setMethod(methods[0]); }, [methods, method]);
  const [amount, setAmount] = useState<number>(suggestedCents ?? PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = custom ? Math.round(Number(custom) * 100) : amount;
  const total = addSurchargeCents(base, method);
  const valid = Number.isFinite(base) && base >= minCents && base <= 200000;

  const confirm = async (reference: string) => {
    for (let i = 0; i < 6; i++) {
      const { data } = await accountApi("/account/wallet/topups/confirm", { method: "POST", body: JSON.stringify({ reference }) });
      if ((data as { status?: string })?.status === "paid") {
        toast.success(tr("{base} added to your balance", { base: formatUSD(base) }));
        setPaying(false);
        onDone();
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    toast(tr("Payment received — the balance updates in a minute."));
    setPaying(false);
    onDone();
  };

  const register = async (reference: string, m: "lightning" | "onchain" | "paypal") => {
    const { error } = await accountApi("/account/wallet/topups", {
      method: "POST", body: JSON.stringify({ amountCents: base, method: m, reference }),
    });
    if (error) toast.error(error.message || tr("Couldn't start the top-up"));
  };

  const inv = useInvoicePayment({
    onInvoiceReady: (ref, m) => { void register(ref, m); },
    onPaid: (ref) => { void confirm(ref); },
  });

  const start = async () => {
    if (!valid) return;
    setPaying(true);
    if (method === "paypal") return; // the PayPal panel takes it from here
    if (!btcPrice) { toast.error(tr("BTC price not loaded yet.")); setPaying(false); return; }
    setBusy(true);
    try {
      const sats = convertToSats(total / 100);
      const meta = {
        context: "wallet_topup",
        service_name: TOPUP_SERVICE_NAME,
        client_name: userData?.name ?? userData?.display_name ?? undefined,
        client_email: userData?.email ?? undefined,
      };
      const ok = await inv.start({
        method: method === "onchain" ? "onchain" : "lightning",
        amountCents: total,
        amountSats: sats,
        description: `${TOPUP_SERVICE_NAME} · ${formatUSD(base)}`,
        context: "wallet_topup",
        meta,
      });
      // No invoice: back to the amounts, not a spinner that never stops.
      if (!ok) setPaying(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-radius-md bg-card p-4 shadow-figma">
      <h2 className="text-[20px] font-semibold text-foreground">{tr("Top up")}</h2>
      {!paying ? (
        <>
          {/* The usual amounts as one even row; any other amount gets a
              full-width field of its own rather than a pill squeezed in. */}
          <div className="grid grid-cols-3 gap-2">
            {[...new Set([...(suggestedCents ? [suggestedCents] : []), ...PRESETS])].slice(0, 3).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setAmount(c); setCustom(""); }}
                className={cn(
                  "h-12 rounded-full px-2 text-[15px] font-semibold tabular-nums transition-colors",
                  !custom && amount === c ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70",
                )}
              >
                {formatUSD(c)}
              </button>
            ))}
          </div>
          <label className={cn(
            "flex h-12 items-center gap-2 rounded-full bg-muted px-4 transition-colors",
            custom && "outline outline-2 -outline-offset-2 outline-primary",
          )}>
            <span className="text-[16px] font-semibold text-muted-foreground">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={minCents / 100}
              placeholder={tr("Other amount — from {minCents}", { minCents: formatUSD(minCents) })}
              aria-label={tr("Other amount in dollars")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <PaymentMethodTiles value={method} onChange={setMethod} available={methods} />
          <Button className="w-full" disabled={!valid || !methods.length} loading={busy} onClick={() => void start()}>{trx("Top up {base}", { base: formatUSD(base) })}{total > base ? tr(" · pay {total} incl. {surchargePercent}% fee", { total: formatUSD(total), surchargePercent: surchargePercent(method) }) : ""}
          </Button>
          {!valid && <p className="text-meta text-muted-foreground">{trx("From {minCents}.", { minCents: formatUSD(minCents) })}</p>}
        </>
      ) : method === "paypal" ? (
        <>
          <PayPalPanel
            totalCents={total}
            orderMeta={{ description: `${TOPUP_SERVICE_NAME} · ${formatUSD(base)}`, service_name: TOPUP_SERVICE_NAME }}
            onPaid={(captureId) => { void register(captureId, "paypal").then(() => confirm(captureId)); }}
          />
          <Button variant="ghost" className="w-full" onClick={() => setPaying(false)}>{tr("Cancel")}</Button>
        </>
      ) : (
        <>
          {(inv.state.invoice || inv.state.address) ? (
            <InvoiceQrPanel
              mode={inv.state.invoice ? "lightning" : "onchain"}
              invoice={inv.state.invoice}
              address={inv.state.address}
              uri={inv.state.uri}
              sats={inv.state.sats ?? 0}
              totalCents={total}
              isPaid={inv.state.isPaid}
              isExpired={inv.state.isExpired}
              onRetry={() => { inv.reset(); void start(); }}
              successLabel={tr("Adding to your balance…")}
            />
          ) : <div className="flex justify-center py-8"><Spinner /></div>}
          <Button variant="ghost" className="w-full" onClick={() => { inv.reset(); setPaying(false); }}>{tr("Cancel")}</Button>
        </>
      )}
    </section>
  );
}
