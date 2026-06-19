import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Zap, CheckCircle2, Copy, RefreshCw, Wallet, Bitcoin, Minus, Plus } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { QRCodeSVG } from "qrcode.react";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";

interface BeachPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_per_person_cents: number;
}

const BeachClubCheckout = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userData } = useAuth();

  const [showPayment, setShowPayment] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const [onchainAddress, setOnchainAddress] = useState<string | null>(null);
  const [onchainUri, setOnchainUri] = useState<string | null>(null);
  const [people, setPeople] = useState(1);
  const [startDate, setStartDate] = useState(format(nowHN(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutationCalledRef = useRef(false);
  // Silence unused-var lint while keeping parity with the cleaning flow.
  void paymentHash;

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();
  const { enabled: enabledMethods } = usePaymentMethods();

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
  const totalUsdDollars = centsToDollars(totalCents);
  const estimatedSats = convertToSats(totalUsdDollars);
  const endDate = addMonths(new Date(`${startDate}T00:00:00`), 1);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const createSubscriptionMutation = useMutation({
    mutationFn: async (options: { paymentRef: string; status: "paid" | "pending"; method: string }) => {
      if (!plan) throw new Error("Missing plan data");
      const userId = userData?.id ?? null;
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .insert({
          plan_id: plan.id,
          plan_name: plan.name,
          user_id: userId,
          customer_name: userData?.name || userData?.display_name || null,
          customer_email: userData?.email || null,
          people,
          start_date: startDate,
          end_date: format(endDate, "yyyy-MM-dd"),
          price_per_person_cents: plan.price_per_person_cents,
          total_cents: totalCents,
          payment_status: options.status,
          payment_method: options.method,
          payment_reference: options.paymentRef,
          status: options.status === "paid" ? "active" : "pending",
        })
        .select()
        .single();
      if (error) throw error;
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

    try {
      if (paymentMethod === "infinita" || paymentMethod === "paypal") {
        setShowPayment(true);
        setIsGenerating(false);
        return;
      } else if (paymentMethod === "onchain") {
        if (!btcPrice) { toast.error("BTC price not loaded yet."); setIsGenerating(false); return; }
        const satsAmount = convertToSats(totalUsdDollars);
        if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); setIsGenerating(false); return; }
        setLockedSatsAmount(satsAmount);

        const { data, error } = await supabase.functions.invoke("create-onchain-charge", {
          body: { amount_sats: satsAmount, amount_cents: totalCents, description, ...paymentMeta() },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.address) throw new Error("Could not generate a Bitcoin address.");

        setOnchainAddress(data.address);
        setOnchainUri(`bitcoin:${data.address}?amount=${(satsAmount / 1e8).toFixed(8)}&label=ProsperaSub&message=${encodeURIComponent(description)}`);
        setShowPayment(true);
        startOnchainPolling(data.address, satsAmount);
      } else {
        if (!btcPrice) { toast.error("BTC price not loaded yet."); setIsGenerating(false); return; }
        const satsAmount = convertToSats(totalUsdDollars);
        if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); setIsGenerating(false); return; }
        setLockedSatsAmount(satsAmount);

        const { data, error } = await supabase.functions.invoke("create-invoice", {
          body: {
            amount_cents: totalCents,
            amount_sats: satsAmount,
            context: "beach_club_subscription",
            ...paymentMeta(),
            description,
            external_id: `beach-${plan.id}-${people}p-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
          },
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);

        setInvoice(data.payment_request);
        setPaymentHash(data.payment_hash);
        setShowPayment(true);
        startLightningPolling(data.payment_hash, satsAmount);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate invoice");
      setLockedSatsAmount(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const startLightningPolling = (hash: string, _satsAmount: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    mutationCalledRef.current = false;
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: { payment_hash: hash, ...paymentMeta() },
        });
        if (error) return;
        if (data.paid && !mutationCalledRef.current) {
          mutationCalledRef.current = true;
          setIsPaid(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          createSubscriptionMutation.mutate({ paymentRef: hash, status: "paid", method: "lightning" });
        }
      } catch (err) {
        console.error("Payment check error:", err);
      }
    }, 3000);
  };

  const startOnchainPolling = (address: string, satsAmount: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    mutationCalledRef.current = false;
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-onchain-payment", {
          body: { address, amount_sats: satsAmount },
        });
        if (error) return;
        if (data?.paid && !mutationCalledRef.current) {
          mutationCalledRef.current = true;
          setIsPaid(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          createSubscriptionMutation.mutate({ paymentRef: address, status: "paid", method: "onchain" });
        }
      } catch (err) {
        console.error("On-chain payment check error:", err);
      }
    }, 5000);
  };

  const handleInfinitaPaid = (txHash: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createSubscriptionMutation.mutate({ paymentRef: txHash, status: "pending", method: "crypto" });
    }
  };

  const handlePaypalPaid = (captureId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createSubscriptionMutation.mutate({ paymentRef: captureId, status: "paid", method: "paypal" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <UserLayout title="Checkout" showBackButton backTo="/beach-club" showBottomNav={false}>
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
          <Button variant="ghost" className="mt-space-2 w-full" onClick={() => navigate("/beach-club")}>
            Back to Beach Club
          </Button>
        </SheetContent>
      </Sheet>

      <div className="mx-auto max-w-xl px-4 py-4 md:py-8 space-y-4 pb-32">
        {plan && (
          <>
            <section>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-400">Step 2 of 2</p>
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
                    <Input id="bc-start" type="date" className="mt-1.5 h-12 rounded-2xl"
                      value={startDate} min={format(nowHN(), "yyyy-MM-dd")}
                      onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/60 border-t border-border/60">
                <SummaryRow label="Price / person" value={`${formatUSD(plan.price_per_person_cents)} / mo`} />
                <SummaryRow label="People" value={String(people)} />
                <SummaryRow label="Duration" value="1 month" />
                <SummaryRow label="Start date" value={startDate} />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border/60 p-5">
                <span className="text-lg font-black text-foreground">Total today</span>
                <div className="text-right">
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none">{formatUSD(totalCents)}</p>
                  {btcPrice && (
                    <p className="mt-1 text-sm text-muted-foreground">≈ {(lockedSatsAmount || estimatedSats).toLocaleString()} sats</p>
                  )}
                </div>
              </div>
            </section>

            {/* Payment flow */}
            {showPayment && paymentMethod === "infinita" ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5">
                <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Pay with Infinita</h2>
                <InfinitaPaymentPanel totalCents={totalCents} onPaid={handleInfinitaPaid}
                  orderMeta={{ description: `Beach Club - ${plan.name} - ${people}p - ${formatUSD(totalCents)}`, ...paymentMeta() }} />
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
                  <PayPalPanel totalCents={totalCents} onPaid={handlePaypalPaid}
                    orderMeta={{ description: `Beach Club - ${plan.name} - ${people}p - ${formatUSD(totalCents)}`, ...paymentMeta() }} />
                )}
              </section>
            ) : showPayment && invoice ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground">
                  <Zap className="h-5 w-5 text-bitcoin" />Pay with Lightning
                </h2>
                <a href={`lightning:${invoice}`} className="flex justify-center rounded-2xl bg-white p-4 cursor-pointer">
                  <QRCodeSVG value={invoice} size={200} level="M" />
                </a>
                <div className="rounded-2xl bg-muted/40 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="text-2xl font-black text-bitcoin">{(lockedSatsAmount || 0).toLocaleString()} sats</p>
                  <p className="text-sm text-muted-foreground">{formatUSD(totalCents)} total</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Lightning Invoice</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-xl bg-muted/40 p-3 text-xs break-all max-h-20 overflow-y-auto">{invoice}</code>
                    <Button variant="secondary" size="icon" onClick={() => copyToClipboard(invoice)} aria-label="Copy invoice">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className={`flex items-center justify-center gap-2 rounded-2xl p-4 ${isPaid ? "bg-green-500/10" : "bg-bitcoin/10"}`}>
                  {isPaid ? (
                    <><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-sm font-medium text-green-500">Payment confirmed! Activating membership…</span></>
                  ) : (
                    <><Spinner size="md" className="text-bitcoin" /><span className="text-sm font-medium">Waiting for payment...</span></>
                  )}
                </div>
              </section>
            ) : showPayment && onchainAddress ? (
              <section className="overflow-hidden rounded-3xl bg-card p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground">
                  <Bitcoin className="h-5 w-5 text-bitcoin" />Pay on-chain (Bitcoin)
                </h2>
                <a href={onchainUri ?? `bitcoin:${onchainAddress}`} className="flex justify-center rounded-2xl bg-white p-4 cursor-pointer">
                  <QRCodeSVG value={onchainUri ?? `bitcoin:${onchainAddress}`} size={200} level="M" />
                </a>
                <div className="rounded-2xl bg-muted/40 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="text-2xl font-black text-bitcoin">{(lockedSatsAmount || 0).toLocaleString()} sats</p>
                  <p className="text-sm text-muted-foreground">{formatUSD(totalCents)} total · send exactly this amount</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Bitcoin Address</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-xl bg-muted/40 p-3 text-xs break-all">{onchainAddress}</code>
                    <Button variant="secondary" size="icon" onClick={() => copyToClipboard(onchainAddress)} aria-label="Copy address">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className={`flex items-center justify-center gap-2 rounded-2xl p-4 ${isPaid ? "bg-green-500/10" : "bg-bitcoin/10"}`}>
                  {isPaid ? (
                    <><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-sm font-medium text-green-500">Payment detected! Activating membership…</span></>
                  ) : (
                    <><Spinner size="md" className="text-bitcoin" /><span className="text-sm font-medium">Waiting for payment… on-chain can take a few minutes.</span></>
                  )}
                </div>
              </section>
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
                    <span className="text-muted-foreground">Pay with <span className="font-medium text-foreground">LIVES</span> via Infinita Wallet checkout.</span>
                  </div>
                )}
                {paymentMethod === "paypal" && (
                  <div className="flex items-center gap-2 rounded-2xl bg-[#0070ba]/10 p-3 text-sm">
                    <span className="text-muted-foreground">Pay <span className="font-medium text-foreground">{formatUSD(totalCents)}</span> securely with PayPal or card.</span>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Sticky Pay button */}
      {plan && !showPayment && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-background/95 backdrop-blur md:left-[var(--sidebar-width,0px)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="market-content px-4 py-3">
            <Button size="lg" className="h-14 w-full rounded-2xl bg-sky-500 text-white hover:bg-sky-600 text-base font-bold"
              onClick={generateInvoice}
              loading={isGenerating}
              disabled={isGenerating || ((paymentMethod === "lightning" || paymentMethod === "onchain") && (isPriceLoading || !btcPrice))}>
              {paymentMethod === "lightning" ? (
                <>{!isGenerating && <Zap className="h-5 w-5" />}{isGenerating ? "Generating Invoice..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats`}</>
              ) : paymentMethod === "onchain" ? (
                <>{!isGenerating && <Bitcoin className="h-5 w-5" />}{isGenerating ? "Generating address..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats on-chain`}</>
              ) : paymentMethod === "paypal" ? (
                "Continue with PayPal"
              ) : (
                isGenerating ? "Creating Payment..." : `Pay ${formatUSD(totalCents)} with Infinita`
              )}
            </Button>
          </div>
        </div>
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
