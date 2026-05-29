import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Zap, Loader2, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, format } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { QRCodeSVG } from "qrcode.react";
import { UserLayout } from "@/components/layout/UserLayout";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";

const CLEANING_DURATION_OPTIONS = [1, 2, 3] as const;
type CleaningDurationMonths = (typeof CLEANING_DURATION_OPTIONS)[number];

const CleaningCheckout = () => {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const { userData, lightningPubkey } = useAuth();

  const [paymentMethod] = useState<"lightning">("lightning");
  const [showPayment, setShowPayment] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdSubscriptionId, setCreatedSubscriptionId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const [apartmentNote, setApartmentNote] = useState("");
  const [apartmentNoteError, setApartmentNoteError] = useState("");
  const [billingPeriodMonths, setBillingPeriodMonths] = useState<CleaningDurationMonths>(1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutationCalledRef = useRef(false);

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

  const monthlyPriceCents = pkg ? pkg.price_per_cleaning_cents * pkg.cleanings_per_month : 0;
  const totalCents = monthlyPriceCents * billingPeriodMonths;
  const totalUsdDollars = centsToDollars(totalCents);
  const estimatedSats = convertToSats(totalUsdDollars);
  const startDate = new Date("2026-06-01T00:00:00-06:00");
  const endDate = addMonths(startDate, billingPeriodMonths);
  const cleaningsIncluded = pkg ? pkg.cleanings_per_month * billingPeriodMonths : 0;

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
      const cleanedApartmentNote = apartmentNote.trim();
      if (!cleanedApartmentNote) throw new Error("Apartment number is required.");

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
          payment_status: options.status,
          payment_method: options.method,
          payment_reference: options.paymentRef,
          is_active: false,
          subscription_status: options.status === "paid" ? "pending_schedule" : "pending_payment",
          apartment_note: cleanedApartmentNote,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setCreatedSubscriptionId(data.id);
      setShowSuccess(true);
      if (paymentMethod === "lightning") {
        void sendPaymentConfirmationEmail(data);
      }
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
    if (!pkg || !btcPrice) return;
    if (!validateApartmentNote()) return;
    if (!CLEANING_DURATION_OPTIONS.includes(billingPeriodMonths)) {
      toast.error("Choose a cleaning duration of 1, 2, or 3 months.");
      return;
    }
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
          context: "cleaning_subscription",
          package_id: pkg.id,
          billing_period_months: billingPeriodMonths,
          ...getCleaningPaymentMetadata(),
          description: `Cleaning - ${pkg.name} - ${billingPeriodMonths} month${billingPeriodMonths > 1 ? "s" : ""} - ${formatUSD(totalCents)}`,
          external_id: `cleaning-${pkg.id}-${billingPeriodMonths}m-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
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
    mutationCalledRef.current = false;
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: {
            payment_hash: hash,
            ...getCleaningPaymentMetadata(),
          },
        });
        if (error) return;
        if (data.paid && !mutationCalledRef.current) {
          mutationCalledRef.current = true;
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

  return (
    <UserLayout title="Checkout" showBackButton backTo="/cleaning">
      <Sheet open={showSuccess} onOpenChange={(open) => {
        if (!open && createdSubscriptionId) {
          navigate(`/cleaning/book?subscriptionId=${createdSubscriptionId}`);
        }
      }}>
        <SheetContent side="bottom" className="rounded-t-3xl px-space-6 pb-space-8 pt-space-6">
          <SheetHeader className="items-center">
            <CheckCircle2 className="h-16 w-16 text-accent mb-space-2" />
            <SheetTitle className="text-2xl">Payment Confirmed!</SheetTitle>
            <SheetDescription>
              Next, choose your recurring weekly cleaning schedule.
            </SheetDescription>
          </SheetHeader>
          <Button
            className="mt-space-6 w-full"
            size="xl"
            onClick={() => {
              if (createdSubscriptionId) {
                navigate(`/cleaning/book?subscriptionId=${createdSubscriptionId}`);
              }
            }}
          >
            Choose Schedule
          </Button>
        </SheetContent>
      </Sheet>

      <div className="container mx-auto px-space-4 py-space-8 max-w-lg">
        {pkg && (
          <>
            <Card className="mb-space-6">
              <CardHeader>
                <CardTitle>{pkg.name}</CardTitle>
                <p className="text-muted-foreground">Cleaning Subscription</p>
              </CardHeader>
              <CardContent className="space-y-space-4">
                {!showPayment && (
                  <div className="space-y-space-2">
                    <Label htmlFor="cleaning-duration">Duration</Label>
                    <Select
                      value={String(billingPeriodMonths)}
                      onValueChange={(value) => setBillingPeriodMonths(Number(value) as CleaningDurationMonths)}
                    >
                      <SelectTrigger id="cleaning-duration" aria-label="Cleaning purchase duration">
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
                <div className="pt-space-2 border-t">
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Service period</span>
                    <span>{format(startDate, "MMM d")} — {format(endDate, "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Monthly price</span>
                    <span>{formatUSD(monthlyPriceCents)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Selected duration</span>
                    <span>{billingPeriodMonths} month{billingPeriodMonths > 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Cleanings included</span>
                    <span>{cleaningsIncluded}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-space-1">
                    <span>Frequency</span>
                    <span>1 cleaning per week</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total today</span>
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

            {!showPayment && (
              <Card className="mb-space-6">
                <CardHeader>
                  <CardTitle>Apartment details</CardTitle>
                  <p className="text-muted-foreground">Required so the cleaning team can find your unit.</p>
                </CardHeader>
                <CardContent>
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
                    placeholder="Example: Duna Tower, Apt 1204"
                    helperText="Add tower, apartment number, or access notes."
                    errorText={apartmentNoteError}
                    required
                    maxLength={180}
                    showCount
                  />
                </CardContent>
              </Card>
            )}

            {/* Lightning Payment Flow */}
            {showPayment && invoice ? (
              <Card className="mb-space-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-space-2">
                    <Zap className="h-5 w-5 text-bitcoin" />Pay with Lightning
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-space-4">
                  <a href={`lightning:${invoice}`} className="flex justify-center p-space-4 bg-white rounded-radius-md cursor-pointer">
                    <QRCodeSVG value={invoice} size={200} level="M" />
                  </a>
                  <div className="text-center p-space-3 bg-muted rounded-radius-md">
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="text-2xl font-bold text-bitcoin">{(lockedSatsAmount || 0).toLocaleString()} sats</p>
                    <p className="text-sm text-muted-foreground">
                      {formatUSD(totalCents)} total for {billingPeriodMonths} month{billingPeriodMonths > 1 ? "s" : ""}
                    </p>
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
                    {isPaid ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-accent" />
                        <span className="text-sm font-medium">Payment received! Creating subscription...</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin text-bitcoin" />
                        <span className="text-sm font-medium">Waiting for payment...</span>
                      </>
                    )}
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
