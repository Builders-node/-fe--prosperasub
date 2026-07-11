import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckoutStickyFooter } from "@/components/patterns/CheckoutStickyFooter";
import { Textarea } from "@/components/ui/textarea";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Zap, CheckCircle2, RefreshCw, Wallet, Bitcoin, Sparkles } from "lucide-react";
import { CheckoutSuccessPanel } from "@/components/patterns/CheckoutSuccessPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountApi, supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LocationPicker } from "@/components/account/SavedLocations";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { formatFrequencyLabel, monthlyCleaningEstimate, resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
const CLEANING_DURATION_OPTIONS = [1, 2, 3] as const;
type CleaningDurationMonths = (typeof CLEANING_DURATION_OPTIONS)[number];

const CleaningCheckout = () => {
  const { packageId } = useParams();
  const [searchParams] = useSearchParams();
  const renewFromSubId = searchParams.get("renew");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userData, lightningPubkey } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdSubscriptionId, setCreatedSubscriptionId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apartmentNote, setApartmentNote] = useState("");
  const [apartmentNoteError, setApartmentNoteError] = useState("");
  const [cleanerHint, setCleanerHint] = useState("");
  const [billingPeriodMonths, setBillingPeriodMonths] = useState<CleaningDurationMonths>(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const mutationCalledRef = useRef(false);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();

  // Keep the selected method valid as toggles load.
  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

  const { data: pkg } = useQuery({
    queryKey: ["cleaning-package", packageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_packages")
        .select("*")
        .eq("id", packageId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Renewal: load the previous subscription so we can prefill apartment/notes
  // and re-apply the same weekly schedule (day + time) on the new one.
  const { data: prevSub } = useQuery({
    queryKey: ["cleaning-sub-renew", renewFromSubId],
    enabled: !!renewFromSubId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id, package_id, billing_period_months, apartment_note, cleaner_hint, recurring_day_of_week, recurring_time")
        .eq("id", renewFromSubId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Prefill from the previous subscription once on load.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!prevSub || prefilledRef.current) return;
    prefilledRef.current = true;
    if (prevSub.apartment_note) setApartmentNote(prevSub.apartment_note);
    if (prevSub.cleaner_hint) setCleanerHint(prevSub.cleaner_hint);
    const months = Number(prevSub.billing_period_months);
    if (months === 1 || months === 2 || months === 3) {
      setBillingPeriodMonths(months as CleaningDurationMonths);
    }
  }, [prevSub]);

  const monthlyPriceCents = pkg ? resolveMonthlyPriceCents(pkg) : 0;
  const totalCents = monthlyPriceCents * billingPeriodMonths;
  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const totalUsdDollars = centsToDollars(effectiveTotalCents);
  const estimatedSats = convertToSats(totalUsdDollars);
  const startDate = nowHN();
  const endDate = addMonths(startDate, billingPeriodMonths);
  const cleaningsIncluded = pkg ? monthlyCleaningEstimate(pkg) * billingPeriodMonths : 0;

  // Unified Lightning + on-chain invoice generation + polling.
  const inv = useInvoicePayment({
    onPaid: (paymentRef, method) => {
      setIsPaid(true);
      if (!mutationCalledRef.current) {
        mutationCalledRef.current = true;
        createSubscriptionMutation.mutate({
          paymentRef,
          status: "paid",
          method,
          satsAmount: inv.state.sats ?? 0,
        });
      }
    },
  });

  // ── Payment-durable subscription persistence ──────────────────────────────
  // Insert a "pending" row BEFORE payment so it survives tab-closure. The
  // payment success handler upgrades the same row instead of inserting again.
  const pendingSubIdRef = useRef<string | null>(null);

  const reservePendingSubscription = async (method: string): Promise<string | null> => {
    if (!pkg) return null;
    if (!userData?.email) return null;
    const cleanedApartmentNote = apartmentNote.trim();
    if (!cleanedApartmentNote) return null;
    try {
      const { data: userRow } = await supabaseDb
        .from("users").select("id").eq("email", userData.email).maybeSingle();
      const userId = userRow?.id ?? userData.id;
      if (!userId) return null;

      const common = {
        user_id: userId,
        package_id: pkg.id,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
        service_start_date: format(startDate, "yyyy-MM-dd"),
        service_end_date: format(endDate, "yyyy-MM-dd"),
        paid_until: format(endDate, "yyyy-MM-dd"),
        billing_period_months: billingPeriodMonths,
        monthly_price_cents: monthlyPriceCents,
        total_price_cents: totalCents,
        cleanings_remaining: cleaningsIncluded,
        payment_status: "pending",
        payment_method: method,
        is_active: false,
        subscription_status: "pending_payment",
        apartment_note: cleanedApartmentNote,
        cleaner_hint: cleanerHint.trim() || null,
      };

      if (pendingSubIdRef.current) {
        await supabase.from("cleaning_subscriptions")
          .update(common)
          .eq("id", pendingSubIdRef.current);
        return pendingSubIdRef.current;
      }
      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .insert(common)
        .select("id")
        .single();
      if (error) throw error;
      pendingSubIdRef.current = data.id;
      return data.id;
    } catch (e: any) {
      toast.error(e?.message || "Could not reserve subscription");
      return null;
    }
  };

  // Stable idempotency key per checkout attempt — reused across polling retries
  // so a duplicate /renew call returns the same outcome (no double-extension).
  const renewIdempotencyKeyRef = useRef<string | null>(null);

  const createSubscriptionMutation = useMutation({
    mutationFn: async (options: { paymentRef: string; status: "paid" | "pending"; method: "lightning" | "fiat" | "crypto" | "onchain" | "paypal"; satsAmount: number }) => {
      if (!pkg) throw new Error("Missing package data");
      if (!userData?.email) throw new Error("Not authenticated");
      const cleanedApartmentNote = apartmentNote.trim();
      if (!cleanedApartmentNote) throw new Error("Apartment number is required.");

      // Renewal path: extend the existing sub via the backend renewal endpoint
      // instead of inserting a duplicate row. Server verifies the payment with
      // the actual provider (Blink / SimpleFi / PayPal) so a stolen JWT can't
      // renew for free, and the idempotency key makes retries safe.
      if (renewFromSubId && options.status === "paid") {
        const idempotencyKey = renewIdempotencyKeyRef.current || crypto.randomUUID();
        renewIdempotencyKeyRef.current = idempotencyKey;
        const { error } = await accountApi(`/account/cleaning/subscriptions/${renewFromSubId}/renew`, {
          method: "POST",
          body: JSON.stringify({
            payment_method: options.method === "fiat" ? "paypal" : options.method,
            payment_reference: options.paymentRef,
            amount_cents: totalCents,
            idempotency_key: idempotencyKey,
          }),
        });
        if (error) throw error;
        return { id: renewFromSubId, service_start_date: null, service_end_date: null, paid_until: null, payment_reference: options.paymentRef };
      }

      const patch = {
        payment_status: options.status,
        payment_method: options.method,
        payment_reference: options.paymentRef,
        subscription_status: options.status === "paid" ? "pending_schedule" : "pending_payment",
      };

      // Fast path: we already reserved a pending row before payment → UPDATE it.
      if (pendingSubIdRef.current) {
        const { data, error } = await supabase
          .from("cleaning_subscriptions")
          .update(patch)
          .eq("id", pendingSubIdRef.current)
          .select("id, service_start_date, service_end_date, paid_until, payment_reference")
          .single();
        if (error) throw error;
        return data;
      }

      // Fallback: no reservation (race, old tab) — insert a fresh row.
      const { data: userRow } = await supabaseDb
        .from("users").select("id").eq("email", userData.email).maybeSingle();
      const userId = userRow?.id ?? userData.id;
      if (!userId) throw new Error("User not found");

      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .insert({
          user_id: userId,
          package_id: pkg.id,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          service_start_date: format(startDate, "yyyy-MM-dd"),
          service_end_date: format(endDate, "yyyy-MM-dd"),
          paid_until: format(endDate, "yyyy-MM-dd"),
          billing_period_months: billingPeriodMonths,
          monthly_price_cents: monthlyPriceCents,
          total_price_cents: totalCents,
          cleanings_remaining: cleaningsIncluded,
          is_active: false,
          apartment_note: cleanedApartmentNote,
          cleaner_hint: cleanerHint.trim() || null,
          ...patch,
        })
        .select("id, service_start_date, service_end_date, paid_until, payment_reference")
        .single();
      if (error) throw error;
      pendingSubIdRef.current = data.id;
      return data;
    },
    onSuccess: async (data) => {
      // Refresh My Bookings data so the new subscription appears without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-all"] });
      queryClient.invalidateQueries({ queryKey: ["my-linked-client-subscriptions"] });

      // Renewal: if the previous subscription had a weekly schedule (day + time),
      // apply it automatically to the new one so the user doesn't have to redo it.
      if (
        prevSub &&
        data?.id &&
        typeof prevSub.recurring_day_of_week === "number" &&
        prevSub.recurring_time
      ) {
        try {
          await supabase.rpc("schedule_cleaning_subscription", {
            p_subscription_id: data.id,
            p_day_of_week: prevSub.recurring_day_of_week,
            p_start_time: prevSub.recurring_time,
            p_notes: apartmentNote.trim() || prevSub.apartment_note || "",
          });
          queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-all"] });
          queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings"] });
          toast.success("Renewed — schedule restored from your previous plan.");
        } catch (err: any) {
          // Non-fatal: fall through to the normal success screen.
          toast.error(err?.message || "Renewed, but couldn't restore the old schedule automatically.");
        }
      }

      setCreatedSubscriptionId(data.id);
      setShowSuccess(true);
      void sendPaymentConfirmationEmail(data);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      mutationCalledRef.current = false;
    },
  });

  const sendPaymentConfirmationEmail = async (subscription: any) => {
    if (!pkg || !userData?.email) return;

    const { error } = await supabase.functions.invoke("send-payment-confirmation-email", {
      body: {
        email: userData.email,
        customerName: userData.name || userData.display_name,
        planName: pkg.name,
        monthlyPriceCents,
        totalCents,
        billingPeriodMonths,
        serviceStartDate: subscription.service_start_date || format(startDate, "yyyy-MM-dd"),
        serviceEndDate: subscription.service_end_date || format(endDate, "yyyy-MM-dd"),
        paidUntil: subscription.paid_until || format(endDate, "yyyy-MM-dd"),
        paymentReference: subscription.payment_reference,
        apartmentNote: apartmentNote.trim(),
      },
    });

    if (error) {
      console.warn("Payment confirmation email was not sent", error);
    }
  };

  const validateApartmentNote = () => {
    if (!apartmentNote.trim()) {
      setApartmentNoteError("Apartment number is required.");
      toast.error("Add your apartment number before payment.");
      return false;
    }
    setApartmentNoteError("");
    return true;
  };

  const getClientName = () => userData?.name || userData?.display_name || userData?.email || undefined;

  const getCleaningPaymentMetadata = () => ({
    service_name: "Cleaning subscription",
    client_name: getClientName(),
    client_email: userData?.email,
    client_phone: (userData as any)?.phone || (userData as any)?.phone_number || undefined,
    plan_name: pkg?.name,
    duration: `${billingPeriodMonths} month${billingPeriodMonths === 1 ? "" : "s"}`,
    booking_id: packageId,
    admin_url: `${window.location.origin}/admin/cleaning`,
    selected_date_time: "Pending schedule",
  });

  const generateInvoice = async () => {
    if (!pkg) return;
    if (!validateApartmentNote()) return;
    if (!CLEANING_DURATION_OPTIONS.includes(billingPeriodMonths)) {
      toast.error("Choose a cleaning duration of 1, 2, or 3 months.");
      return;
    }

    setIsGenerating(true);
    const description = `Cleaning - ${pkg.name} - ${billingPeriodMonths} month${billingPeriodMonths > 1 ? "s" : ""} - ${formatUSD(totalCents)}`;

    // Reserve a pending subscription BEFORE payment. Survives tab-close.
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
        context: "cleaning_subscription",
        externalId: `cleaning-${pkg.id}-${billingPeriodMonths}m-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
        meta: {
          package_id: pkg.id,
          billing_period_months: billingPeriodMonths,
          ...getCleaningPaymentMetadata(),
        },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInfinitaPaid = (paymentId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      // SimpleFi confirms the payment via status check → subscription is created as paid.
      createSubscriptionMutation.mutate({
        paymentRef: paymentId,
        status: "paid",
        method: "crypto",
        satsAmount: 0,
      });
    }
  };

  const handlePaypalPaid = (captureId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createSubscriptionMutation.mutate({
        paymentRef: captureId,
        status: "paid",
        method: "paypal",
        satsAmount: 0,
      });
    }
  };

  const handleManualPayment = async () => {
    if (!pkg) return;
    setIsSubmitting(true);
    try {
      await createSubscriptionMutation.mutateAsync({
        paymentRef: `lightning_${Date.now()}`,
        status: "pending",
        method: "lightning",
        satsAmount: estimatedSats || 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success — unified with Food + Cart via CheckoutSuccessPanel. Replaces the
  // old bottom-sheet layout so every service ends checkout on the same big
  // amount + green check screen instead of a bespoke modal per service.
  if (showSuccess) {
    return (
      <UserLayout title="Checkout" showBackButton={false} showBottomNav={false}>
        <div className="mx-auto max-w-xl px-4 py-6">
          <CheckoutSuccessPanel
            icon={Sparkles}
            amount={formatUSD(effectiveTotalCents)}
            eyebrow={paymentMethod === "infinita" ? "Payment submitted" : "Payment received"}
            subtitle={
              paymentMethod === "infinita"
                ? "An admin will verify your LIVES transaction. Next: pick your weekly cleaning schedule."
                : "Next: pick your weekly cleaning schedule."
            }
            ctaLabel="Choose schedule"
            onCta={() => {
              if (createdSubscriptionId) {
                navigate(`/services/cleaning/book?subscriptionId=${createdSubscriptionId}`);
              }
            }}
            secondary={{
              label: "View my subscriptions",
              onClick: () => navigate("/my-subscriptions"),
            }}
          />
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="Checkout" showBackButton backTo="/services/cleaning" showBottomNav={false}>
      <div className="mx-auto max-w-xl px-4 py-4 md:py-8 space-y-4 pb-32">
        {pkg && (
          <>
            {/* ─── Step indicator ─── */}
            <section>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Step 2 of 2
              </p>
              <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-foreground">
                {showPayment ? "Complete payment" : renewFromSubId ? "Renew your plan" : "Review & pay"}
              </h1>
              {renewFromSubId && !showPayment && (
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll keep your previous weekly schedule (day &amp; time) — just confirm payment.
                </p>
              )}
            </section>

            {/* ─── Plan + price summary ─── */}
            <section className="overflow-hidden rounded-3xl bg-card">
              <div className="p-5">
                <h2 className="text-xl font-black tracking-tight text-foreground">{pkg.name}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Cleaning subscription</p>
              </div>

              {!showPayment && (
                <div className="px-5 pb-4">
                  <Label htmlFor="cleaning-duration" className="text-xs text-muted-foreground">Duration</Label>
                  <Select
                    value={String(billingPeriodMonths)}
                    onValueChange={(value) => setBillingPeriodMonths(Number(value) as CleaningDurationMonths)}
                  >
                    <SelectTrigger id="cleaning-duration" aria-label="Cleaning purchase duration" className="mt-1.5 h-12 rounded-2xl">
                      <SelectValue placeholder="Choose duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLEANING_DURATION_OPTIONS.map((months) => (
                        <SelectItem key={months} value={String(months)}>
                          {months} month{months > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="divide-y divide-border/60 border-t border-border/60">
                <div className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Service period</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      Starts on your first cleaning and runs the full period.
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-muted-foreground text-right">
                    {billingPeriodMonths} month{billingPeriodMonths > 1 ? "s" : ""} from 1st cleaning
                  </span>
                </div>
                <SummaryRow label="Monthly price" value={formatUSD(monthlyPriceCents)} />
                <SummaryRow label="Selected duration" value={`${billingPeriodMonths} month${billingPeriodMonths > 1 ? "s" : ""}`} />
                <SummaryRow label="Cleanings included" value={String(cleaningsIncluded)} />
                <SummaryRow label="Frequency" value={formatFrequencyLabel(pkg)} />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border/60 p-5">
                <span className="text-lg font-black text-foreground">Total today</span>
                <div className="text-right">
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none">{formatUSD(effectiveTotalCents)}</p>
                  {feePct > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Base {formatUSD(totalCents)} + {feePct}% processing fee</p>
                  )}
                  {btcPrice && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      ≈ {(inv.state.sats ?? estimatedSats).toLocaleString()} sats
                    </p>
                  )}
                </div>
              </div>
            </section>

            {!showPayment && (
              /* Apartment details — mobile-first: SectionOverline instead of an
                 h2, tighter card padding on phone, textareas rely on the new
                 compact mobile min-height (80px). Saved addresses come first,
                 then the two free-form fields. */
              <section className="space-y-4 rounded-3xl bg-card p-4 sm:p-5">
                <div>
                  <SectionOverline label="Apartment details" />
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    Required so the cleaning team can find your unit.
                  </p>
                </div>
                <LocationPicker
                  userId={userData?.id}
                  value={apartmentNote}
                  onPick={(line) => {
                    setApartmentNote(line);
                    if (apartmentNoteError && line.trim()) setApartmentNoteError("");
                  }}
                />
                <Textarea
                  id="cleaning-apartment-note"
                  label="Apartment / unit number"
                  value={apartmentNote}
                  onChange={(event) => {
                    setApartmentNote(event.target.value);
                    if (apartmentNoteError && event.target.value.trim()) {
                      setApartmentNoteError("");
                    }
                  }}
                  placeholder="Duna Tower, Apt 1204"
                  helperText="Tower, apartment number, or access notes."
                  errorText={apartmentNoteError}
                  required
                  maxLength={180}
                  showCount
                />
                <Textarea
                  id="cleaning-cleaner-hint"
                  label="Hints for cleaners (optional)"
                  value={cleanerHint}
                  onChange={(event) => setCleanerHint(event.target.value)}
                  placeholder="Key under the mat, water the plants…"
                  helperText="Access, pets, fragile items, preferences."
                  maxLength={500}
                  showCount
                />
              </section>
            )}

            {/* Payment Flow */}
            {showPayment && paymentMethod === "infinita" ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5">
                <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with LIVES</h2>
                <InfinitaPaymentPanel
                  totalCents={effectiveTotalCents}
                  onPaid={handleInfinitaPaid}
                  orderMeta={{
                    description: `Cleaning - ${pkg.name} - ${billingPeriodMonths} month${billingPeriodMonths > 1 ? "s" : ""} - ${formatUSD(totalCents)}`,
                    ...getCleaningPaymentMetadata(),
                  }}
                />
              </section>
            ) : showPayment && paymentMethod === "paypal" ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5">
                <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with PayPal</h2>
                {isPaid ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-500/10 p-4">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium text-green-500">Payment received! Creating subscription...</span>
                  </div>
                ) : (
                  <PayPalPanel
                    totalCents={effectiveTotalCents}
                    onPaid={handlePaypalPaid}
                    orderMeta={{
                      description: `Cleaning - ${pkg.name} - ${billingPeriodMonths} month${billingPeriodMonths > 1 ? "s" : ""} - ${formatUSD(totalCents)}`,
                      ...getCleaningPaymentMetadata(),
                    }}
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
                successLabel="Creating subscription…"
              />
            ) : !showPayment ? (
              <div className="space-y-3">
                <h2 className="text-xl font-black tracking-tight text-foreground">Payment method</h2>
                <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />

                {paymentMethod === "lightning" && (
                  <>
                    <div className="flex items-center gap-2 rounded-2xl bg-bitcoin/10 p-3 text-sm">
                      <Zap className="h-4 w-4 text-bitcoin shrink-0" />
                      <span className="text-muted-foreground">
                        Payment is processed via <span className="font-medium text-foreground">Lightning</span> — instant and auto-verified.
                      </span>
                    </div>
                    {btcPrice && (
                      <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
                        <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                        <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price">
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {paymentMethod === "onchain" && (
                  <>
                    <div className="flex items-center gap-2 rounded-2xl bg-bitcoin/10 p-3 text-sm">
                      <Bitcoin className="h-4 w-4 text-bitcoin shrink-0" />
                      <span className="text-muted-foreground">
                        On-chain <span className="font-medium text-foreground">Bitcoin</span> — confirmation can take a few minutes.
                      </span>
                    </div>
                    {btcPrice && (
                      <div className="flex items-center justify-between rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
                        <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                        <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price">
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {paymentMethod === "infinita" && (
                  <div className="flex items-center gap-2 rounded-2xl bg-purple-500/10 p-3 text-sm">
                    <Wallet className="h-4 w-4 text-purple-500 shrink-0" />
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
          </>
        )}
      </div>

      {/* ─── Sticky bottom CTA — unified pattern across all checkouts ─── */}
      {pkg && !showPayment && (
        <CheckoutStickyFooter>
          {enabledMethods.length === 0 && (
            <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400">
              Payments are temporarily unavailable. Try again in a few minutes.
            </p>
          )}
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
            onClick={generateInvoice}
            loading={isGenerating}
            disabled={
              isGenerating ||
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

// ─── SummaryRow (grouped key/value row, matching the plan screen) ────────────
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right tabular-nums">{value}</span>
    </div>
  );
}

export default CleaningCheckout;
