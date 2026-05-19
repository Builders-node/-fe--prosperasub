import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Zap, Loader2, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";

const CleaningCheckout = () => {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const { userData, lightningPubkey } = useAuth();

  const [paymentMethod] = useState<"lightning">("lightning");
  const [showPayment, setShowPayment] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();

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

  const totalCents = pkg ? pkg.price_per_cleaning_cents * pkg.cleanings_per_month : 0;
  const totalUsdDollars = centsToDollars(totalCents);
  const estimatedSats = convertToSats(totalUsdDollars);
  const startDate = new Date();
  const endDate = addMonths(startDate, 1);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const createSubscriptionMutation = useMutation({
    mutationFn: async (options: { paymentRef: string; status: "paid" | "pending"; method: "lightning" | "fiat" | "crypto"; satsAmount: number }) => {
      if (!pkg) throw new Error("Missing package data");

      const userId = userData?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .insert({
          user_id: userId,
          package_id: pkg.id,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          cleanings_remaining: pkg.cleanings_per_month,
          payment_status: options.status,
          payment_method: options.method,
          payment_reference: options.paymentRef,
          is_active: options.status === "paid",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (paymentMethod === "lightning") {
        toast.success("Payment confirmed! Subscription activated.");
      } else {
        toast.success("Subscription created! Awaiting approval.");
      }
      setTimeout(() => navigate("/my-subscriptions?tab=cleaning"), 1500);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const generateInvoice = async () => {
    if (!pkg || !btcPrice) return;
    const satsAmount = convertToSats(totalUsdDollars);
    if (satsAmount <= 0) {
      toast.error("Unable to calculate payment amount.");
      return;
    }
    setLockedSatsAmount(satsAmount);
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: {
          amount_cents: totalCents,
          amount_sats: satsAmount,
          description: `Cleaning - ${pkg.name} - ${formatUSD(totalCents)}`,
          external_id: `cleaning-${pkg.id}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setInvoice(data.payment_request);
      setPaymentHash(data.payment_hash);
      setShowPayment(true);
      startPaymentPolling(data.payment_hash, satsAmount);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate invoice");
      setLockedSatsAmount(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const startPaymentPolling = (hash: string, satsAmount: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: { payment_hash: hash },
        });
        if (error) return;
        if (data.paid) {
          setIsPaid(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          createSubscriptionMutation.mutate({
            paymentRef: hash,
            status: "paid",
            method: "lightning",
            satsAmount,
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
    if (!pkg) return;
    setIsSubmitting(true);
    try {
      await createSubscriptionMutation.mutateAsync({
        paymentRef: `${paymentMethod}_${Date.now()}`,
        status: "pending",
        method: paymentMethod,
        satsAmount: estimatedSats || 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPaid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-space-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-accent mx-auto mb-space-4" />
          <h2 className="font-display text-2xl font-bold mb-space-2">Payment Confirmed!</h2>
          <p className="text-muted-foreground">Activating your cleaning subscription...</p>
        </Card>
      </div>
    );
  }

  return (
    <UserLayout title="Checkout" showBackButton backTo="/cleaning">
      <div className="container mx-auto px-space-4 py-space-8 max-w-lg">
        {pkg && (
          <>
            <Card className="mb-space-6">
              <CardHeader>
                <CardTitle>{pkg.name}</CardTitle>
                <p className="text-muted-foreground">Cleaning Subscription</p>
              </CardHeader>
              <CardContent className="space-y-space-4">
                <div className="pt-space-2 border-t">
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Period</span>
                    <span>{format(startDate, "MMM d")} — {format(endDate, "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Frequency</span>
                    <span>1 cleaning per week</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <div className="text-right">
                      <div>{formatUSD(totalCents)}</div>
                      {paymentMethod === "lightning" && btcPrice && (
                        <div className="text-sm font-normal text-muted-foreground">
                          ≈ {(lockedSatsAmount || estimatedSats).toLocaleString()} sats
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lightning Payment Flow */}
            {showPayment && invoice ? (
              <Card className="mb-space-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-space-2">
                    <Zap className="h-5 w-5 text-bitcoin" />Pay with Lightning
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-space-4">
                  <div className="flex justify-center p-space-4 bg-white rounded-radius-md">
                    <QRCodeSVG value={invoice} size={200} level="M" />
                  </div>
                  <div className="text-center p-space-3 bg-muted rounded-radius-md">
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="text-2xl font-bold text-bitcoin">{(lockedSatsAmount || 0).toLocaleString()} sats</p>
                    <p className="text-sm text-muted-foreground">{formatUSD(totalCents)}</p>
                  </div>
                  <div className="space-y-space-2">
                    <Label className="text-sm text-muted-foreground">Lightning Invoice</Label>
                    <div className="flex items-center gap-space-2">
                      <code className="flex-1 p-space-3 bg-muted rounded-radius-md text-xs break-all max-h-20 overflow-y-auto">{invoice}</code>
                      <Button variant="secondary" size="icon" onClick={() => copyToClipboard(invoice)} aria-label="Copy invoice">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-space-2 p-space-4 bg-bitcoin/10 rounded-radius-md">
                    <Loader2 className="h-5 w-5 animate-spin text-bitcoin" />
                    <span className="text-sm font-medium">Waiting for payment...</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-space-3">
                <div className="flex items-center gap-space-2 p-space-3 bg-bitcoin/10 border border-bitcoin/20 rounded-radius-md text-sm">
                  <Zap className="h-4 w-4 text-bitcoin shrink-0" />
                  <span className="text-muted-foreground">
                    Payment is processed via <span className="font-medium text-foreground">Lightning</span> — instant and auto-verified.
                  </span>
                </div>
                {btcPrice && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground p-space-3 bg-muted/50 rounded-radius-md">
                    <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                    <Button variant="tertiary" size="iconSm" onClick={refreshPrice} aria-label="Refresh Bitcoin price">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <Button className="w-full" size="xl" onClick={generateInvoice} loading={isGenerating} disabled={isPriceLoading || !btcPrice}>
                  {!isGenerating && <Zap className="h-5 w-5" />}
                  {isGenerating ? "Generating Invoice..." : isPriceLoading ? "Loading rate..." : `Pay ${estimatedSats.toLocaleString()} sats`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </UserLayout>
  );
};

export default CleaningCheckout;
