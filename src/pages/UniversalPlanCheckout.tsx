import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckoutStickyFooter } from "@/components/patterns/CheckoutStickyFooter";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, CheckCircle2, RefreshCw, Wallet, Bitcoin, CalendarDays, Sparkles } from "lucide-react";
import { CheckoutSuccessPanel } from "@/components/patterns/CheckoutSuccessPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { toast } from "sonner";
import { format } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { NotesField } from "@/components/patterns/NotesField";
import { phoneError } from "@/components/patterns/CustomerPhone";
import { usePhonePrefill } from "@/hooks/useAccountPhone";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { attachPaymentReference } from "@/lib/payments/pendingReference";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { serviceListingHref, serviceSlug } from "@/lib/services/serviceUrls";
import { endDateFor, termLabel, includedLabel } from "@/lib/services/planPeriod";

/**
 * Checkout for a plan in the universal `provider_plans` table.
 *
 * The four existing checkouts each write one legacy subscriptions table. This
 * one writes `provider_subscriptions`, which is where a provider with no legacy
 * table keeps its customers. Payment handling is deliberately identical to
 * BeachClubCheckout — same hooks, same panels, same reserve-then-update
 * ordering — so there is one payment flow on the platform, not five.
 */
interface PlanRow {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  period: string | null;
  included_quantity: number | null;
  included_unit: string | null;
  provider_name: string | null;
}

