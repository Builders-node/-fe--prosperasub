import { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Zap, Loader2, CheckCircle2, Copy, Banknote, Coins, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addWeeks, addDays, format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";

const Checkout = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { userData, isAuthenticated, lightningPubkey } = useAuth();
  
  const [weeks, setWeeks] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<"lightning" | "fiat" | "crypto">("lightning");
  const [showPayment, setShowPayment] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // BTC price for conversion
  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice, cacheAge } = useBtcPrice();

  const { data: plan } = useQuery({
    queryKey: ["plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*, restaurants(name, id)")
        .eq("id", planId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: globalSettings } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("global_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Price in USD cents
  const totalUsdCents = plan ? plan.price_per_week_sats * parseInt(weeks) : 0;
  const totalUsdDollars = centsToDollars(totalUsdCents);
  // Dynamic sats conversion (for display before locking)
  const estimatedSats = convertToSats(totalUsdDollars);
  const startDate = addDays(new Date(), 1);
  const endDate = addWeeks(startDate, parseInt(weeks));

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const createSubscriptionMutation = useMutation({
    mutationFn: async (options: { paymentRef: string; status: "paid" | "pending"; method: "lightning" | "fiat" | "crypto"; satsAmount: number }) => {
      const pubkey = userData?.lightning_pubkey || lightningPubkey || "";
      if (!plan) throw new Error("Missing plan data");

      const { data: subscriptions, error: subError } = await supabase.rpc("create_subscription_by_pubkey", {
        p_pubkey: pubkey,
        p_restaurant_id: plan.restaurant_id,
        p_plan_id: plan.id,
        p_start_date: format(startDate, "yyyy-MM-dd"),
        p_end_date: format(endDate, "yyyy-MM-dd"),
        p_duration_weeks: parseInt(weeks),
        p_total_price_sats: options.satsAmount, // Store the actual sats paid
        p_payment_reference: options.paymentRef,
        p_payment_status: options.status,
      });

      if (subError) throw subError;
      
      const subscription = subscriptions?.[0];
      if (!subscription) throw new Error("Failed to create subscription");

      return subscription;
    },
    onSuccess: (subscription) => {
      if (paymentMethod === "lightning") {
        toast.success("Payment confirmed! Subscription activated.");
      } else {
        toast.success("Subscription created! Awaiting restaurant approval.");
      }
      setTimeout(() => {
        navigate(`/subscription/${subscription.id}`);
      }, 1500);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const generateInvoice = async () => {
    if (!plan || !btcPrice) return;
    
    // Lock the sats amount at invoice generation time
    const satsAmount = convertToSats(totalUsdDollars);
    if (satsAmount <= 0) {
      toast.error("Unable to calculate payment amount. Please try again.");
      return;
    }
    
    setLockedSatsAmount(satsAmount);
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: {
          amount_cents: totalUsdCents,
          amount_sats: satsAmount,
          description: `${plan.name} - ${weeks} week(s) - ${formatUSD(totalUsdCents)}`,
          external_id: `plan-${plan.id}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
        },
      });

      if (error) throw error;
      if (data.error) {
        if (data.fallback) {
          toast.error("Lightning service temporarily unavailable. Please use FIAT or CRYPTO payment instead.");
          setLockedSatsAmount(null);
          setIsGenerating(false);
          return;
        }
        throw new Error(data.error);
      }

      setInvoice(data.payment_request);
      setPaymentHash(data.payment_hash);
      setShowPayment(true);

      startPaymentPolling(data.payment_hash, satsAmount);
    } catch (error: any) {
      console.error("Invoice error:", error);
      toast.error(error.message || "Failed to generate invoice");
      setLockedSatsAmount(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const startPaymentPolling = (hash: string, satsAmount: number) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: { payment_hash: hash },
        });

        if (error) {
          console.error("Polling error:", error);
          return;
        }

        if (data.paid) {
          setIsPaid(true);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }
          createSubscriptionMutation.mutate({
            paymentRef: hash,
            status: "paid",
            method: "lightning",
            satsAmount: satsAmount,
          });
        }
      } catch (err) {
        console.error("Payment check error:", err);
      }
    }, 3000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const handleManualPayment = async () => {
    if (!plan) return;
    
    // For manual payments, use the current estimated sats
    const satsAmount = estimatedSats || 0;
    
    setIsSubmitting(true);
    try {
      await createSubscriptionMutation.mutateAsync({
        paymentRef: `${paymentMethod}_${Date.now()}`,
        status: "pending",
        method: paymentMethod,
        satsAmount: satsAmount,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-space-8 text-center">
          <p className="mb-space-4">Please sign in to checkout</p>
          <Button asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (isPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-space-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-accent mx-auto mb-space-4" />
          <h2 className="mb-space-2 text-section-title">Payment Confirmed!</h2>
          <p className="type-body text-muted-foreground">Activating your subscription...</p>
        </Card>
      </div>
    );
  }

  return (
    <UserLayout 
      title="Checkout" 
      showBackButton 
      backTo={plan ? `/plan/${plan.id}` : "/restaurants"}
    >
      <div className="mx-auto w-full max-w-3xl px-space-5 py-space-8 sm:px-space-8 lg:py-space-12">
        {plan && (
          <>
            <div className="mb-space-8">
              <p className="text-caption uppercase tracking-[0.16em] text-primary">Checkout</p>
              <h1 className="mt-space-2 type-page-title text-foreground">Confirm subscription</h1>
              <p className="mt-space-3 type-body-large text-muted-foreground">
                Choose duration and pay with Lightning or a manual vendor payment.
              </p>
            </div>
            <Card className="mb-space-6">
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <p className="type-body text-muted-foreground">{(plan.restaurants as any)?.name}</p>
              </CardHeader>
              <CardContent className="space-y-space-4">
                <div>
                  <Label>Duration</Label>
                  <Select value={weeks} onValueChange={setWeeks} disabled={showPayment}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: Math.min(plan.max_duration_weeks || 4, globalSettings?.max_subscription_weeks || 4) },
                        (_, i) => i + 1
                      ).map((w) => (
                        <SelectItem key={w} value={w.toString()}>
                          {w} week{w > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t border-[hsl(var(--app-divider))] pt-space-4">
                  <div className="mb-space-1 flex justify-between text-control text-muted-foreground">
                    <span>Start Date</span>
                    <span>{format(startDate, "MMM d, yyyy")}</span>
                  </div>
                  <div className="mb-space-4 flex justify-between text-control text-muted-foreground">
                    <span>End Date</span>
                    <span>{format(endDate, "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex justify-between text-panel-title">
                    <span>Total</span>
                    <div className="text-right">
                      <div>{formatUSD(totalUsdCents)}</div>
                      {paymentMethod === "lightning" && btcPrice && (
                        <div className="type-body font-normal text-muted-foreground">
                          ≈ {(lockedSatsAmount || estimatedSats).toLocaleString()} sats
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method Selection */}
            <Card className="mb-space-6">
              <CardHeader>
                <CardTitle>Choose Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as "lightning" | "fiat" | "crypto")}
                  className="space-y-space-3"
                  disabled={showPayment}
                >
                  <div className="flex items-center space-x-space-3 rounded-radius-lg border border-border p-space-4 transition-colors hover:bg-[hsl(var(--app-control))]">
                    <RadioGroupItem value="lightning" id="lightning" />
                    <Label htmlFor="lightning" className="flex items-center gap-space-2 cursor-pointer flex-1">
                      <Zap className="h-5 w-5 text-bitcoin" />
                      <div>
                        <p className="text-control text-foreground">Lightning</p>
                        <p className="type-body text-muted-foreground">Auto-verified payment</p>
                      </div>
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-space-3 rounded-radius-lg border border-border p-space-4 transition-colors hover:bg-[hsl(var(--app-control))]">
                    <RadioGroupItem value="fiat" id="fiat" />
                    <Label htmlFor="fiat" className="flex items-center gap-space-2 cursor-pointer flex-1">
                      <Banknote className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-control text-foreground">FIAT (I paid to vendor)</p>
                        <p className="type-body text-muted-foreground">Requires restaurant approval</p>
                      </div>
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-space-3 rounded-radius-lg border border-border p-space-4 transition-colors hover:bg-[hsl(var(--app-control))]">
                    <RadioGroupItem value="crypto" id="crypto" />
                    <Label htmlFor="crypto" className="flex items-center gap-space-2 cursor-pointer flex-1">
                      <Coins className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-control text-foreground">Crypto (I paid to vendor)</p>
                        <p className="type-body text-muted-foreground">Requires restaurant approval</p>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Lightning Payment Flow */}
            {paymentMethod === "lightning" && showPayment && invoice ? (
              <Card className="mb-space-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-space-2">
                    <Zap className="h-5 w-5 text-bitcoin" />
                    Pay with Lightning
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-space-4">
                  <div className="flex justify-center rounded-radius-lg bg-white p-space-4">
                    <QRCodeSVG value={invoice} size={200} level="M" />
                  </div>
                  
                  <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4 text-center">
                    <p className="text-label text-muted-foreground">Amount</p>
                    <p className="text-section-title text-primary">{(lockedSatsAmount || 0).toLocaleString()} sats</p>
                    <p className="type-body text-muted-foreground">{formatUSD(totalUsdCents)}</p>
                  </div>
                  
                  <div className="space-y-space-2">
                    <Label className="text-label text-muted-foreground">Lightning Invoice</Label>
                    <div className="flex items-center gap-space-2">
                      <code className="max-h-20 flex-1 overflow-y-auto break-all rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3 text-caption">
                        {invoice}
                      </code>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => copyToClipboard(invoice)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center gap-space-2 rounded-radius-lg bg-primary/10 p-space-4">
                    <Loader2 className="h-5 w-5 animate-spin text-bitcoin" />
                    <span className="text-control">Waiting for payment...</span>
                  </div>
                </CardContent>
              </Card>
            ) : paymentMethod === "lightning" ? (
              <div className="space-y-space-3">
                {btcPrice && (
                  <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3 text-control text-muted-foreground">
                    <span>Current rate: 1 BTC = ${btcPrice.toLocaleString()}</span>
                    <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <Button
                  className="w-full"
                  size="xl"
                  onClick={generateInvoice}
                  loading={isGenerating}
                  disabled={isPriceLoading || !btcPrice}
                >
                  {!isGenerating && <Zap className="h-5 w-5" />}
                  {isGenerating ? "Generating Invoice..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats`}
                </Button>
              </div>
            ) : (
              /* FIAT / Crypto Flow */
              <div className="space-y-space-4">
                <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                  <p className="type-body text-muted-foreground">
                    By clicking confirm, you declare that you have already paid the vendor directly.
                    Your subscription will be activated once the restaurant confirms receipt of payment.
                  </p>
                </div>
                <Button
                  className="w-full"
                  size="xl"
                  onClick={handleManualPayment}
                  loading={isSubmitting}
                >
                  {!isSubmitting && (paymentMethod === "fiat" ? <Banknote className="h-5 w-5" /> : <Coins className="h-5 w-5" />)}
                  {isSubmitting ? "Creating Subscription..." : "Confirm Payment"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </UserLayout>
  );
};

export default Checkout;
