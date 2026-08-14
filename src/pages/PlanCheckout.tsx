import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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
import { termLabel, termLabelFor, includedLabel } from "@/lib/services/planPeriod";
import { resolveCheckoutPlan, totalFor } from "@/lib/checkout/planCheckoutModel";
import { buildSubscriptionWrite, endDateOf } from "@/lib/checkout/subscriptionWriter";
import { fetchRenewalSubject, renewalEndpoint, renewalWindow } from "@/lib/checkout/renewal";
import { accountApi } from "@/integrations/supabase/client";

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
  pricing_mode: string | null;
  periods_default: number | null;
  periods_min: number | null;
  periods_max: number | null;
  included_quantity: number | null;
  included_unit: string | null;
  provider_name: string | null;
}

const UniversalPlanCheckout = () => {
  const { archetypeKey: serviceSegment, planId } = useParams<{ archetypeKey: string; planId: string }>();
  const [searchParams] = useSearchParams();
  /**
   * `?renew=<subId>` turns this screen from a purchase into an extension. Every
   * question is the same and every payment method is the same — what changes is
   * that nothing is inserted: the server extends the row that exists, once,
   * against a payment it verified itself.
   */
  const renewSubId = searchParams.get("renew");
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
  /** Minted once per screen, so a retried call extends the period once. */
  const renewKeyRef = useRef<string | null>(null);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();

  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

  const listingHref = serviceListingHref(serviceSegment ?? "");

  const { data: plan, isLoading: planLoading, isError: planError } = useQuery({
    queryKey: ["checkout-plan", planId],
    enabled: !!planId,
    queryFn: () => resolveCheckoutPlan(planId!),
  });

  /**
   * How much of it, and for how long — read off the plan rather than assumed.
   *
   * Until now this checkout sold exactly one period at one price, because that
   * was the only shape it knew. The plan now says how many periods it offers
   * and whether the price is per person, so the arithmetic follows the plan
   * instead of the plan following the arithmetic.
   */
  const periodsMin = plan?.periodsMin ?? 1;
  const periodsCeiling = plan?.periodsMax ?? periodsMin;
  const [periods, setPeriods] = useState(1);
  const [people, setPeople] = useState(1);
  const [selections, setSelections] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  /**
   * What is being renewed. Loaded from the plan's own service, because that is
   * what says which table the subscription lives in — the same seam the writer
   * uses, read from instead of written to.
   */
  const { data: renewSubject, isLoading: renewLoading } = useQuery({
    queryKey: ["checkout-renewal", plan?.service, renewSubId],
    enabled: !!renewSubId && !!plan,
    queryFn: () => fetchRenewalSubject(plan!.service, renewSubId!),
  });
  const renewing = !!renewSubId && !!renewSubject;
  const renewWindow = plan && renewSubject ? renewalWindow(plan, renewSubject) : null;

  useEffect(() => {
    if (!renewSubject) return;
    // A renewal is the same subscription again: same term, same people, same
    // answers. Asking for them a second time invites a different answer, and
    // the server would extend by the original term regardless.
    setPeriods(renewSubject.periods);
    setPeople(renewSubject.people);
    if (renewSubject.phone) setPhone(renewSubject.phone);
    if (renewSubject.notes) setNotes(renewSubject.notes);
    if (renewSubject.address) setAddress(renewSubject.address);
    if (renewSubject.area) setArea(renewSubject.area);
    if (renewSubject.selections.length) setSelections(renewSubject.selections);
  }, [renewSubject]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan || renewSubId) return;
    setPeriods(plan.periodsDefault);
    // Pre-pick as many options as the plan allows, in its own order: a
    // customer who wants exactly what the plan implies should not have to
    // assemble it themselves.
    if (plan.selection) setSelections(plan.selection.options.slice(0, plan.selection.max).map((o) => o.key));
  }, [plan?.universalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const perPerson = plan?.pricingMode === "per_person";
  const unitCents = plan?.unitCents ?? 0;
  const totalCents = plan ? totalFor(plan, periods, people) : 0;
  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const estimatedSats = convertToSats(centsToDollars(effectiveTotalCents));
  // A renewal does not get to choose when it starts: it starts the day the
  // current period ends, or today if that has already passed.
  const effectiveStart = renewWindow?.start ?? startDate;
  const endDate = renewWindow?.end
    ?? (plan ? endDateOf(plan, startDate, periods) : new Date(`${startDate}T00:00:00`));

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
      // A renewal reserved nothing, so there is nothing to attach it to. The
      // audit row carries the reference instead, written by the server.
      if (renewSubId) return;
      void attachPaymentReference(supabaseDb, subTable(), pendingSubIdRef.current, paymentRef, method);
    },
  });

  /**
   * The one seam that is still per service: which table a purchase lands in.
   * The answers are identical; only the row shape differs, and that lives in
   * `buildSubscriptionWrite` rather than in four screens.
   */
  const write = (method: string) => buildSubscriptionWrite(plan!, {
    userId: userData?.id ?? userUuid ?? "",
    userUuid: userUuid ?? null,
    startDate,
    periods,
    people,
    totalCents,
    chargedCents: effectiveTotalCents,
    paymentMethod: method,
    phone: phone.trim(),
    notes: notes.trim(),
    customerName: userData?.name || userData?.display_name || null,
    customerEmail: userData?.email || null,
    address: address.trim(),
    area: area.trim(),
    selections,
  });
  const buildRow = (method: string) => write(method).row;
  const subTable = () => write("lightning").table;

  /**
   * Reserve the row BEFORE payment starts, and update it afterwards. If the
   * customer closes the tab mid-payment the row survives as `pending`, so an
   * admin sees an attempted purchase instead of nothing at all.
   */
  const reservePending = async (method: string): Promise<string | null> => {
    if (!plan) return null;
    // Nothing is reserved for a renewal — the row already exists, and inserting
    // a second one is exactly the bug this replaces.
    if (renewSubId) return renewSubId;
    try {
      if (pendingSubIdRef.current) {
        await supabaseDb
          .from(subTable())
          .update({ ...buildRow(method), updated_at: new Date().toISOString() })
          .eq("id", pendingSubIdRef.current);
        return pendingSubIdRef.current;
      }
      const { data, error } = await supabaseDb
        .from(subTable())
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

      if (renewSubId) {
        // The server verifies the reference with the payment provider before it
        // moves the dates — a token alone cannot extend a period for free — and
        // the idempotency key makes a retried call return the same outcome
        // instead of buying a second term.
        const idempotencyKey = renewKeyRef.current ?? crypto.randomUUID();
        renewKeyRef.current = idempotencyKey;
        const { error } = await accountApi(renewalEndpoint(plan.service, renewSubId), {
          method: "POST",
          body: JSON.stringify({
            payment_method: o.method,
            payment_reference: o.paymentRef,
            amount_cents: totalCents,
            surcharge_cents: Math.max(0, effectiveTotalCents - totalCents),
            idempotency_key: idempotencyKey,
          }),
        });
        if (error) throw new Error(error.message || "Renewal failed");
        return { id: renewSubId };
      }

      const patch = {
        payment_status: o.status,
        payment_method: o.method,
        payment_reference: o.paymentRef,
        status: o.status === "paid" ? "active" : "pending",
        updated_at: new Date().toISOString(),
      };
      if (pendingSubIdRef.current) {
        const { data, error } = await supabaseDb
          .from(subTable())
          .update(patch).eq("id", pendingSubIdRef.current).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabaseDb
        .from(subTable())
        .insert({ ...buildRow(o.method), ...patch })
        .select().single();
      if (error) throw error;
      pendingSubIdRef.current = data.id;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-universal-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-subscriptions"] });
      // A renewal changes a row the subscriptions page is already showing, and
      // the whole point is that the new end date appears when they land there.
      if (renewSubId) {
        queryClient.invalidateQueries({ queryKey: ["checkout-renewal"] });
        ["my-food-subscriptions", "my-cleaning-subscriptions-all", "my-beach-subs", "my-linked-client-subscriptions"]
          .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      }
      setShowSuccess(true);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      mutationCalledRef.current = false;
    },
  });

  const paymentMeta = () => ({
    service_name: plan?.providerName ?? "Subscription",
    client_name: userData?.name || userData?.display_name || userData?.email || undefined,
    client_email: userData?.email,
    plan_name: plan?.name,
    duration: termLabelFor(plan?.period ?? null, periods),
    booking_id: planId,
    admin_url: `${window.location.origin}/admin/marketplace/plans`,
    selected_date_time: startDate,
  });

  const startPayment = async () => {
    if (!plan) return;
    if (totalCents <= 0) { toast.error("This plan has no price yet."); return; }
    if (!startDate) { toast.error("Choose a start date."); return; }
    if (plan.needsAddress && !address.trim()) {
      toast.error(plan.fulfilment === "deliveries" ? "Where should it be delivered?" : "Where should we come?");
      return;
    }
    if (plan.selection && selections.length < plan.selection.min) {
      toast.error(`Pick at least ${plan.selection.min} — ${plan.selection.label.toLowerCase()}.`);
      return;
    }
    // provider_subscriptions.user_id is a uuid column and the JWT id may be a
    // Google-format string; inserting that raises 22P02 and fails the whole
    // statement. Better to say so than to lose the sale to a Postgres error.
    // A renewal inserts nothing, so it has no such constraint to satisfy.
    if (!renewSubId && !userUuid) { toast.error("We couldn't verify your account. Please sign in again."); return; }
    if (renewSubId && !renewSubject) { toast.error("We couldn't load the subscription you're renewing."); return; }

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
        description: `${plan.providerName ?? "Plan"} - ${plan.name} - ${formatUSD(totalCents)}`,
        context: "provider_subscription",
        externalId: `sub-${plan.universalId}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
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

  if (planLoading || (!!renewSubId && renewLoading)) {
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

  if (renewSubId && !renewSubject) {
    return (
      <UserLayout title="Renew" showBackButton backTo="/my-subscriptions" showBottomNav={false}>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Subscription not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn't find the subscription you're renewing. Open it from your
            subscriptions and try again.
          </p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate("/my-subscriptions")}>
            My subscriptions
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
            eyebrow={
              paymentMethod === "infinita" ? "Payment submitted"
              : renewing ? "Subscription extended"
              : "Subscription confirmed"
            }
            subtitle={
              paymentMethod === "infinita"
                ? `An admin will verify your LIVES transaction and ${renewing ? "extend" : "activate"} your ${plan.name} subscription.`
                : renewing
                ? `Your ${plan.name} now runs through ${format(endDate, "d MMM yyyy")}.`
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

  const orderDescription = `${plan.providerName ?? "Plan"} - ${plan.name} - ${formatUSD(effectiveTotalCents)}`;

  return (
    <UserLayout
      title={renewing ? "Renew" : "Checkout"}
      showBackButton
      backTo={renewing ? "/my-subscriptions" : listingHref}
      showBottomNav={false}
    >
      <div className="mx-auto max-w-xl space-y-4 px-4 py-4 pb-32 md:py-8">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {renewing ? "Renewal" : "Step 2 of 2"}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground md:text-3xl">
            {showPayment ? "Complete payment" : renewing ? "Renew & pay" : "Review & pay"}
          </h1>
          {renewing && (
            <p className="mt-1 text-sm text-muted-foreground">
              Extends the same subscription — nothing new is created, and the new
              period starts when the current one ends.
            </p>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl bg-card">
          <div className="p-5">
            <h2 className="text-xl font-black tracking-tight text-foreground">{plan.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {plan.providerName ? `${plan.providerName} · ` : ""}{termLabel(plan.period)}
            </p>
          </div>

          {!showPayment && (
            <div className="px-5 pb-4">
              {/* A renewal has no start date to pick and no term to change: it
                  continues the period that exists, for the term it was bought
                  for. Offering either control would let the screen promise
                  something the server will not do. */}
              {renewing ? (
                <div className="rounded-2xl bg-inset p-3.5">
                  <p className="text-xs text-muted-foreground">Renewing</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {renewSubject!.currentEnd
                      ? `Current period ends ${format(new Date(`${renewSubject!.currentEnd}T00:00:00`), "d MMM yyyy")}`
                      : "Current period"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    New period {format(new Date(`${effectiveStart}T00:00:00`), "d MMM")} → {format(endDate, "d MMM yyyy")}
                  </p>
                </div>
              ) : (
                <>
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
                </>
              )}

              {/* Only shown when the plan actually offers a choice — a plan
                  sold one period at a time has nothing to step through. */}
              {!renewing && periodsCeiling > periodsMin && (
                <>
                  <Label className="mt-4 block text-xs text-muted-foreground">
                    How long — {termLabelFor(plan.period, periods)}
                  </Label>
                  <Stepper
                    value={periods}
                    min={periodsMin}
                    max={periodsCeiling}
                    onChange={setPeriods}
                    unit={termLabel(plan.period)}
                  />
                </>
              )}

              {perPerson && !renewing && (
                <>
                  <Label className="mt-4 block text-xs text-muted-foreground">People</Label>
                  <Stepper value={people} min={1} max={20} onChange={setPeople} unit="person" />
                </>
              )}

              {/* What the customer picks INSIDE the plan. It changes nothing
                  about the price — that is what makes it a selection and not
                  an axis — so it is stored on the subscription. The options and
                  how many may be picked come from the plan, which is why this
                  screen can serve meals without knowing what a meal is. */}
              {plan.selection && (
                <>
                  <Label className="mt-4 block text-xs text-muted-foreground">
                    {plan.selection.label} — pick {plan.selection.max}
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {plan.selection.options.map((opt) => {
                      const on = selections.includes(opt.key);
                      const full = selections.length >= plan.selection!.max;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setSelections((cur) =>
                            cur.includes(opt.key)
                              ? cur.filter((k) => k !== opt.key)
                              : full ? cur : [...cur, opt.key])}
                          disabled={!on && full}
                          className={`rounded-radius-md px-3.5 py-2 text-[14px] font-semibold transition-colors disabled:opacity-40 ${
                            on ? "bg-primary text-primary-foreground" : "bg-inset text-muted-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {plan.needsArea && (
                <>
                  <Label htmlFor="pc-area" className="mt-4 block text-xs text-muted-foreground">Residence</Label>
                  <Input id="pc-area" className="mt-1.5 h-12 rounded-2xl" value={area}
                    placeholder="Duna Residences" onChange={(e) => setArea(e.target.value)} />
                </>
              )}

              {plan.needsAddress && (
                <>
                  <Label htmlFor="pc-address" className="mt-4 block text-xs text-muted-foreground">
                    {plan.fulfilment === "deliveries" ? "Delivery address" : "Where the visit happens"}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input id="pc-address" className="mt-1.5 h-12 rounded-2xl" value={address}
                    placeholder="Building, unit, anything the driver needs"
                    onChange={(e) => setAddress(e.target.value)} />
                </>
              )}

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
            {includedLabel(plan.unitQuantity, plan.unitLabel, plan.period) && (
              <SummaryRow label="Included" value={includedLabel(plan.unitQuantity, plan.unitLabel, plan.period)!} />
            )}
            <SummaryRow label="Term" value={termLabelFor(plan.period, periods)} />
            {perPerson && <SummaryRow label="People" value={String(Math.max(1, people))} />}
            {(periods > 1 || perPerson) && (
              <SummaryRow
                label="Price"
                value={`${formatUSD(unitCents)} × ${periods}${perPerson ? ` × ${Math.max(1, people)}` : ""}`}
              />
            )}
            <SummaryRow
              label={renewing ? "Renews from" : "Start date"}
              value={format(new Date(`${effectiveStart}T00:00:00`), "d MMM yyyy")}
            />
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
              onInvoiceReady={(paymentId: string) => attachPaymentReference(supabaseDb, subTable(), pendingSubIdRef.current, paymentId, "crypto")}
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
          {/* A renewal is not a basket item — it extends one specific row and
              only the server can do it. */}
          {!renewing && (
          <AddToCartButton
            className="mb-2 w-full"
            line={{
              service: "plan",
              providerId: plan.providerUniversalId,
              providerName: plan.providerName ?? "Provider",
              planId: plan.universalId,
              planName: plan.name,
              unitPriceCents: totalCents,
              periods: 1,
            }}
          />
          )}
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

/**
 * Plus and minus, because a number a customer has to type is a number they can
 * get wrong — and the bounds come from the plan, so the control cannot offer
 * a quantity the provider does not sell.
 */
function Stepper({ value, min, max, unit, onChange }: {
  value: number; min: number; max: number; unit: string; onChange: (n: number) => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-3">
      <button type="button" aria-label="Fewer"
        className="flex h-11 w-11 items-center justify-center rounded-radius-md bg-inset text-lg font-semibold text-foreground disabled:opacity-40"
        disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="min-w-[6ch] text-center text-[16px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <button type="button" aria-label="More"
        className="flex h-11 w-11 items-center justify-center rounded-radius-md bg-inset text-lg font-semibold text-foreground disabled:opacity-40"
        disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      <span className="text-[12px] tracking-[-0.24px] text-muted-foreground">{unit}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default UniversalPlanCheckout;
