import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import {
  Car, Zap, CheckCircle2, Copy, RefreshCw, Clock, AlertCircle, Bitcoin,
  CalendarDays, ChevronRight, Wallet, Shield, Plus, Check, Sparkles,
  MapPin, MessageCircle, Truck,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { UserLayout } from "@/components/layout/UserLayout";
import { CheckoutSuccessPanel } from "@/components/patterns/CheckoutSuccessPanel";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { LocationPicker } from "@/components/account/SavedLocations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BottomSheetModal } from "@/components/patterns/BottomSheetModal";
import { NotesField } from "@/components/patterns/NotesField";
import { resolvePlanBookingSettings } from "@/lib/booking/resolvePlanSettings";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import type { RentalVehicle, RentalVehicleImage, RentalInsuranceTier, RentalDeliveryZone, RentalExtra } from "@/types/carRental";
import { calcRentalPrice } from "@/types/carRental";
import { RentalCalendar } from "@/components/rental/RentalCalendar";
import { cn } from "@/lib/utils";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";

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
  const [searchParams] = useSearchParams();
  const { isAuthenticated, userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  // Pre-fill dates/times from CarDetail when arriving via "Continue"
  const [startDate, setStartDate] = useState(() => searchParams.get("start") ?? "");
  const [endDate, setEndDate] = useState(() => searchParams.get("end") ?? "");
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(() => searchParams.get("startTime") ?? "09:00");
  const [endTime, setEndTime] = useState(() => searchParams.get("endTime") ?? "09:00");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [whatsApp, setWhatsApp] = useState("");
  const [insuranceId, setInsuranceId] = useState<string | null>(null);
  const [insuranceSheetOpen, setInsuranceSheetOpen] = useState(false);
  const [extrasSheetOpen, setExtrasSheetOpen] = useState(false);
  const [deliveryZoneId, setDeliveryZoneId] = useState<string>("");
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([]);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const [showPayment, setShowPayment] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const [onchainAddress, setOnchainAddress] = useState<string | null>(null);
  const [onchainUri, setOnchainUri] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutationCalledRef = useRef(false);
  const paymentRef = useRef<HTMLDivElement | null>(null);

  const { btcPrice, isLoading: isPriceLoading, convertToSats, refreshPrice } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

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

  // Default-select the first (Basic / lowest sort) tier. Re-runs if the current
  // selection isn't valid for the loaded tiers (e.g. fallback → real DB ids).
  useEffect(() => {
    if (insuranceTiers.length > 0 && !insuranceTiers.some((t) => t.id === insuranceId)) {
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

  // Extras (add-ons) — DB-driven, managed from the admin panel
  const { data: extras = [] } = useQuery({
    queryKey: ["rental-extras"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_extras")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return data as RentalExtra[];
    },
  });

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Parent rental provider — needed to fall through to provider-level
  // booking_settings when the vehicle carries no override of its own.
  const { data: rentalProvider } = useQuery({
    queryKey: ["rental-provider-booking-settings", (vehicle as any)?.provider_id],
    enabled: !!(vehicle as any)?.provider_id,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("rental_providers")
        .select("booking_settings")
        .eq("id", (vehicle as any).provider_id)
        .maybeSingle();
      return data;
    },
  });

  // Enforce vehicle/provider calendar (weekly hours, min notice, max advance,
  // blocked dates). Runs whenever the picked date/time changes or the vehicle
  // loads. Sets `calendarError` so the existing CTA-disabled + banner-render
  // paths just work — no new UI plumbing needed.
  useEffect(() => {
    if (!vehicle || !startDate) { setCalendarError(null); return; }
    const settings = resolvePlanBookingSettings(vehicle as any, rentalProvider ?? null);

    // Full-day block on start OR end date?
    if (settings.blockedDates.includes(startDate)) {
      setCalendarError("Start date is closed for this vehicle."); return;
    }
    if (endDate && settings.blockedDates.includes(endDate)) {
      setCalendarError("End date is closed for this vehicle."); return;
    }

    // Notice / advance cutoffs based on the pickup datetime.
    const pickupMs = new Date(`${startDate}T${startTime || "09:00"}:00`).getTime();
    if (!Number.isNaN(pickupMs)) {
      const nowMs = Date.now();
      const noticeMs = nowMs + settings.minNoticeHours * 3600_000;
      const advanceMs = nowMs + settings.maxAdvanceDays * 86400_000;
      if (pickupMs < noticeMs) {
        const hrs = settings.minNoticeHours;
        setCalendarError(`Pickup must be at least ${hrs} hour${hrs === 1 ? "" : "s"} from now.`);
        return;
      }
      if (pickupMs > advanceMs) {
        setCalendarError(`Bookings only open up to ${settings.maxAdvanceDays} days in advance.`);
        return;
      }
    }

    setCalendarError(null);
  }, [vehicle, rentalProvider, startDate, endDate, startTime]);

  const rentalDays = (startDate && endDate)
    ? Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)))
    : 0;

  const pricing = (vehicle && rentalDays > 0) ? calcRentalPrice(vehicle, rentalDays) : null;
  const insuranceTier = insuranceTiers.find(t => t.id === insuranceId) ?? insuranceTiers[0];
  const insuranceCents = (pricing?.rentalDays ?? 0) * (insuranceTier?.price_per_day_cents ?? 0);
  const deliveryZone = deliveryZones.find(z => z.id === deliveryZoneId) ?? null;
  const deliveryFeeCents = deliveryZone?.fee_cents ?? 0;
  const selectedExtras = extras.filter(e => selectedExtraIds.includes(e.id));
  const extraCost = (e: RentalExtra) => e.price_type === "per_day" ? e.price_cents * (pricing?.rentalDays ?? 0) : e.price_cents;
  const extrasCents = selectedExtras.reduce((sum, e) => sum + extraCost(e), 0);
  const grandTotalCents = (pricing?.totalCents ?? 0) + insuranceCents + deliveryFeeCents + extrasCents;
  const effectiveGrandTotalCents = addSurchargeCents(grandTotalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  // At least one add-on must be chosen when extras are available
  const extrasRequiredUnmet = extras.length > 0 && selectedExtraIds.length === 0;
  const whatsAppMissing = !whatsApp.trim();
  const bookingReady = !!pricing && !!startDate && !!endDate && !calendarError && !extrasRequiredUnmet && !whatsAppMissing;

  // Reveal the payment method right after the booking summary as soon as the
  // booking is complete — no separate "Proceed to Payment" step.
  useEffect(() => {
    if (bookingReady) setShowPayment(true);
  }, [bookingReady]);

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
          customer_whatsapp: whatsApp.trim() || null,
          admin_notes: `Insurance: ${insuranceTier?.name ?? "Basic"}${insuranceCents > 0 ? ` (+${formatUSD(insuranceCents)})` : " (included)"} · Delivery: ${deliveryZone?.name ?? "Office pickup"}${deliveryFeeCents > 0 ? ` (+${formatUSD(deliveryFeeCents)})` : " (free)"}${selectedExtras.length > 0 ? ` · Extras: ${selectedExtras.map((e) => `${e.name} (${extraCost(e) > 0 ? formatUSD(extraCost(e)) : "free"})`).join(", ")}` : ""} · Rate tier: ${pricing.tier}`,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["my-rental-bookings"] });
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
    if (!vehicle || !pricing) return;
    setIsGenerating(true);
    const description = `Car rental: ${vehicle.name} (${format(parseISO(startDate), "MMM d")}–${format(parseISO(endDate), "MMM d, yyyy")})`;
    const serviceName = "Car Rental";
    const planName = `${vehicle.name} · ${insuranceTier?.name ?? "Basic"} insurance`;
    const clientName = userData?.name ?? userData?.email ?? "";
    const clientEmail = userData?.email ?? "";
    const duration = `${pricing.rentalDays} day${pricing.rentalDays !== 1 ? "s" : ""}`;
    const selectedDateTime = `${format(parseISO(startDate), "MMM d")} ${fmt12(startTime)} → ${format(parseISO(endDate), "MMM d, yyyy")} ${fmt12(endTime)}`;

    try {
      if (paymentMethod === "infinita" || paymentMethod === "paypal") {
        setShowPayment(true);
        setIsGenerating(false);
        return;
      } else if (paymentMethod === "onchain") {
        if (!btcPrice) { toast.error("BTC price not loaded yet."); setIsGenerating(false); return; }
        const satsAmount = convertToSats(centsToDollars(effectiveGrandTotalCents));
        if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); setIsGenerating(false); return; }
        setLockedSatsAmount(satsAmount);

        const res = await fetch(`${API_URL}/payments/onchain/address`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_sats: satsAmount,
            amount_cents: effectiveGrandTotalCents,
            description,
            service_name: serviceName,
            plan_name: planName,
            client_name: clientName,
            client_email: clientEmail,
            duration,
            selected_date_time: selectedDateTime,
            admin_url: `${window.location.origin}/admin/car-rentals/reservations`,
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          throw new Error(e?.message || "Failed to create on-chain address");
        }
        const data = await res.json();
        if (!data.address) throw new Error("Could not generate a Bitcoin address.");

        setOnchainAddress(data.address);
        setOnchainUri(`bitcoin:${data.address}?amount=${(satsAmount / 1e8).toFixed(8)}&label=ProsperaSub&message=${encodeURIComponent(description)}`);
        startOnchainPolling(data.address, satsAmount);
      } else {
        if (!btcPrice) { toast.error("BTC price not loaded yet."); setIsGenerating(false); return; }
        const satsAmount = convertToSats(centsToDollars(effectiveGrandTotalCents));
        setLockedSatsAmount(satsAmount);

        const res = await fetch(`${API_URL}/payments/lightning/invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_cents: effectiveGrandTotalCents,
            amount_sats: satsAmount,
            description,
            service_name: serviceName,
            plan_name: planName,
            client_name: clientName,
            client_email: clientEmail,
            duration,
            selected_date_time: selectedDateTime,
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
        startLightningPolling(data.payment_hash, satsAmount, serviceName, planName, clientName, clientEmail);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate invoice");
      setLockedSatsAmount(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const startLightningPolling = (hash: string, satsAmount: number, serviceName: string, planName: string, clientName: string, clientEmail: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    mutationCalledRef.current = false;
    pollingRef.current = setInterval(async () => {
      try {
        const vRes = await fetch(`${API_URL}/payments/lightning/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_hash: hash,
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
            paymentRef: hash,
            status: "paid",
            method: "lightning",
            satsAmount,
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  };

  const startOnchainPolling = (address: string, satsAmount: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    mutationCalledRef.current = false;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/payments/onchain/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, amount_sats: satsAmount }),
        });
        const data = await res.json();
        if (data.paid && !mutationCalledRef.current) {
          mutationCalledRef.current = true;
          clearInterval(pollingRef.current!);
          setIsPaid(true);
          await createBookingMutation.mutateAsync({
            paymentRef: address,
            status: "paid",
            method: "onchain",
            satsAmount,
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);
  };

  const handleInfinitaPaid = async (paymentId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      // SimpleFi confirms the payment via status check → booking is created as paid.
      await createBookingMutation.mutateAsync({
        paymentRef: paymentId,
        status: "paid",
        method: "infinita",
        satsAmount: 0,
      });
    }
  };

  const handlePaypalPaid = async (captureId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      await createBookingMutation.mutateAsync({
        paymentRef: captureId,
        status: "paid",
        method: "paypal",
        satsAmount: 0,
      });
    }
  };

  const handleProceed = () => {
    if (!isAuthenticated) {
      openAuthModal("login", `/services/rental/${id}/book`);
      return;
    }
    setShowPayment(true);
    mutationCalledRef.current = false;
    setInvoice(null);
    setPaymentHash(null);
    setIsPaid(false);
    setLockedSatsAmount(null);
    // Reveal the payment section inline and scroll to it (same page, not a new one).
    requestAnimationFrame(() => {
      paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (!vehicle) {
    return (
      <UserLayout title="Book vehicle" showBackButton backTo={`/services/rental/${id ?? ""}`} showBottomNav={false}>
        <main className="market-content py-space-10 flex items-center justify-center">
          <Spinner size="lg" className="text-muted-foreground" />
        </main>
      </UserLayout>
    );
  }

  const thumb = vehicle.images?.[0]?.url;

  return (
    <UserLayout title="Book vehicle" showBackButton backTo={`/services/rental/${id ?? ""}`} showBottomNav={false}>
      <div className="pb-36 md:pb-32">
        <main className="market-content py-4 md:py-8">

        {/* ─── Step indicator + title (matches CarDetail Step 1) ────── */}
        <section className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Step 2 of 2
          </p>
          <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Complete your booking
          </h1>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left: Booking form */}
          <div className="space-y-4">
            {/* Vehicle summary (grouped row style like CarDetail) */}
            <section className="overflow-hidden rounded-3xl bg-card">
              <div className="flex items-center gap-3 p-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-muted/40">
                  {thumb ? (
                    <img src={thumb} alt={vehicle.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Car className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {vehicle.brand} {vehicle.model} · {vehicle.year}
                  </p>
                  <p className="font-bold text-foreground leading-tight">{vehicle.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black tabular-nums text-foreground leading-none">
                    {formatUSD(vehicle.daily_price_cents)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">/ day</p>
                </div>
              </div>
            </section>

            {/* Date / Time row — tap to open the picker modal (matches Step 1) */}
            <section className="overflow-hidden rounded-3xl bg-card">
              <button
                type="button"
                onClick={() => setDateSheetOpen(true)}
                className="block w-full text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40">
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    {startDate && endDate ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {fmt12(startTime)} → {fmt12(endTime)}
                        </p>
                        <p className="mt-0.5 font-bold text-foreground leading-tight">
                          {format(parseISO(startDate), "MMM d")} → {format(parseISO(endDate), "MMM d, yyyy")}
                        </p>
                        <p className="mt-1 text-sm text-emerald-600 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {rentalDays} day{rentalDays !== 1 ? "s" : ""} rental
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">Tap to choose</p>
                        <p className="mt-0.5 font-bold text-foreground leading-tight">
                          Select rental dates
                        </p>
                        <p className="mt-1 text-sm text-primary inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Available now
                        </p>
                      </>
                    )}
                  </div>
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            </section>

            {/* Overlap error banner */}
            {calendarError && (
              <div className="flex items-start gap-3 rounded-2xl bg-destructive/10 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm font-medium text-destructive">{calendarError}</p>
              </div>
            )}

            {/* Date picker modal */}
            <BottomSheetModal
              open={dateSheetOpen}
              onOpenChange={setDateSheetOpen}
              title="Select rental dates"
              className="h-[92vh] max-h-[92vh]"
              footer={
                <Button
                  size="lg"
                  className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                  onClick={() => setDateSheetOpen(false)}
                  disabled={!startDate || !endDate || !!calendarError}
                >
                  {startDate && endDate ? "Apply" : "Pick a date range"}
                </Button>
              }
            >
              {id && (
                <RentalCalendar
                  vehicleId={id}
                  startDate={startDate}
                  endDate={endDate}
                  onRangeChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                  onError={setCalendarError}
                  maxDays={30}
                  pickupTime={startTime}
                  dropoffTime={endTime}
                  timeOptions={TIME_OPTIONS}
                  onPickupTimeChange={setStartTime}
                  onDropoffTimeChange={setEndTime}
                />
              )}
            </BottomSheetModal>

            {/* Insurance chooser modal */}
            <BottomSheetModal
              open={insuranceSheetOpen}
              onOpenChange={setInsuranceSheetOpen}
              title="Insurance Coverage"
              subtitle="Select your protection level"
            >
                <div className="grid gap-3">
                  {insuranceTiers.map((tier) => {
                    const selected = insuranceId === tier.id;
                    const items = tier.items ?? [];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => { setInsuranceId(tier.id); setInsuranceSheetOpen(false); }}
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
                          {items.slice(0, 5).map((item) => (
                            <li key={item} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
                              {item}
                            </li>
                          ))}
                          {items.length > 5 && (
                            <li className="text-[11px] text-muted-foreground/50">+{items.length - 5} more</li>
                          )}
                        </ul>
                      </button>
                    );
                  })}
                </div>
            </BottomSheetModal>

            {/* Add-ons chooser modal — reference-styled list with checkboxes */}
            <BottomSheetModal
              open={extrasSheetOpen}
              onOpenChange={setExtrasSheetOpen}
              title="Choose your add-ons"
              subtitle="Select at least one for your trip"
              footer={
                <Button
                  size="lg"
                  className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
                  onClick={() => setExtrasSheetOpen(false)}
                  disabled={selectedExtraIds.length === 0}
                >
                  {selectedExtraIds.length === 0
                    ? "Select at least one"
                    : `Done · ${selectedExtras.length} selected${extrasCents > 0 ? ` · +${formatUSD(extrasCents)}` : ""}`}
                </Button>
              }
            >
                <div className="space-y-2">
                  {extras.map((e) => {
                    const selected = selectedExtraIds.includes(e.id);
                    const cost = extraCost(e);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedExtraIds((ids) => selected ? ids.filter((x) => x !== e.id) : [...ids, e.id])}
                        className="flex w-full items-center gap-3 rounded-2xl bg-muted/40 p-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Plus className="h-5 w-5 text-primary" />
                        </span>
                        <span className={cn(
                          "min-w-0 flex-1 text-sm leading-snug",
                          selected ? "font-bold text-foreground" : "font-semibold text-foreground",
                        )}>
                          {e.name}
                        </span>
                        <span className={cn(
                          "shrink-0 text-sm font-bold",
                          e.price_cents === 0 ? "text-green-500" : "text-primary",
                        )}>
                          {e.price_cents === 0
                            ? "Free"
                            : e.price_type === "per_day"
                            ? `+${formatUSD(e.price_cents)}/day`
                            : `+${formatUSD(e.price_cents)}`}
                          {selected && cost > 0 && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">· {formatUSD(cost)}</span>
                          )}
                        </span>
                        <span className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition",
                          selected ? "bg-primary" : "border-2 border-muted-foreground/30",
                        )}>
                          {selected && <Check className="h-4 w-4 text-black" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
            </BottomSheetModal>

            {/* Insurance — compact row that opens a chooser sheet */}
            {startDate && endDate && insuranceTiers.length > 0 && (
              <button
                type="button"
                onClick={() => setInsuranceSheetOpen(true)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left transition-colors hover:bg-card/70"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-bold text-foreground">Insurance</span>
                      <span className={cn(
                        "text-sm font-semibold",
                        (insuranceTier?.price_per_day_cents ?? 0) === 0 ? "text-green-500" : "text-primary",
                      )}>
                        {(insuranceTier?.price_per_day_cents ?? 0) === 0
                          ? "Included"
                          : `+${formatUSD(insuranceTier?.price_per_day_cents ?? 0)}/day`}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {insuranceTier?.name ?? "Basic"} · Protect your trip
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            )}

            {/* Extras — shown after dates selected */}
            {/* Add-ons — compact row that opens a chooser sheet */}
            {startDate && endDate && extras.length > 0 && (
              <button
                type="button"
                onClick={() => setExtrasSheetOpen(true)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left transition-colors",
                  extrasRequiredUnmet ? "bg-card ring-1 ring-primary/40" : "bg-card hover:bg-card/70",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-bold text-foreground">Add-ons</span>
                      {extrasCents > 0 && (
                        <span className="text-sm font-semibold text-primary">+{formatUSD(extrasCents)}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedExtras.length === 0
                        ? "Select at least one for your trip"
                        : selectedExtras.map((e) => e.name).join(", ")}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            )}

            {/* Delivery info — unified card, iOS Settings / Yandex Lavka pattern */}
            <section className="space-y-2">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                Delivery details
              </p>
              <div className="overflow-hidden rounded-3xl bg-card divide-y divide-border/40">
                {deliveryZones.length > 0 && (
                  <div className="flex items-center gap-3 px-4">
                    <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Delivery zone
                      </label>
                      <select
                        value={deliveryZoneId}
                        onChange={(e) => setDeliveryZoneId(e.target.value)}
                        className="w-full appearance-none border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none"
                      >
                        <option value="">Pick up at office (free)</option>
                        {deliveryZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} — {z.fee_cents === 0 ? "FREE" : formatUSD(z.fee_cents)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground/60" />
                  </div>
                )}

                <div className="flex items-center gap-3 px-4">
                  <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      WhatsApp <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="+504 9370 6270"
                      value={whatsApp}
                      onChange={(e) => setWhatsApp(e.target.value)}
                      className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                {/* Saved-addresses row (same LocationPicker as cleaning + food).
                    Falls back to free-text — customer can tap a saved chip or
                    just type a pickup point. */}
                <div className="px-4 pt-3 pb-1">
                  <LocationPicker
                    userId={userData?.id}
                    value={deliveryAddress}
                    onPick={(line) => setDeliveryAddress(line)}
                  />
                </div>

                <NotesField
                  value={deliveryNotes}
                  onChange={setDeliveryNotes}
                  label="Notes"
                  title="Comment"
                  description="Any special instructions for delivery / pickup."
                  placeholder="Any special instructions…"
                />
              </div>
              {deliveryZone?.areas && (
                <p className="px-1 text-[11px] text-muted-foreground">Covers: {deliveryZone.areas}</p>
              )}
              <p className="px-1 text-[11px] text-muted-foreground">We'll confirm your booking and delivery on WhatsApp.</p>
            </section>
          </div>

          {/* Right: Price summary */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl bg-card p-6 space-y-4">
              <SectionOverline label="Booking summary" />

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
                            pricing.tier === "weekly" ? "Weekly rate" :
                            "Daily rate"
                          }
                          value={`${formatUSD(pricing.effectiveDailyRate)} / day`}
                        />
                        <SummaryRow label="Rental subtotal" value={formatUSD(pricing.subtotalCents)} />
                        {pricing.discountCents > 0 && (
                          <SummaryRow
                            label={pricing.capped ? "Capped at monthly price" : `You save (${pricing.discountPct}%)`}
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
                        {/* Extras lines */}
                        {selectedExtras.map((e) => {
                          const cost = extraCost(e);
                          return (
                            <SummaryRow
                              key={e.id}
                              label={`+ ${e.name}`}
                              value={cost > 0 ? `+${formatUSD(cost)}` : "Free"}
                              className={cost > 0 ? "" : "text-green-400"}
                            />
                          );
                        })}
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
                        ≈ {convertToSats(centsToDollars(effectiveGrandTotalCents)).toLocaleString()} sats
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

              {/* Desktop-only inline pay button (mobile uses sticky bar) */}
              <div className="hidden lg:block">
                <Button
                  size="lg"
                  className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
                  onClick={handleProceed}
                  disabled={!pricing || !startDate || !endDate || !!calendarError || extrasRequiredUnmet || whatsAppMissing}
                >
                  <Zap className="mr-2 h-5 w-5" />
                  Proceed to Payment
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Paid via Bitcoin Lightning Network
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Sticky bottom CTA bar (matches CarDetail Step 1) ────── */}
      {!showPayment && (
      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-background/95 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="market-content px-4 py-3">
          {/* Total summary line */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {pricing && startDate && endDate
                ? `${pricing.rentalDays} day${pricing.rentalDays !== 1 ? "s" : ""} · Lightning checkout`
                : "Select dates to continue"}
            </div>
            <div className="text-right">
              <p className="text-lg font-black tabular-nums text-foreground leading-none">
                {pricing ? formatUSD(effectiveGrandTotalCents) : "—"}
              </p>
              {pricing && feePct > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">Base {formatUSD(grandTotalCents)} + {feePct}% fee</p>
              )}
              {pricing && btcPrice && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  ≈ {convertToSats(centsToDollars(effectiveGrandTotalCents)).toLocaleString()} sats
                </p>
              )}
            </div>
          </div>
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
            onClick={handleProceed}
            disabled={!pricing || !startDate || !endDate || !!calendarError || extrasRequiredUnmet || whatsAppMissing}
          >
            <Zap className="mr-2 h-5 w-5" />
            {pricing && startDate && endDate ? "Proceed to Payment" : "Select dates"}
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {startDate && endDate && extrasRequiredUnmet
              ? "Select at least one add-on"
              : startDate && endDate && whatsAppMissing
              ? "Enter your WhatsApp number"
              : `Pay ${formatUSD(effectiveGrandTotalCents)} · Lightning`}
          </p>
        </div>
      </div>
      )}

      {/* Sticky pay CTA while choosing a Bitcoin method (matches cleaning checkout) */}
      {showPayment && !invoice && !onchainAddress && !isPaid && (paymentMethod === "lightning" || paymentMethod === "onchain") && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-background/95 backdrop-blur md:left-[var(--sidebar-width,0px)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="market-content px-4 py-3">
            <Button
              size="lg"
              className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
              onClick={generateInvoice}
              loading={isGenerating}
              disabled={isGenerating || isPriceLoading || !btcPrice}
            >
              {!isGenerating && (paymentMethod === "onchain" ? <Bitcoin className="h-5 w-5" /> : <Zap className="h-5 w-5" />)}
              {isGenerating
                ? (paymentMethod === "onchain" ? "Generating address…" : "Generating invoice…")
                : isPriceLoading
                ? "Loading rate…"
                : paymentMethod === "onchain"
                ? `Pay ${convertToSats(centsToDollars(effectiveGrandTotalCents)).toLocaleString()} sats on-chain`
                : `Pay ${convertToSats(centsToDollars(effectiveGrandTotalCents)).toLocaleString()} sats`}
            </Button>
          </div>
        </div>
      )}

      {/* Payment — inline on the booking page (same page, not a new one) */}
      {showPayment && (
        <section ref={paymentRef} className="market-content scroll-mt-4 px-4 pb-32 pt-2">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-4">
              <SectionOverline
                label={
                  isPaid
                    ? paymentMethod === "infinita" ? "Payment submitted" : "Payment confirmed"
                    : "Payment method"
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {formatUSD(grandTotalCents)} · {pricing?.rentalDays ?? 0} day{pricing?.rentalDays !== 1 ? "s" : ""}
              </p>
            </div>

          {/* Step: choose method (sticky bottom CTA generates the invoice) */}
          {!invoice && !onchainAddress && paymentMethod !== "infinita" && paymentMethod !== "paypal" && !isPaid ? (
            <div className="space-y-3">
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
            </div>
          ) : paymentMethod === "infinita" && !isPaid ? (
            <div className="py-4">
              <div className="w-full max-w-sm mx-auto mb-4">
                <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
              </div>
              <InfinitaPaymentPanel
                totalCents={effectiveGrandTotalCents}
                onPaid={handleInfinitaPaid}
                orderMeta={{
                  description: `Car rental: ${vehicle.name}`,
                  service_name: "Car Rental",
                  plan_name: `${vehicle.name} · ${insuranceTier?.name ?? "Basic"} insurance`,
                  client_name: userData?.name ?? userData?.email ?? "",
                  client_email: userData?.email ?? "",
                  duration: `${pricing?.rentalDays ?? 0} day${(pricing?.rentalDays ?? 0) !== 1 ? "s" : ""}`,
                  admin_url: `${window.location.origin}/admin/car-rentals/reservations`,
                }}
              />
            </div>
          ) : paymentMethod === "paypal" && !isPaid ? (
            <div className="py-4">
              <div className="w-full max-w-sm mx-auto mb-4">
                <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
              </div>
              <PayPalPanel
                totalCents={effectiveGrandTotalCents}
                onPaid={handlePaypalPaid}
                orderMeta={{
                  description: `Car rental: ${vehicle.name}`,
                  service_name: "Car Rental",
                  plan_name: `${vehicle.name} · ${insuranceTier?.name ?? "Basic"} insurance`,
                  client_name: userData?.name ?? userData?.email ?? "",
                  client_email: userData?.email ?? "",
                  duration: `${pricing?.rentalDays ?? 0} day${(pricing?.rentalDays ?? 0) !== 1 ? "s" : ""}`,
                  admin_url: `${window.location.origin}/admin/car-rentals/reservations`,
                }}
              />
            </div>
          ) : isPaid ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-400" />
              <p className="text-xl font-black">
                {paymentMethod === "infinita" ? "Payment submitted!" : "Payment received!"}
              </p>
              <p className="text-muted-foreground">
                {paymentMethod === "infinita"
                  ? "An admin will verify your transaction and confirm your booking shortly."
                  : "Your booking is confirmed. We'll be in touch shortly."}
              </p>
              <Button className="mt-4 rounded-full" onClick={() => navigate("/my-subscriptions")}>
                View My Bookings
              </Button>
            </div>
          ) : invoice ? (
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
                <Spinner size="sm" className="text-amber-400" />
                Waiting for payment…
              </div>
              {lockedSatsAmount && (
                <p className="text-xs text-muted-foreground">
                  Amount: {lockedSatsAmount.toLocaleString()} sats
                </p>
              )}
            </div>
          ) : onchainAddress ? (
            <div className="flex flex-col items-center gap-5">
              <a
                href={onchainUri ?? `bitcoin:${onchainAddress}`}
                className="rounded-2xl border-4 border-foreground p-3 bg-white"
              >
                <QRCodeSVG value={onchainUri ?? `bitcoin:${onchainAddress}`} size={220} />
              </a>
              <p className="text-sm text-muted-foreground text-center">Send exactly {(lockedSatsAmount || 0).toLocaleString()} sats to this address</p>
              <div className="w-full max-w-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bitcoin Address</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-hidden text-ellipsis rounded-lg bg-muted px-3 py-2 text-xs break-all">
                    {onchainAddress}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(onchainAddress!); toast.success("Copied!"); }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" className="text-amber-400" />
                Waiting for payment… on-chain can take a few minutes.
              </div>
            </div>
          ) : null}
          </div>
        </section>
      )}

      {/* Success overlay — mounted over the checkout content so the booking
          confirmation feels the same as food / cleaning / beach. Fixed inset
          + backdrop so it eats the whole viewport instead of a bottom-sheet. */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="mx-auto max-w-xl px-4 py-6">
            <CheckoutSuccessPanel
              icon={Car}
              amount={formatUSD(effectiveGrandTotalCents)}
              eyebrow="Booking confirmed"
              subtitle={
                <>
                  {vehicle.name}
                  {startDate && endDate && (
                    <> · {format(parseISO(startDate), "MMM d")} – {format(parseISO(endDate), "MMM d, yyyy")}</>
                  )}
                </>
              }
              ctaLabel="View my bookings"
              onCta={() => navigate("/my-subscriptions")}
              secondary={{
                label: "Back to cars",
                onClick: () => navigate("/services/cars"),
              }}
            />
          </div>
        </div>
      )}

      </div>
    </UserLayout>
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
