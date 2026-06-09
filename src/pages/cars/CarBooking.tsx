import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { Car, Zap, Loader2, CheckCircle2, Copy, RefreshCw, Clock, AlertCircle } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import type { RentalVehicle, RentalVehicleImage, RentalInsuranceTier, RentalDeliveryZone } from "@/types/carRental";
import { calcRentalPrice } from "@/types/carRental";
import { RentalCalendar } from "@/components/rental/RentalCalendar";
import { cn } from "@/lib/utils";

// Fallback tiers if the DB table is empty / unreachable (mirrors the Atlantis price sheet)
const FALLBACK_INSURANCE_TIERS: RentalInsuranceTier[] = [
  { id: "basic",    name: "Basic",    price_per_day_cents: 0,    items: ["Collision, rollover, self-ignition", "Legal assistance"], sort_order: 1, is_active: true, created_at: "", updated_at: "" },
  { id: "plus",     name: "Plus",     price_per_day_cents: 1000, items: ["All Basic coverage", "Civil liability (property)", "Theft protection", "Force majeure", "Seniors (60-75 yrs)", "Fuel service (deferred)"], sort_order: 2, is_active: true, created_at: "", updated_at: "" },
  { id: "platinum", name: "Platinum", price_per_day_cents: 2000, items: ["All Plus coverage", "Occupant medical", "Glass & tyre protection", "Occupant insurance", "Civil liability (persons)"], sort_order: 3, is_active: true, created_at: "", updated_at: "" },
];

const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const TIME_OPTIONS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

