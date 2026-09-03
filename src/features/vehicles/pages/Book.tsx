import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, Check, ChevronRight, MapPin } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { CheckoutStickyFooter } from "@/components/patterns/CheckoutStickyFooter";
import { PaymentMethodTiles } from "@/components/payment/PaymentMethodTiles";
import { type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { useAddons } from "../hooks/useAddons";
import { attachPaymentReference } from "@/lib/payments/pendingReference";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicle } from "../hooks/useVehicles";
import { calcRentalPrice, extraCost } from "../types/carRental";
import { fetchHeldRanges, overlapsHeld } from "../lib/availability";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { carPath } from "../lib/routes";

export default function Book() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, userData } = useAuth();
  const { data: v, isLoading } = useVehicle(id);
  // The terms on offer are the ones belonging to the business that owns
  // this car, not the platform's — see useAddons.
  const { data: addons } = useAddons(v?.provider_id);

  const fromISO = params.get("from") ?? "";
  const toISOParam = params.get("to") ?? "";
  const rentalDays = useMemo(() => {
    if (!fromISO || !toISOParam) return 0;
    return differenceInCalendarDays(new Date(toISOParam + "T00:00:00"), new Date(fromISO + "T00:00:00")) + 1;
  }, [fromISO, toISOParam]);
  const pricing = useMemo(() => (v && rentalDays > 0 ? calcRentalPrice(v, rentalDays) : null), [v, rentalDays]);

  /**
   * The dates and the car both arrive from the URL, so neither can be trusted:
   * a hand-edited link could book a car that was never listed, or a week that
   * has already happened.
   */
  const problem = useMemo(() => {
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO.test(fromISO) || !ISO.test(toISOParam)) return "Pick your dates first.";
    if (toISOParam < fromISO) return "The return date is before the pickup date.";
    if (fromISO < format(new Date(), "yyyy-MM-dd")) return "That pickup date has already passed.";
    if (v && v.status !== "public") return "This car isn't available for booking.";
    return null;
  }, [fromISO, toISOParam, v]);

  const { enabled: methods, addSurchargeCents } = usePaymentMethods();
  const { convertToSats } = useBtcPrice();
  const [method, setMethod] = useState<PaymentMethod>("lightning");
  const [name, setName] = useState(userData?.name ?? "");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"form" | "pay" | "done">("form");
  const [reserving, setReserving] = useState(false);
  const pendingIdRef = useRef<string | null>(null);
  /**
   * What the SERVER said this booking costs, when the API reserved it. The
   * page's own arithmetic stays for display, but the invoice is raised for the
   * figure on the row — the two should always agree, and when they don't the
   * row wins.
   */
  const [serverCharged, setServerCharged] = useState<number | null>(null);

  // Add-ons
  const insuranceTiers = addons?.insurance ?? [];
  const extras = addons?.extras ?? [];
  const zones = addons?.zones ?? [];
  const [insuranceId, setInsuranceId] = useState("");
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());
  const [zoneId, setZoneId] = useState("");
  const [insOpen, setInsOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  useEffect(() => { if (!insuranceId && insuranceTiers.length) setInsuranceId(insuranceTiers[0].id); }, [insuranceTiers, insuranceId]);

  const insurance = insuranceTiers.find((t) => t.id === insuranceId) ?? null;
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const days = pricing?.rentalDays ?? 0;
  const insuranceCents = insurance ? insurance.price_per_day_cents * Math.max(1, days) : 0;
  const chosenExtras = extras.filter((e) => extraIds.has(e.id));
  const extrasCents = chosenExtras.reduce((s, e) => s + extraCost(e, days), 0);
  const deliveryFee = zone?.fee_cents ?? 0;
  const addonsCents = insuranceCents + extrasCents + deliveryFee;

  const rentalTotal = pricing?.totalCents ?? 0;
  const baseTotal = rentalTotal + addonsCents;
  const effectiveTotal = addSurchargeCents(baseTotal, method);

  const toggleExtra = (eid: string) =>
    setExtraIds((prev) => { const n = new Set(prev); n.has(eid) ? n.delete(eid) : n.add(eid); return n; });

  const activate = async (ref: string, m: string) => {
    if (pendingIdRef.current) {
      // The API re-verifies the reference with the payment provider before it
      // marks anything paid. The direct write below is the pre-API behaviour,
      // kept as a fallback until the endpoint is deployed — the reconcile cron
      // re-verifies everything server-side either way.
      const { error } = await accountApi(`/rentals/bookings/${pendingIdRef.current}/confirm`, {
        method: "POST",
        body: JSON.stringify({ payment_reference: ref, payment_method: m }),
      });
      if (error) {
        await supabaseDb.from("rental_bookings")
          .update({ status: "confirmed", payment_status: "paid", payment_method: m, payment_reference: ref })
          .eq("id", pendingIdRef.current);
      }
    }
    setStep("done");
  };

  const inv = useInvoicePayment({
    onPaid: (ref, m) => activate(ref, m),
    onInvoiceReady: (ref, m) => {
      if (pendingIdRef.current) attachPaymentReference(supabaseDb, "rental_bookings", pendingIdRef.current, ref, m);
    },
  });

  /** Refusals the API words for a customer — a refusal never falls back. */
  const REFUSALS: Record<string, string> = {
    dates_taken: "Sorry — this car was just booked for those dates. Please pick another period.",
    invalid_dates: "Those dates can't be booked. Please pick them again.",
    vehicle_unavailable: "This car isn't available for booking.",
    invalid_insurance: "That insurance option is no longer offered — please reselect.",
    invalid_extras: "One of the extras is no longer offered — please reselect.",
    invalid_zone: "That delivery zone is no longer offered — please reselect.",
  };

  const reserve = async (): Promise<{ id: string; charged: number | null } | null> => {
    if (!v || !pricing || !userData?.id) return null;

    /**
     * The API reserves first: it prices the rental itself, from the same rows
     * this page showed, so the request only ever names WHAT is wanted — never
     * what it costs. The direct insert below is the pre-API path, kept solely
     * as a fallback while the endpoint ships behind a broken deploy pipeline;
     * once the API is live and proven the fallback goes, and RLS on
     * `rental_bookings` closes behind it.
     */
    const viaApi = await accountApi("/rentals/bookings", {
      method: "POST",
      body: JSON.stringify({
        vehicle_id: v.id,
        start_date: fromISO,
        end_date: toISOParam,
        insurance_tier_id: insuranceId || undefined,
        extra_ids: [...extraIds],
        delivery_zone_id: zoneId || undefined,
        payment_method: method,
        customer_name: name.trim() || userData.name || undefined,
        customer_whatsapp: whatsapp.trim() || undefined,
        delivery_address: address.trim() || undefined,
        delivery_notes: notes.trim() || undefined,
      }),
    });
    const apiRow = viaApi.data as { id?: string; charged_cents?: number } | null;
    if (!viaApi.error && apiRow?.id) {
      return { id: apiRow.id, charged: Number(apiRow.charged_cents) || null };
    }
    const refusal = viaApi.error ? REFUSALS[viaApi.error.message] : null;
    if (refusal) { toast.error(refusal); return null; }

    // The calendar was read when the page loaded; somebody else may have taken
    // these dates since. This re-read is for the MESSAGE — it catches the
    // common case early and says something a customer can act on. It cannot
    // win a race it is on the wrong side of: two people pressing Book in the
    // same second both pass it. What actually guarantees one car is not sold
    // twice is the exclusion constraint on rental_bookings, handled below.
    try {
      const held = await fetchHeldRanges(v.id);
      if (overlapsHeld(fromISO, toISOParam, held)) {
        toast.error("Sorry — this car was just booked for those dates. Please pick another period.");
        return null;
      }
    } catch {
      // Availability unreadable: let the booking through rather than block a
      // paying customer on a transient network error.
    }

    const { data, error } = await supabaseDb.from("rental_bookings").insert({
      user_id: userData.id, vehicle_id: v.id, start_date: fromISO, end_date: toISOParam,
      rental_days: pricing.rentalDays, daily_price_cents: pricing.effectiveDailyRate,
      subtotal_cents: pricing.subtotalCents, discount_pct: pricing.discountPct, discount_cents: pricing.discountCents,
      insurance_tier_id: insuranceId || null, insurance_cents: insuranceCents,
      delivery_zone_id: zoneId || null, delivery_fee_cents: deliveryFee,
      extras: chosenExtras.map((e) => ({ id: e.id, name: e.name, cents: extraCost(e, days) })), extras_cents: extrasCents,
      total_cents: baseTotal, surcharge_cents: Math.max(0, effectiveTotal - baseTotal),
      customer_name: name.trim() || userData.name || null, customer_whatsapp: whatsapp.trim() || null,
      delivery_address: address.trim() || (zone ? zone.name : null), delivery_notes: notes.trim() || null,
      status: "pending", payment_status: "pending", payment_method: method,
    }).select("id").single();
    if (error) {
      // 23P01 — the overlap constraint refused it, so somebody else's booking
      // holds these dates. Postgres phrases that as a key conflict with a
      // daterange in it, which is not a sentence to show a customer.
      const raced = (error as { code?: string }).code === "23P01"
        || /exclusion constraint/i.test(error.message ?? "");
      toast.error(raced
        ? "Sorry — this car was just booked for those dates. Please pick another period."
        : error.message);
      return null;
    }
    return data?.id ? { id: data.id, charged: null } : null;
  };

  const startPay = async () => {
    if (!isAuthenticated) { toast.error("Please sign in to book."); return; }
    if (!pricing) return;
    if (!name.trim()) { toast.error("Add your name."); return; }
    setReserving(true);
    try {
      const reserved = await reserve();
      if (!reserved) return;
      pendingIdRef.current = reserved.id;
      // Charge what the row says, not what this page computed — same inputs,
      // but the row is what the reconcile cron verifies against.
      const payTotal = reserved.charged ?? effectiveTotal;
      setServerCharged(reserved.charged);
      setStep("pay");
      if (method === "lightning" || method === "onchain") {
        inv.start({
          method,
          amountCents: payTotal,
          amountSats: convertToSats(centsToDollars(payTotal)),
          description: `${v?.name} · ${fromISO}→${toISOParam}`,
          // Recorded on the checkout session at invoice time, which is what the
          // team's email and Telegram message read from. Without it a car
          // booking arrived as an unnamed "EverySub payment".
          meta: {
            service_name: "EverySub Cars — rental",
            plan_name: v?.name,
            client_name: name.trim() || userData?.name || undefined,
            client_email: userData?.email || undefined,
            client_phone: whatsapp.trim() || undefined,
            duration: `${pricing.rentalDays} day${pricing.rentalDays > 1 ? "s" : ""}`,
            selected_date_time: `${fromISO} → ${toISOParam}`,
            booking_id: reserved.id,
          },
        });
      }
    } finally { setReserving(false); }
  };

  if (isLoading) return <AppContainer className="flex justify-center py-24"><Spinner /></AppContainer>;
  if (!v || !pricing || problem) return (
    <AppContainer className="py-24 text-center">
      <p className="text-[16px] font-semibold text-foreground">
        {problem ?? "Something's missing for this booking."}
      </p>
      <Button variant="secondary" className="mt-3" onClick={() => navigate(v ? carPath(`vehicle/${v.id}`) : carPath())}>
        {v ? "Choose dates" : "Back to fleet"}
      </Button>
    </AppContainer>
  );

  if (step === "done") return (
    <AppContainer className="py-16">
      <div className="mx-auto max-w-md rounded-radius-md bg-card p-8 text-center shadow-figma">
        <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
        <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Booking confirmed</h1>
        <p className="mt-2 text-[12px] tracking-[-0.24px] text-muted-foreground">
          {v.name} · {format(new Date(fromISO + "T00:00:00"), "MMM d")} → {format(new Date(toISOParam + "T00:00:00"), "MMM d")}
        </p>
        <p className="mt-1 text-[16px] font-semibold tabular-nums text-foreground">{formatUSD(baseTotal)}</p>
        <Button className="mt-6 w-full" onClick={() => navigate(carPath("my-bookings"))}>View my bookings</Button>
      </div>
    </AppContainer>
  );

  return (
    <AppContainer className={cn("py-6", step === "form" && "pb-[calc(var(--checkout-footer-h,120px)+16px)]")}>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {step === "form" ? (
            <>
              {/* Details */}
              <div className="space-y-3 rounded-radius-md bg-card p-5 shadow-figma">
                <h2 className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">Your details</h2>
                <div><Label>Full name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
                <div><Label>WhatsApp</Label><Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+504 …" /></div>
                <div><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>

              {/* Insurance + Delivery — summary rows opening a sheet (DESIGN.md §9) */}
              <div className="overflow-hidden rounded-radius-md bg-card shadow-figma divide-y divide-border/60">
                <SummaryRow
                  icon={<ShieldCheck className="h-5 w-5 text-emerald-500" />}
                  tint="bg-emerald-500/15"
                  title="Insurance"
                  value={insurance ? `${insurance.name}${insuranceCents > 0 ? ` · ${formatUSD(insuranceCents)}` : " · included"}` : "Choose coverage"}
                  onClick={() => setInsOpen(true)}
                />
                <SummaryRow
                  icon={<MapPin className="h-5 w-5 text-primary" />}
                  tint="bg-primary/15"
                  title="Delivery"
                  value={zone ? `${zone.name}${deliveryFee > 0 ? ` · ${formatUSD(deliveryFee)}` : " · free"}` : "Pick up at our office — free"}
                  onClick={() => setZoneOpen(true)}
                />
              </div>

              {/* Extras */}
              {extras.length > 0 && (
                <div className="space-y-1 rounded-radius-md bg-card p-5 shadow-figma">
                  <h2 className="mb-1 text-[16px] font-semibold tracking-[-0.32px] text-foreground">Extras</h2>
                  {extras.map((e) => {
                    const active = extraIds.has(e.id);
                    return (
                      <button key={e.id} type="button" onClick={() => toggleExtra(e.id)}
                        className="flex w-full items-center gap-3 rounded-radius-sm px-2 py-2 text-left transition-colors hover:bg-inset">
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                          {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 text-[14px] tracking-[-0.02em] text-foreground">{e.name}</span>
                        <span className="text-[12px] tabular-nums text-muted-foreground">{formatUSD(e.price_cents)}{e.price_type === "per_day" ? "/day" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Delivery address */}
              <div className="rounded-radius-md bg-card p-5 shadow-figma">
                <Label>Delivery address / details (optional)</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where should we bring the car?" />
              </div>

              {/* Payment method — the Pay button itself lives in the sticky
                  footer below, where every other checkout on the platform
                  keeps it. It used to sit inside this card, mid-scroll: the
                  most important button on the page was the only one a customer
                  had to go looking for. */}
              <div className="space-y-3 rounded-radius-md bg-card p-5 shadow-figma">
                <h2 className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">Payment</h2>
                <PaymentMethodTiles value={method} onChange={setMethod} available={methods} />
              </div>
            </>
          ) : (
            <div className="rounded-radius-md bg-card p-5 shadow-figma">
              {method === "paypal" ? (
                <>
                  <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.32px] text-foreground">Pay with PayPal</h2>
                  <PayPalPanel
                    totalCents={serverCharged ?? effectiveTotal}
                    onPaid={(cap: string) => activate(cap, "paypal")}
                    // Write the order id the moment PayPal issues it. Without a
                    // reference on the row, a capture whose browser died before
                    // it could confirm is invisible to the reconcile — the
                    // customer has paid and the booking gets expired instead.
                    onOrderCreated={(orderId: string) => {
                      if (pendingIdRef.current) {
                        attachPaymentReference(supabaseDb, "rental_bookings", pendingIdRef.current, orderId, "paypal");
                      }
                    }}
                    orderMeta={{
                      description: `${v.name} rental`,
                      service_name: "EverySub Cars — rental",
                      plan_name: v.name,
                      client_name: name.trim() || userData?.name || undefined,
                      client_email: userData?.email || undefined,
                      client_phone: whatsapp.trim() || undefined,
                      duration: `${pricing.rentalDays} day${pricing.rentalDays > 1 ? "s" : ""}`,
                      selected_date_time: `${fromISO} → ${toISOParam}`,
                      booking_id: pendingIdRef.current ?? undefined,
                    }}
                  />
                </>
              ) : (
                <InvoiceQrPanel
                  mode={method === "onchain" ? "onchain" : "lightning"}
                  invoice={inv.state.invoice} address={inv.state.address} uri={inv.state.uri}
                  sats={inv.state.sats ?? 0} totalCents={serverCharged ?? effectiveTotal}
                  isPaid={inv.state.isPaid} isExpired={inv.state.isExpired}
                  onRetry={() => inv.reset()} successLabel="Confirming your booking…"
                />
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-radius-md bg-card p-4 shadow-figma">
            <div className="mb-3 flex gap-3">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-[8px] bg-inset">
                {v.image_url && <img src={v.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{v.name}</p>
                <p className="text-[12px] tracking-[-0.24px] text-muted-foreground">{format(new Date(fromISO + "T00:00:00"), "MMM d")} → {format(new Date(toISOParam + "T00:00:00"), "MMM d")}</p>
                <p className="text-[12px] tracking-[-0.24px] text-muted-foreground">{pricing.rentalDays} day{pricing.rentalDays > 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-border/60 pt-3 text-[13px]">
              <Line label={`Car · ${pricing.rentalDays}d`} value={formatUSD(pricing.subtotalCents)} />
              {pricing.discountCents > 0 && <Line label="Multi-day discount" value={`−${formatUSD(pricing.discountCents)}`} accent />}
              {insuranceCents > 0 && <Line label={insurance?.name ?? "Insurance"} value={formatUSD(insuranceCents)} />}
              {chosenExtras.map((e) => <Line key={e.id} label={e.name} value={formatUSD(extraCost(e, days))} />)}
              {deliveryFee > 0 && <Line label={`Delivery · ${zone?.name}`} value={formatUSD(deliveryFee)} />}
              {effectiveTotal > baseTotal && <Line label="Payment fee" value={formatUSD(effectiveTotal - baseTotal)} />}
              <div className="flex justify-between border-t border-border/60 pt-2 text-[16px] font-semibold text-foreground">
                <span>Total</span><span className="tabular-nums">{formatUSD(effectiveTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The one place a Pay button lives on this platform: pinned to the
          bottom, always reachable — same component as PlanCheckout and Cart. */}
      {step === "form" && (
        <CheckoutStickyFooter>
          <Button size="lg" className="w-full" onClick={startPay} disabled={reserving || !isAuthenticated}>
            {reserving && <Spinner size="sm" className="mr-2" />}
            {isAuthenticated ? `Pay ${formatUSD(effectiveTotal)}` : "Sign in to book"}
          </Button>
        </CheckoutStickyFooter>
      )}

      {/* Insurance sheet — ResponsiveDialog so it is a bottom sheet on a
          phone, like every other dialog a customer meets. */}
      <ResponsiveDialog
        open={insOpen}
        onOpenChange={setInsOpen}
        title="Insurance"
        description="Basic coverage is included. Upgrade for extra protection."
      >
          <div className="space-y-3 overflow-y-auto">
            {insuranceTiers.map((t) => {
              const active = insuranceId === t.id;
              const cost = t.price_per_day_cents * Math.max(1, days);
              return (
                <button key={t.id} type="button" onClick={() => { setInsuranceId(t.id); setInsOpen(false); }}
                  className={cn("w-full rounded-radius-md border-2 p-4 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "border-transparent bg-inset hover:bg-muted")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">{t.name}</p>
                    <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", t.price_per_day_cents === 0 ? "text-emerald-500" : "text-foreground")}>
                      {t.price_per_day_cents === 0 ? "Included" : `${formatUSD(t.price_per_day_cents)}/day · ${formatUSD(cost)}`}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {t.items.map((it, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] tracking-[-0.24px] text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> {it}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
      </ResponsiveDialog>

      {/* Delivery sheet */}
      <ResponsiveDialog
        open={zoneOpen}
        onOpenChange={setZoneOpen}
        title="Delivery"
        description="Pick up for free, or we bring it to your zone."
      >
          <div className="space-y-2 overflow-y-auto">
            <ZoneOption active={!zoneId} title="Pick up at our office" sub="Free" onClick={() => { setZoneId(""); setZoneOpen(false); }} />
            {zones.map((z) => (
              <ZoneOption key={z.id} active={zoneId === z.id} title={z.name} sub={z.fee_cents > 0 ? formatUSD(z.fee_cents) : "Free"} areas={z.areas}
                onClick={() => { setZoneId(z.id); setZoneOpen(false); }} />
            ))}
          </div>
      </ResponsiveDialog>
    </AppContainer>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span className="tracking-[-0.02em]">{label}</span>
      <span className={cn("tabular-nums", accent && "text-primary")}>{value}</span>
    </div>
  );
}

function SummaryRow({ icon, tint, title, value, onClick }: { icon: React.ReactNode; tint: string; title: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-inset">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]", tint)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">{title}</p>
        <p className="truncate text-[12px] tracking-[-0.24px] text-muted-foreground">{value}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ZoneOption({ active, title, sub, areas, onClick }: { active: boolean; title: string; sub: string; areas?: string | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("w-full rounded-radius-md border-2 p-3 text-left transition-colors", active ? "border-primary bg-primary/5" : "border-transparent bg-inset hover:bg-muted")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-[-0.32px] text-foreground">{title}</p>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{sub}</span>
      </div>
      {areas && <p className="mt-0.5 text-[12px] tracking-[-0.24px] text-muted-foreground">{areas}</p>}
    </button>
  );
}