const UniversalPlanCheckout = () => {
  const { archetypeKey: serviceSegment, planId } = useParams<{ archetypeKey: string; planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userUuid = useUserUuid();

  const [showPayment, setShowPayment] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [startDate, setStartDate] = useState(format(nowHN(), "yyyy-MM-dd"));
  // The universal checkout collected nothing but a start date. Every other
  // purchase on the platform asks how to reach the buyer and lets them say
  // something; a massage booked here had neither.
  const [phone, setPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState("");
  const [notes, setNotes] = useState("");
  usePhonePrefill(phone, setPhone);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const mutationCalledRef = useRef(false);
  const pendingSubIdRef = useRef<string | null>(null);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();

  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

  const listingHref = serviceListingHref(serviceSegment ?? "");

  const { data: plan, isLoading: planLoading, isError: planError } = useQuery({
    queryKey: ["universal-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, provider_id, name, description, price_cents, period, included_quantity, included_unit, providers(name)")
        .eq("id", planId!)
        .eq("status", "active")
        .single();
      if (error) throw error;
      const row = data as unknown as PlanRow & { providers?: { name?: string } | null };
      return { ...row, provider_name: row.providers?.name ?? null } as PlanRow;
    },
    enabled: !!planId,
  });

  const totalCents = plan?.price_cents ?? 0;
  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const estimatedSats = convertToSats(centsToDollars(effectiveTotalCents));
  const endDate = endDateFor(startDate, plan?.period ?? null);

  const inv = useInvoicePayment({
    onPaid: (paymentRef, method) => {
      setIsPaid(true);
      if (!mutationCalledRef.current) {
        mutationCalledRef.current = true;
        createSubscription.mutate({ paymentRef, status: "paid", method });
      }
    },
    // The reference goes on the reserved row as soon as it exists, so a
    // tab that dies before the payment confirms still leaves something the
    // reconcile cron can verify. See lib/payments/pendingReference.
    onInvoiceReady: (paymentRef, method) => {
      void attachPaymentReference(supabaseDb, "provider_subscriptions", pendingSubIdRef.current, paymentRef, method);
    },
  });

  /**
   * provider_subscriptions has no columns for plan name, customer name or the
   * processing fee, so they go in `metadata`. Recording them at purchase time
   * matters: the plan row can be renamed or deleted afterwards and the
   * subscription still has to say what was actually bought.
   */
  const buildRow = (method: string) => ({
    provider_id: plan!.provider_id,
    plan_id: plan!.id,
    user_id: userUuid,
    start_date: startDate,
    end_date: format(endDate, "yyyy-MM-dd"),
    price_cents: totalCents,
    payment_status: "pending",
    payment_method: method,
    status: "pending",
    customer_whatsapp: phone.trim() || null,
    notes: notes.trim() || null,
    metadata: {
      plan_name: plan!.name,
      provider_name: plan!.provider_name,
      period: plan!.period,
      included_quantity: plan!.included_quantity,
      included_unit: plan!.included_unit,
      customer_name: userData?.name || userData?.display_name || null,
      customer_email: userData?.email || null,
      surcharge_cents: effectiveTotalCents - totalCents,
      total_charged_cents: effectiveTotalCents,
    },
  });

  /**
   * Reserve the row BEFORE payment starts, and update it afterwards. If the
   * customer closes the tab mid-payment the row survives as `pending`, so an
   * admin sees an attempted purchase instead of nothing at all.
   */
  const reservePending = async (method: string): Promise<string | null> => {
    if (!plan) return null;
    try {
      if (pendingSubIdRef.current) {
        await supabaseDb
          .from("provider_subscriptions")
          .update({ ...buildRow(method), updated_at: new Date().toISOString() })
          .eq("id", pendingSubIdRef.current);
        return pendingSubIdRef.current;
      }
      const { data, error } = await supabaseDb
        .from("provider_subscriptions")
        .insert(buildRow(method))
        .select("id")
        .single();
      if (error) throw error;
      pendingSubIdRef.current = data.id;
      return data.id;
    } catch (err: any) {
      toast.error(err?.message || "Could not reserve subscription");
      return null;
    }
  };

  const createSubscription = useMutation({
    mutationFn: async (o: { paymentRef: string; status: "paid" | "pending"; method: string }) => {
      if (!plan) throw new Error("Missing plan data");
      const patch = {
        payment_status: o.status,
        payment_method: o.method,
        payment_reference: o.paymentRef,
        status: o.status === "paid" ? "active" : "pending",
        updated_at: new Date().toISOString(),
      };
      if (pendingSubIdRef.current) {
        const { data, error } = await supabaseDb
          .from("provider_subscriptions")
          .update(patch).eq("id", pendingSubIdRef.current).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabaseDb
        .from("provider_subscriptions")
        .insert({ ...buildRow(o.method), ...patch })
        .select().single();
      if (error) throw error;
      pendingSubIdRef.current = data.id;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-universal-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-subscriptions"] });
      setShowSuccess(true);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      mutationCalledRef.current = false;
    },
  });

  const paymentMeta = () => ({
    service_name: plan?.provider_name ?? "Subscription",
    client_name: userData?.name || userData?.display_name || userData?.email || undefined,
    client_email: userData?.email,
    plan_name: plan?.name,
    duration: termLabel(plan?.period ?? null),
    booking_id: planId,
    admin_url: `${window.location.origin}/admin/marketplace/plans`,
    selected_date_time: startDate,
  });

  const startPayment = async () => {
    if (!plan) return;
    if (totalCents <= 0) { toast.error("This plan has no price yet."); return; }
    if (!startDate) { toast.error("Choose a start date."); return; }
    // provider_subscriptions.user_id is a uuid column and the JWT id may be a
    // Google-format string; inserting that raises 22P02 and fails the whole
    // statement. Better to say so than to lose the sale to a Postgres error.
    if (!userUuid) { toast.error("We couldn't verify your account. Please sign in again."); return; }

    setIsGenerating(true);
    try {
      const methodKey = paymentMethod === "infinita" ? "crypto" : paymentMethod;
      const reserved = await reservePending(methodKey);
      if (!reserved) return;

      if (paymentMethod === "infinita" || paymentMethod === "paypal") {
        setShowPayment(true);
        return;
      }

      if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
      const sats = convertToSats(centsToDollars(effectiveTotalCents));
      if (sats <= 0) { toast.error("Unable to calculate payment amount."); return; }

      mutationCalledRef.current = false;
      setShowPayment(true);
      await inv.start({
        method: paymentMethod === "onchain" ? "onchain" : "lightning",
        amountCents: effectiveTotalCents,
        amountSats: sats,
        description: `${plan.provider_name ?? "Plan"} - ${plan.name} - ${formatUSD(totalCents)}`,
        context: "provider_subscription",
        externalId: `psub-${plan.id}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
        meta: paymentMeta(),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const onExternalPaid = (ref: string, method: "crypto" | "paypal") => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createSubscription.mutate({ paymentRef: ref, status: "paid", method });
    }
  };

  if (planLoading) {
    return (
      <UserLayout title="Checkout" showBackButton backTo={listingHref} showBottomNav={false}>
        <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          <div className="h-56 animate-pulse rounded-3xl bg-muted" />
        </div>
      </UserLayout>
    );
  }

  if (planError || !plan) {
    return (
      <UserLayout title="Checkout" showBackButton backTo={listingHref} showBottomNav={false}>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Plan not available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been withdrawn. Browse what's on offer instead.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <a href={listingHref}>Back</a>
          </Button>
        </div>
      </UserLayout>
    );
  }

  if (showSuccess) {
    return (
      <UserLayout title="Checkout" showBackButton={false} showBottomNav={false}>
        <div className="mx-auto max-w-xl px-4 py-6">
          <CheckoutSuccessPanel
            icon={Sparkles}
            amount={formatUSD(effectiveTotalCents)}
            eyebrow={paymentMethod === "infinita" ? "Payment submitted" : "Subscription confirmed"}
            subtitle={
              paymentMethod === "infinita"
                ? `An admin will verify your LIVES transaction and activate your ${plan.name} subscription.`
                : `Your ${plan.name} subscription is active. We'll be in touch with the details.`
            }
            ctaLabel="View my subscriptions"
            onCta={() => navigate("/my-subscriptions")}
            secondary={{ label: "Back", onClick: () => navigate(listingHref) }}
          />
        </div>
      </UserLayout>
    );
  }

  const orderDescription = `${plan.provider_name ?? "Plan"} - ${plan.name} - ${formatUSD(effectiveTotalCents)}`;

  return (
    <UserLayout title="Checkout" showBackButton backTo={listingHref} showBottomNav={false}>
      <div className="mx-auto max-w-xl space-y-4 px-4 py-4 pb-32 md:py-8">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Step 2 of 2</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground md:text-3xl">
            {showPayment ? "Complete payment" : "Review & pay"}
          </h1>
        </section>

        <section className="overflow-hidden rounded-3xl bg-card">
          <div className="p-5">
            <h2 className="text-xl font-black tracking-tight text-foreground">{plan.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {plan.provider_name ? `${plan.provider_name} · ` : ""}{termLabel(plan.period)}
            </p>
          </div>

          {!showPayment && (
            <div className="px-5 pb-4">
              <Label htmlFor="up-start" className="text-xs text-muted-foreground">Start date</Label>
              <div className="relative mt-1.5">
                <Input
                  id="up-start"
                  type="date"
                  className="h-12 w-full rounded-2xl pr-11 text-left [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-left"
                  value={startDate}
                  min={format(nowHN(), "yyyy-MM-dd")}
                  onChange={(e) => setStartDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              </div>

              <Label htmlFor="up-phone" className="mt-4 block text-xs text-muted-foreground">
                WhatsApp <span className="text-destructive">*</span>
              </Label>
              <Input
                id="up-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="mt-1.5 h-12 rounded-2xl"
                placeholder="+504 1234 5678"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); if (phoneErr) setPhoneErr(""); }}
                onBlur={() => setPhoneErr(phone.trim() ? (phoneError(phone) ?? "") : "")}
              />
              {phoneErr && <p className="mt-1 text-xs text-destructive">{phoneErr}</p>}

              <div className="mt-4">
                <NotesField value={notes} onChange={setNotes} />
              </div>
            </div>
          )}

          <div className="divide-y divide-border/60 border-t border-border/60">
            <SummaryRow label="Plan" value={plan.name} />
            {includedLabel(plan.included_quantity, plan.included_unit, plan.period) && (
              <SummaryRow label="Included" value={includedLabel(plan.included_quantity, plan.included_unit, plan.period)!} />
            )}
            <SummaryRow label="Term" value={termLabel(plan.period)} />
            <SummaryRow label="Start date" value={format(new Date(`${startDate}T00:00:00`), "d MMM yyyy")} />
            <SummaryRow label="Ends" value={format(endDate, "d MMM yyyy")} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 p-5">
            <span className="text-lg font-black text-foreground">Total today</span>
            <div className="text-right">
              <p className="text-2xl font-black leading-none tabular-nums text-foreground">
                {formatUSD(effectiveTotalCents)}
              </p>
              {feePct > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Base {formatUSD(totalCents)} + {feePct}% processing fee
                </p>
              )}
              {btcPrice && (
                <p className="mt-1 text-sm text-muted-foreground">
                  ≈ {(inv.state.sats ?? estimatedSats).toLocaleString()} sats
                </p>
              )}
            </div>
          </div>
        </section>

        {showPayment && paymentMethod === "infinita" ? (
          <section className="overflow-hidden rounded-3xl bg-card p-5">
            <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with LIVES</h2>
            <InfinitaPaymentPanel
              totalCents={effectiveTotalCents}
              onPaid={(id: string) => onExternalPaid(id, "crypto")}
              onInvoiceReady={(paymentId: string) => attachPaymentReference(supabaseDb, "provider_subscriptions", pendingSubIdRef.current, paymentId, "crypto")}
              orderMeta={{ description: orderDescription, ...paymentMeta() }}
            />
          </section>
        ) : showPayment && paymentMethod === "paypal" ? (
          <section className="overflow-hidden rounded-3xl bg-card p-5">
            <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with PayPal</h2>
            {isPaid ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-500/10 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-green-500">Payment received! Activating…</span>
              </div>
            ) : (
              <PayPalPanel
                totalCents={effectiveTotalCents}
                onPaid={(id: string) => onExternalPaid(id, "paypal")}
                orderMeta={{ description: orderDescription, ...paymentMeta() }}
              />
            )}
          </section>
        ) : showPayment && (inv.state.invoice || inv.state.address) ? (
          <InvoiceQrPanel
            mode={inv.state.invoice ? "lightning" : "onchain"}
            invoice={inv.state.invoice}
            address={inv.state.address}
            uri={inv.state.uri}
            sats={inv.state.sats ?? 0}
            totalCents={effectiveTotalCents}
            isPaid={isPaid}
            isExpired={inv.state.isExpired}
            onRetry={() => inv.reset()}
            successLabel="Activating subscription…"
          />
        ) : !showPayment ? (
          <div className="space-y-3">
            <h2 className="text-xl font-black tracking-tight text-foreground">Payment method</h2>
            <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />

            {(paymentMethod === "lightning" || paymentMethod === "onchain") && btcPrice && (
              <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
                <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}
            {paymentMethod === "infinita" && (
              <div className="flex items-center gap-2 rounded-2xl bg-purple-500/10 p-3 text-sm">
                <Wallet className="h-4 w-4 shrink-0 text-purple-500" />
                <span className="text-muted-foreground">
                  Pay with <span className="font-medium text-foreground">LIVES</span> via SimpleFi checkout.
                </span>
              </div>
            )}
            {paymentMethod === "paypal" && (
              <div className="flex items-center gap-2 rounded-2xl bg-[#0070ba]/10 p-3 text-sm">
                <span className="text-muted-foreground">
                  Pay <span className="font-medium text-foreground">{formatUSD(effectiveTotalCents)}</span> securely with PayPal or card.
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {!showPayment && (
        <CheckoutStickyFooter>
          <AddToCartButton
            className="mb-2 w-full"
            line={{
              service: "plan",
              providerId: plan.provider_id,
              providerName: (plan as any).providers?.name ?? "Provider",
              planId: plan.id,
              planName: plan.name,
              unitPriceCents: totalCents,
              periods: 1,
            }}
          />
          {enabledMethods.length === 0 && (
            <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400">
              Payments are temporarily unavailable. Try again in a few minutes.
            </p>
          )}
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-black hover:bg-[hsl(var(--brand-accent-hover))]"
            onClick={startPayment}
            loading={isGenerating}
            disabled={
              isGenerating ||
              totalCents <= 0 ||
              enabledMethods.length === 0 ||
              !enabledMethods.includes(paymentMethod) ||
              ((paymentMethod === "lightning" || paymentMethod === "onchain") && (isPriceLoading || !btcPrice))
            }
          >
            {paymentMethod === "lightning" ? (
              <>
                {!isGenerating && <Zap className="h-5 w-5" />}
                {isGenerating ? "Generating Invoice..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats`}
              </>
            ) : paymentMethod === "onchain" ? (
              <>
                {!isGenerating && <Bitcoin className="h-5 w-5" />}
                {isGenerating ? "Generating address..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats on-chain`}
              </>
            ) : paymentMethod === "paypal" ? (
              `Pay ${formatUSD(effectiveTotalCents)} · PayPal`
            ) : (
              isGenerating ? "Creating Payment..." : `Pay ${formatUSD(effectiveTotalCents)} · LIVES`
            )}
          </Button>
        </CheckoutStickyFooter>
      )}
    </UserLayout>
  );
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default UniversalPlanCheckout;