const CarBooking = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, userData } = useAuth();
  const { openAuthModal } = useAuthModal();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:00");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [insuranceId, setInsuranceId] = useState<string | null>(null);
  const [deliveryZoneId, setDeliveryZoneId] = useState<string>("");

  // Payment state
  const [showPayment, setShowPayment] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutationCalledRef = useRef(false);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();

  const { data: vehicle } = useQuery({
    queryKey: ["rental-vehicle-public", id],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .eq("id", id)
        .eq("status", "public")
        .single();
      if (error) throw error;
      const { data: imgs } = await supabaseDb
        .from("rental_vehicle_images")
        .select("*")
        .eq("vehicle_id", id)
        .order("sort_order", { ascending: true });
      return { ...(data as RentalVehicle), images: (imgs ?? []) as RentalVehicleImage[] };
    },
    enabled: !!id,
  });

  // Insurance tiers — DB-driven, managed from the admin panel
  const { data: insuranceTiers = FALLBACK_INSURANCE_TIERS } = useQuery({
    queryKey: ["rental-insurance-tiers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_insurance_tiers")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error || !data || data.length === 0) return FALLBACK_INSURANCE_TIERS;
      return data as RentalInsuranceTier[];
    },
  });

  // Default-select the first (cheapest / lowest sort) tier once loaded
  useEffect(() => {
    if (!insuranceId && insuranceTiers.length > 0) {
      setInsuranceId(insuranceTiers[0].id);
    }
  }, [insuranceTiers, insuranceId]);

  // Delivery zones — DB-driven, managed from the admin panel
  const { data: deliveryZones = [] } = useQuery({
    queryKey: ["rental-delivery-zones"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_delivery_zones")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return data as RentalDeliveryZone[];
    },
  });

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const rentalDays = (startDate && endDate)
    ? Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)))
    : 0;

  const pricing = (vehicle && rentalDays > 0) ? calcRentalPrice(vehicle, rentalDays) : null;
  const insuranceTier = insuranceTiers.find(t => t.id === insuranceId) ?? insuranceTiers[0];
  const insuranceCents = (pricing?.rentalDays ?? 0) * (insuranceTier?.price_per_day_cents ?? 0);
  const deliveryZone = deliveryZones.find(z => z.id === deliveryZoneId) ?? null;
  const deliveryFeeCents = deliveryZone?.fee_cents ?? 0;
  const grandTotalCents = (pricing?.totalCents ?? 0) + insuranceCents + deliveryFeeCents;

  const createBookingMutation = useMutation({
    mutationFn: async (opts: { paymentRef: string; status: "paid" | "pending"; method: string; satsAmount: number }) => {
      if (!vehicle || !pricing) throw new Error("Missing data");
      if (!userData?.email) throw new Error("Not authenticated");

      const { data: userRow } = await supabaseDb
        .from("users")
        .select("id")
        .eq("email", userData.email)
        .maybeSingle();
      const userId = userRow?.id ?? userData.id;
      if (!userId) throw new Error("User not found");

      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .insert({
          user_id: userId,
          vehicle_id: vehicle.id,
          start_date: startDate,
          end_date: endDate,
          start_time: startTime,
          end_time: endTime,
          rental_days: pricing.rentalDays,
          daily_price_cents: pricing.effectiveDailyRate,
          subtotal_cents: pricing.subtotalCents,
          discount_pct: pricing.discountPct,
          discount_cents: pricing.discountCents,
          total_cents: grandTotalCents,
          status: opts.status === "paid" ? "paid" : "pending",
          payment_status: opts.status,
          payment_method: opts.method,
          payment_reference: opts.paymentRef,
          delivery_address: deliveryAddress.trim() || null,
          delivery_notes: deliveryNotes.trim() || null,
          admin_notes: `Insurance: ${insuranceTier?.name ?? "Basic"}${insuranceCents > 0 ? ` (+${formatUSD(insuranceCents)})` : " (included)"} · Delivery: ${deliveryZone?.name ?? "Office pickup"}${deliveryFeeCents > 0 ? ` (+${formatUSD(deliveryFeeCents)})` : " (free)"} · Rate tier: ${pricing.tier}`,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setCreatedBookingId(data.id);
      setShowSuccess(true);
      setShowPayment(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const generateInvoice = async () => {
    if (!vehicle || !pricing || !btcPrice) return;
    setIsGenerating(true);
    try {
      const satsAmount = convertToSats(centsToDollars(grandTotalCents));
      setLockedSatsAmount(satsAmount);
      const description = `Car rental: ${vehicle.name} (${format(parseISO(startDate), "MMM d")}–${format(parseISO(endDate), "MMM d, yyyy")})`;
      const serviceName = "Car Rental";
      const planName = `${vehicle.name} · ${insuranceTier?.name ?? "Basic"} insurance`;
      const clientName = userData?.name ?? userData?.email ?? "";
      const clientEmail = userData?.email ?? "";

      const res = await fetch(`${API_URL}/payments/lightning/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: grandTotalCents,
          amount_sats: satsAmount,
          description,
          service_name: serviceName,
          plan_name: planName,
          client_name: clientName,
          client_email: clientEmail,
          duration: `${pricing.rentalDays} day${pricing.rentalDays !== 1 ? "s" : ""}`,
          selected_date_time: `${format(parseISO(startDate), "MMM d")} ${fmt12(startTime)} → ${format(parseISO(endDate), "MMM d, yyyy")} ${fmt12(endTime)}`,
          context: "car_rental",
          external_id: `car-${vehicle.id}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message || "Failed to create invoice");
      }
      const data = await res.json();
      setInvoice(data.payment_request);
      setPaymentHash(data.payment_hash);

      // Poll for payment via the Blink status endpoint
      pollingRef.current = setInterval(async () => {
        try {
          const vRes = await fetch(`${API_URL}/payments/lightning/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payment_hash: data.payment_hash,
              service_name: serviceName,
              plan_name: planName,
              client_name: clientName,
              client_email: clientEmail,
            }),
          });
          const vData = await vRes.json();
          if (vData.paid && !mutationCalledRef.current) {
            mutationCalledRef.current = true;
            clearInterval(pollingRef.current!);
            setIsPaid(true);
            await createBookingMutation.mutateAsync({
              paymentRef: data.payment_hash,
              status: "paid",
              method: "lightning",
              satsAmount,
            });
          }
        } catch {
          // Ignore polling errors
        }
      }, 3000);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate invoice");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProceed = () => {
    if (!isAuthenticated) {
      openAuthModal("login", `/cars/${id}/book`);
      return;
    }
    setShowPayment(true);
    mutationCalledRef.current = false;
    setInvoice(null);
    setPaymentHash(null);
    setIsPaid(false);
    setLockedSatsAmount(null);
  };

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background">
        <HomeHeader title="Book Vehicle" showBackButton onBack={() => navigate(`/cars/${id ?? ""}`)} />
        <DesktopHeader />
        <main className="market-content py-space-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
        <BottomNav />
      </div>
    );
  }

  const thumb = vehicle.images?.[0]?.url;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title="Book Vehicle" showBackButton onBack={() => navigate(`/cars/${id ?? ""}`)} />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-10">
        <div className="grid gap-space-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left: Booking form */}
          <div className="space-y-space-5">
            {/* Vehicle summary */}
            <div className="flex items-center gap-4 rounded-2xl bg-card p-4">
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
                {thumb ? (
                  <img src={thumb} alt={vehicle.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Car className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {vehicle.brand} {vehicle.model} · {vehicle.year}
                </p>
                <p className="mt-0.5 font-black text-foreground">{vehicle.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatUSD(vehicle.daily_price_cents)} / day
                </p>
              </div>
            </div>

            {/* Calendar date range picker */}
            {id && (
              <RentalCalendar
                vehicleId={id}
                startDate={startDate}
                endDate={endDate}
                onRangeChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                onError={setCalendarError}
                maxDays={30}
              />
            )}

            {/* Overlap error banner */}
            {calendarError && (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm font-medium text-destructive">{calendarError}</p>
              </div>
            )}

            {/* Time pickers — shown once both dates are selected */}
            {startDate && endDate && (
              <div className="rounded-2xl bg-card p-5 space-y-4">
                <h2 className="flex items-center gap-2 font-black text-foreground">
                  <Clock className="h-5 w-5 text-primary" />
                  Pickup & Return Times
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Pickup time
                    </Label>
                    <select
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{fmt12(t)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Return time
                    </Label>
                    <select
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{fmt12(t)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Insurance selector — shown after dates selected */}
            {startDate && endDate && (
              <div className="rounded-2xl bg-card p-5 space-y-4">
                <div>
                  <h2 className="font-black text-foreground">Insurance Coverage</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Select your protection level</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {insuranceTiers.map((tier) => {
                    const selected = insuranceId === tier.id;
                    const items = tier.items ?? [];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setInsuranceId(tier.id)}
                        className={cn(
                          "flex flex-col rounded-2xl border-2 p-4 text-left transition-all",
                          selected ? "border-primary bg-primary/5" : "border-border hover:border-border/80",
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-black text-foreground">{tier.name}</span>
                          {selected && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
                              <CheckCircle2 className="h-3 w-3 text-background" />
                            </span>
                          )}
                        </div>
                        <span className={cn(
                          "mt-0.5 text-xs font-semibold",
                          tier.price_per_day_cents === 0 ? "text-green-400" : "text-primary",
                        )}>
                          {tier.price_per_day_cents === 0 ? "Included" : `+${formatUSD(tier.price_per_day_cents)} / day`}
                        </span>
                        <ul className="mt-3 space-y-1">
                          {items.slice(0, 4).map((item) => (
                            <li key={item} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
                              {item}
                            </li>
                          ))}
                          {items.length > 4 && (
                            <li className="text-[11px] text-muted-foreground/50">+{items.length - 4} more</li>
                          )}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Delivery info */}
            <div className="rounded-2xl bg-card p-5 space-y-4">
              <h2 className="font-black text-foreground">Delivery Information</h2>

              {deliveryZones.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Delivery zone</Label>
                  <select
                    value={deliveryZoneId}
                    onChange={(e) => setDeliveryZoneId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Pick up at office (free)</option>
                    {deliveryZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} — {z.fee_cents === 0 ? "FREE" : formatUSD(z.fee_cents)}
                      </option>
                    ))}
                  </select>
                  {deliveryZone?.areas && (
                    <p className="text-xs text-muted-foreground">Covers: {deliveryZone.areas}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Delivery address (optional)</Label>
                <Input
                  placeholder="Your address or pickup location"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Additional notes (optional)</Label>
                <Textarea
                  placeholder="Any special instructions…"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Right: Price summary */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-black text-foreground">Booking Summary</h2>

              <div className="space-y-2 text-sm">
                <SummaryRow label="Vehicle" value={vehicle.name} />
                {startDate && endDate ? (
                  <>
                    <SummaryRow
                      label="Dates"
                      value={`${format(parseISO(startDate), "MMM d")} – ${format(parseISO(endDate), "MMM d, yyyy")}`}
                    />
                    <SummaryRow label="Times" value={`${fmt12(startTime)} → ${fmt12(endTime)}`} />
                    {pricing && (
                      <>
                        <SummaryRow label="Duration" value={`${pricing.rentalDays} day${pricing.rentalDays !== 1 ? "s" : ""}`} />
                        <SummaryRow
                          label={
                            pricing.tier === "monthly" ? "Monthly rate" :
                            pricing.tier === "extended" ? "Extended rate (8+ days)" :
                            "Daily rate"
                          }
                          value={`${formatUSD(pricing.effectiveDailyRate)} / day`}
                        />
                        {pricing.tier === "monthly" ? (
                          <SummaryRow label="Monthly package" value={formatUSD(pricing.subtotalCents)} />
                        ) : (
                          <SummaryRow label="Rental subtotal" value={formatUSD(pricing.subtotalCents)} />
                        )}
                        {pricing.discountCents > 0 && (
                          <SummaryRow
                            label={`You save (${pricing.discountPct}%)`}
                            value={`−${formatUSD(pricing.discountCents)}`}
                            className="text-green-400"
                          />
                        )}
                        {/* Insurance line */}
                        <SummaryRow
                          label={`Insurance · ${insuranceTier?.name ?? "Basic"}`}
                          value={insuranceCents > 0 ? `+${formatUSD(insuranceCents)}` : "Included"}
                          className={insuranceCents > 0 ? "" : "text-green-400"}
                        />
                        {/* Delivery line */}
                        <SummaryRow
                          label={`Delivery · ${deliveryZone?.name ?? "Office pickup"}`}
                          value={deliveryFeeCents > 0 ? `+${formatUSD(deliveryFeeCents)}` : "Free"}
                          className={deliveryFeeCents > 0 ? "" : "text-green-400"}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <p className="py-3 text-center text-xs text-muted-foreground italic">
                    Select dates in the calendar above
                  </p>
                )}
              </div>

              <div className="border-t border-[hsl(var(--app-divider))] pt-3">
                {pricing ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-bold text-muted-foreground">Total</span>
                      <span className="text-2xl font-black tabular-nums text-foreground">
                        {formatUSD(grandTotalCents)}
                      </span>
                    </div>
                    {btcPrice && (
                      <p className="mt-1 text-right text-xs text-muted-foreground">
                        ≈ {convertToSats(centsToDollars(grandTotalCents)).toLocaleString()} sats
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-muted-foreground">Total</span>
                    <span className="text-lg text-muted-foreground/40">—</span>
                  </div>
                )}
              </div>

              <Button
                size="lg"
                className="w-full rounded-full"
                onClick={handleProceed}
                disabled={!pricing || !startDate || !endDate || !!calendarError}
              >
                <Zap className="mr-2 h-4 w-4" />
                Proceed to Payment
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Paid via Bitcoin Lightning Network
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Payment Sheet */}
      <Sheet open={showPayment} onOpenChange={(open) => {
        if (!open && !isPaid) {
          setShowPayment(false);
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      }}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="mb-6">
            <SheetTitle>Pay with Lightning</SheetTitle>
            <SheetDescription>
              {formatUSD(grandTotalCents)} · {vehicle.name} · {pricing?.rentalDays ?? 0} day{pricing?.rentalDays !== 1 ? "s" : ""}
            </SheetDescription>
          </SheetHeader>

          {!invoice ? (
            <div className="flex flex-col items-center gap-6 py-8">
              {isPriceLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-4xl font-black tabular-nums">{formatUSD(grandTotalCents)}</p>
                    {btcPrice && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        ≈ {convertToSats(centsToDollars(grandTotalCents)).toLocaleString()} sats
                      </p>
                    )}
                  </div>
                  <Button size="lg" className="rounded-full px-10" onClick={generateInvoice} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="mr-2 h-4 w-4" /> Generate Invoice</>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={refreshPrice} className="text-muted-foreground">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh BTC price
                  </Button>
                </>
              )}
            </div>
          ) : isPaid ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-400" />
              <p className="text-xl font-black">Payment received!</p>
              <p className="text-muted-foreground">Your booking is confirmed. We'll be in touch shortly.</p>
              <Button className="mt-4 rounded-full" onClick={() => navigate("/my-subscriptions")}>
                View My Bookings
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <div className="rounded-2xl border-4 border-foreground p-3 bg-white">
                <QRCodeSVG value={invoice} size={220} />
              </div>
              <p className="text-sm text-muted-foreground text-center">Scan with any Lightning wallet</p>
              <div className="w-full max-w-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-hidden text-ellipsis rounded-lg bg-muted px-3 py-2 text-xs">
                    {invoice.slice(0, 40)}…
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(invoice!); toast.success("Copied!"); }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for payment…
              </div>
              {lockedSatsAmount && (
                <p className="text-xs text-muted-foreground">
                  Amount: {lockedSatsAmount.toLocaleString()} sats
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Success overlay */}
      <Sheet open={showSuccess} onOpenChange={() => {}}>
        <SheetContent side="bottom" className="h-[60vh] rounded-t-3xl">
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            <CheckCircle2 className="h-20 w-20 text-green-400" />
            <div>
              <p className="text-2xl font-black">Booking Confirmed!</p>
              <p className="mt-2 text-muted-foreground">
                {vehicle.name}
                {startDate && endDate
                  ? ` · ${format(parseISO(startDate), "MMM d")} – ${format(parseISO(endDate), "MMM d, yyyy")}`
                  : ""}
              </p>
            </div>
            <Button size="lg" className="rounded-full" onClick={() => navigate("/my-subscriptions")}>
              View My Bookings
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
};

function SummaryRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between gap-2 ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

export default CarBooking;
