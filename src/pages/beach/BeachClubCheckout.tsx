import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckoutStickyFooter } from "@/components/patterns/CheckoutStickyFooter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Zap, CheckCircle2, RefreshCw, Wallet, Bitcoin, Minus, Plus, CalendarDays } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";

interface BeachPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_per_person_cents: number;
}

const BeachClubCheckout = () => {
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
  const renewFromSubId = searchParams.get("renew");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  // Stable idempotency key per checkout attempt for the /renew endpoint.
  const renewIdempotencyKeyRef = useRef<string | null>(null);

  const [showPayment, setShowPayment] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [people, setPeople] = useState(1);
  const [startDate, setStartDate] = useState(format(nowHN(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const mutationCalledRef = useRef(false);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();

  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

  const { data: plan } = useQuery({
    queryKey: ["beach-club-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("beach_club_plans").select("*").eq("id", planId).single();
      if (error) throw error;
      return data as BeachPlan;
    },
    enabled: !!planId,
  });

  const totalCents = (plan?.price_per_person_cents ?? 0) * people;
  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const totalUsdDollars = centsToDollars(effectiveTotalCents);
  const estimatedSats = convertToSats(totalUsdDollars);
  const endDate = addMonths(new Date(`${startDate}T00:00:00`), 1);

  // Unified Lightning + on-chain invoice generation + polling.
  const inv = useInvoicePayment({
    onPaid: (paymentRef, method) => {
      setIsPaid(true);
      if (!mutationCalledRef.current) {
        mutationCalledRef.current = true;
        createSubscriptionMutation.mutate({ paymentRef, status: "paid", method });
      }
    },
  });

  // Track the pending row so on-payment we can UPDATE it (not create a new one).
  // This keeps a record even if the user closes the tab mid-payment — the admin
  // will see it in "pending" status and can approve/renew instead of it disappearing.
  const pendingSubIdRef = useRef<string | null>(null);

  /**
   * Reserve a pending subscription BEFORE we start the payment. Idempotent:
   * subsequent calls (e.g. if the user retries with a different method) update
   * the same row instead of creating orphans.
   */
  const reservePendingSubscription = async (method: string): Promise<string | null> => {
    if (!plan) return null;
    const commonFields = {
      plan_id: plan.id,
      plan_name: plan.name,
      user_id: userData?.id ?? null,
      customer_name: userData?.name || userData?.display_name || null,
      customer_email: userData?.email || null,
      people,
      start_date: startDate,
      end_date: format(endDate, "yyyy-MM-dd"),
      price_per_person_cents: plan.price_per_person_cents,
      total_cents: totalCents,
      payment_status: "pending",
      payment_method: method,
      status: "pending",
    };
    try {
      if (pendingSubIdRef.current) {
        await supabaseDb.from("beach_club_subscriptions")
          .update({ ...commonFields, updated_at: new Date().toISOString() })
          .eq("id", pendingSubIdRef.current);
        return pendingSubIdRef.current;
      }
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .insert(commonFields)
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

  const createSubscriptionMutation = useMutation({
    mutationFn: async (options: { paymentRef: string; status: "paid" | "pending"; method: string }) => {
      if (!plan) throw new Error("Missing plan data");

      // Renewal path: server verifies the payment ref against the provider,
      // enforces idempotency, and extends the existing beach_club_subscriptions
      // row (no duplicate created).
      if (renewFromSubId && options.status === "paid") {
        const idempotencyKey = renewIdempotencyKeyRef.current || crypto.randomUUID();
        renewIdempotencyKeyRef.current = idempotencyKey;
        const { error } = await accountApi(`/account/beach/subscriptions/${renewFromSubId}/renew`, {
          method: "POST",
          body: JSON.stringify({
            payment_method: options.method === "fiat" ? "paypal" : options.method,
            payment_reference: options.paymentRef,
            amount_cents: totalCents,
            idempotency_key: idempotencyKey,
          }),
        });
        if (error) throw error;
        return { id: renewFromSubId };
      }

      const patch = {
        payment_status: options.status,
        payment_method: options.method,
        payment_reference: options.paymentRef,
        status: options.status === "paid" ? "active" : "pending",
        updated_at: new Date().toISOString(),
      };

      // Fast path: we already reserved a pending row → update it in place.
      if (pendingSubIdRef.current) {
        const { data, error } = await supabaseDb
          .from("beach_club_subscriptions")
          .update(patch)
          .eq("id", pendingSubIdRef.current)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // Fallback: no reservation (older tab, race, etc.) — insert fresh.
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .insert({
          plan_id: plan.id,
          plan_name: plan.name,
          user_id: userData?.id ?? null,
          customer_name: userData?.name || userData?.display_name || null,
          customer_email: userData?.email || null,
          people,
          start_date: startDate,
          end_date: format(endDate, "yyyy-MM-dd"),
          price_per_person_cents: plan.price_per_person_cents,
          total_cents: totalCents,
          ...patch,
        })
        .select()
        .single();
      if (error) throw error;
      pendingSubIdRef.current = data.id;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-beach-club-subscriptions"] });
      setShowSuccess(true);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      mutationCalledRef.current = false;
    },
  });

  const getClientName = () => userData?.name || userData?.display_name || userData?.email || undefined;
  const paymentMeta = () => ({
    service_name: "Beach Club membership",
    client_name: getClientName(),
    client_email: userData?.email,
    plan_name: plan?.name,
    duration: `${people} ${people === 1 ? "person" : "people"} · 1 month`,
    booking_id: planId,
    admin_url: `${window.location.origin}/admin/beach-club/plans`,
    selected_date_time: startDate,
  });

  const generateInvoice = async () => {
    if (!plan) return;
    if (people < 1) { toast.error("Add at least one person."); return; }
    if (!startDate) { toast.error("Choose a start date."); return; }

    setIsGenerating(true);
    const description = `Beach Club - ${plan.name} - ${people}p - ${formatUSD(totalCents)}`;

    // Reserve a pending subscription BEFORE we start the payment. If the user
    // closes the tab after paying, this row survives so admins can complete it.
    const methodKey = paymentMethod === "infinita" ? "crypto" : paymentMethod;
    const reserved = await reservePendingSubscription(methodKey);
    if (!reserved) { setIsGenerating(false); return; }

    try {
      if (paymentMethod === "infinita" || paymentMethod === "paypal") {
        setShowPayment(true);
        return;
      }

      if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
      const satsAmount = convertToSats(totalUsdDollars);
      if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); return; }

      mutationCalledRef.current = false;
      setShowPayment(true);
      await inv.start({
        method: paymentMethod === "onchain" ? "onchain" : "lightning",
        amountCents: effectiveTotalCents,
        amountSats: satsAmount,
        description,
        context: "beach_club_subscription",
        externalId: `beach-${plan.id}-${people}p-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
        meta: paymentMeta(),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInfinitaPaid = (paymentId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      // SimpleFi confirms the payment via status check, so it's recorded as paid.
      createSubscriptionMutation.mutate({ paymentRef: paymentId, status: "paid", method: "crypto" });
    }
  };

  const handlePaypalPaid = (captureId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createSubscriptionMutation.mutate({ paymentRef: captureId, status: "paid", method: "paypal" });
    }
  };

  return (
    <UserLayout title="Checkout" showBackButton backTo="/services/beach-club" showBottomNav={false}>
      <Sheet open={showSuccess} onOpenChange={(open) => { if (!open) navigate("/my-subscriptions"); }}>
        <SheetContent side="bottom" className="rounded-t-3xl px-space-6 pb-space-8 pt-space-6">
          <SheetHeader className="items-center">
            <CheckCircle2 className="h-16 w-16 text-accent mb-space-2" />
            <SheetTitle className="text-2xl">
              {paymentMethod === "infinita" ? "Payment Submitted!" : "Membership Confirmed!"}
            </SheetTitle>
            <SheetDescription>
              {paymentMethod === "infinita"
                ? "An admin will verify your transaction and activate your Beach Club membership."
                : "Your Beach Club membership is active. Our team will be in touch with access details."}
            </SheetDescription>
          </SheetHeader>
          <Button className="mt-space-6 w-full" size="xl" onClick={() => navigate("/my-subscriptions")}>
            View My Subscriptions
          </Button>
          <Button variant="ghost" className="mt-space-2 w-full" onClick={() => navigate("/services/beach-club")}>
            Back to Beach Club
          </Button>
        </SheetContent>
      </Sheet>

      <div className="mx-auto max-w-xl px-4 py-4 md:py-8 space-y-4 pb-32">
        {plan && (
          <>
            <section>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Step 2 of 2</p>
              <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-foreground">
                {showPayment ? "Complete payment" : "Review & pay"}
              </h1>
            </section>

            {/* Plan + price summary */}
            <section className="overflow-hidden rounded-3xl bg-card">
              <div className="p-5">
                <h2 className="text-xl font-black tracking-tight text-foreground">{plan.name}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Beach Club membership · per person, monthly</p>
              </div>

              {!showPayment && (
                <div className="space-y-4 px-5 pb-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">People</Label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <Button type="button" size="iconSm" variant="outline" className="rounded-full"
                        onClick={() => setPeople((p) => Math.max(1, p - 1))} aria-label="Fewer people">
                        <Minus />
                      </Button>
                      <span className="w-10 text-center text-lg font-black tabular-nums">{people}</span>
                      <Button type="button" size="iconSm" variant="outline" className="rounded-full"
                        onClick={() => setPeople((p) => p + 1)} aria-label="More people">
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="bc-start" className="text-xs text-muted-foreground">Start date</Label>
                    <div className="relative mt-1.5">
                      <Input
                        id="bc-start"
                        type="date"
                        className="h-12 w-full rounded-2xl pr-11 text-left [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-left"
                        value={startDate}
                        min={format(nowHN(), "yyyy-MM-dd")}
                        onChange={(e) => setStartDate(e.target.value)}
                        onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                      />
                      <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/60 border-t border-border/60">
                <SummaryRow label="Price / person" value={`${formatUSD(plan.price_per_person_cents)} / mo`} />
                <SummaryRow label="People" value={String(people)} />
                <SummaryRow label="Duration" value="1 month" />
                <SummaryRow label="Start date" value={format(new Date(`${startDate}T00:00:00`), "d MMM yyyy")} />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border/60 p-5">
                <span className="text-lg font-black text-foreground">Total today</span>
                <div className="text-right">
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none">{formatUSD(effectiveTotalCents)}</p>
                  {feePct > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Base {formatUSD(totalCents)} + {feePct}% processing fee</p>
                  )}
                  {btcPrice && (
                    <p className="mt-1 text-sm text-muted-foreground">≈ {(inv.state.sats ?? estimatedSats).toLocaleString()} sats</p>
                  )}
                </div>
              </div>
            </section>

            {/* Payment flow */}
            {showPayment && paymentMethod === "infinita" ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5">
                <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with LIVES</h2>
                <InfinitaPaymentPanel totalCents={effectiveTotalCents} onPaid={handleInfinitaPaid}
                  orderMeta={{ description: `Beach Club - ${plan.name} - ${people}p - ${formatUSD(effectiveTotalCents)}`, ...paymentMeta() }} />
              </section>
            ) : showPayment && paymentMethod === "paypal" ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5">
                <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with PayPal</h2>
                {isPaid ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-500/10 p-4">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium text-green-500">Payment received! Activating membership…</span>
                  </div>
                ) : (
                  <PayPalPanel totalCents={effectiveTotalCents} onPaid={handlePaypalPaid}
                    orderMeta={{ description: `Beach Club - ${plan.name} - ${people}p - ${formatUSD(effectiveTotalCents)}`, ...paymentMeta() }} />
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
                successLabel="Activating membership…"
              />
            ) : !showPayment ? (
              <div className="space-y-3">
                <h2 className="text-xl font-black tracking-tight text-foreground">Payment method</h2>
                <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />

                {paymentMethod === "lightning" && btcPrice && (
                  <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
                    <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                    <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price"><RefreshCw className="h-3 w-3" /></Button>
                  </div>
                )}
                {paymentMethod === "onchain" && btcPrice && (
                  <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
                    <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                    <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price"><RefreshCw className="h-3 w-3" /></Button>
                  </div>
                )}
                {paymentMethod === "infinita" && (
                  <div className="flex items-center gap-2 rounded-2xl bg-purple-500/10 p-3 text-sm">
                    <Wallet className="h-4 w-4 text-purple-500 shrink-0" />
                    <span className="text-muted-foreground">Pay with <span className="font-medium text-foreground">LIVES</span> via SimpleFi checkout.</span>
                  </div>
                )}
                {paymentMethod === "paypal" && (
                  <div className="flex items-center gap-2 rounded-2xl bg-[#0070ba]/10 p-3 text-sm">
                    <span className="text-muted-foreground">Pay <span className="font-medium text-foreground">{formatUSD(effectiveTotalCents)}</span> securely with PayPal or card.</span>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Sticky Pay button — unified pattern across all checkouts */}
      {plan && !showPayment && (
        <CheckoutStickyFooter>
          {enabledMethods.length === 0 && (
            <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400">
              Payments are temporarily unavailable. Try again in a few minutes.
            </p>
          )}
          <Button size="lg" className="h-14 w-full rounded-2xl bg-primary text-black hover:bg-[hsl(var(--brand-accent-hover))] text-base font-bold"
            onClick={generateInvoice}
            loading={isGenerating}
            disabled={
              isGenerating ||
              enabledMethods.length === 0 ||
              !enabledMethods.includes(paymentMethod) ||
              ((paymentMethod === "lightning" || paymentMethod === "onchain") && (isPriceLoading || !btcPrice))
            }>
            {paymentMethod === "lightning" ? (
              <>{!isGenerating && <Zap className="h-5 w-5" />}{isGenerating ? "Generating Invoice..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats`}</>
            ) : paymentMethod === "onchain" ? (
              <>{!isGenerating && <Bitcoin className="h-5 w-5" />}{isGenerating ? "Generating address..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats on-chain`}</>
            ) : paymentMethod === "paypal" ? (
              "Continue with PayPal"
            ) : (
              isGenerating ? "Creating Payment..." : `Pay ${formatUSD(effectiveTotalCents)} with LIVES`
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
      <span className="text-sm font-medium text-foreground text-right tabular-nums">{value}</span>
    </div>
  );
}

export default BeachClubCheckout;
