import { useEffect, useMemo, useRef, useState } from "react";
import { Photo } from "@/components/patterns/Photo";
import { useLocation, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { Car, ShieldCheck, Check, ChevronRight, MapPin } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { CheckoutSuccessPanel } from "@/components/patterns/CheckoutSuccessPanel";
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
import { accountApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicle } from "../hooks/useVehicles";
import { calcRentalPrice, extraCost } from "../types/carRental";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { carPath } from "../lib/routes";
import { todayHN } from "@/lib/timezone";

export default function Book() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { openAuthModal } = useAuthModal();
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
    if (fromISO < todayHN()) return "That pickup date has already passed.";
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
    setExtraIds((prev) => {
      const n = new Set(prev);
      if (n.has(eid)) n.delete(eid); else n.add(eid);
      return n;
    });

  const activate = async (ref: string, m: string) => {
    if (pendingIdRef.current) {
      // The API re-verifies the reference with the payment provider before it
      // marks anything paid. The direct write below is the pre-API behaviour,
      // kept as a fallback until the endpoint is deployed — the reconcile cron
      // re-verifies everything server-side either way.
      // The server checks the payment with Blink/PayPal — that it settled,
      // for this booking's amount, and only once. There is no browser
      // fallback: a write from here was how a booking could be marked paid
      // without being paid. The reconcile cron re-checks anything left pending.
      const { error } = await accountApi(`/rentals/bookings/${pendingIdRef.current}/confirm`, {
        method: "POST",
        body: JSON.stringify({ payment_reference: ref, payment_method: m }),
      });
      if (error) {
        toast.error(error.message === "payment_not_confirmed"
          ? "We haven't seen the payment confirmed yet — your booking will update by itself once it lands."
          : "We couldn't confirm the payment right now. If you paid, it will be matched automatically — or write to support.");
      }
    }
    setStep("done");
  };

  const inv = useInvoicePayment({
    onPaid: (ref, m) => activate(ref, m),
    onInvoiceReady: (ref, m) => {
      // Through the API: the browser no longer writes rental rows.
      if (pendingIdRef.current) {
        void accountApi(`/rentals/bookings/${pendingIdRef.current}/reference`, {
          method: "POST", body: JSON.stringify({ payment_reference: ref, payment_method: m }),
        });
      }
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
    toast.error(refusal ?? "We couldn't reserve the car right now. Please try again in a moment.");
    return null;
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
      // The rental company is told when the rental is PAID (the confirm
      // endpoint), not about every hold a checkout opens and abandons.
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
      <p className="text-title font-semibold text-foreground">
        {problem ?? "Something's missing for this booking."}
      </p>
      <Button variant="secondary" className="mt-3" onClick={() => navigate(v ? carPath(`vehicle/${v.id}`) : carPath())}>
        {v ? "Choose dates" : "Back to vehicles"}
      </Button>
    </AppContainer>
  );

  // The platform's success screen. This was a bespoke card — same idea, its
  // own icon, its own spacing, its own single way out (PAGE_TYPES §7).
  if (step === "done") return (
    <AppContainer className="py-space-6">
      <CheckoutSuccessPanel
        icon={Car}
        amount={formatUSD(baseTotal)}
        eyebrow="Booking confirmed"
        subtitle={`${v.name} · ${format(new Date(fromISO + "T00:00:00"), "MMM d")} → ${format(new Date(toISOParam + "T00:00:00"), "MMM d")}`}
        ctaLabel="View my bookings"
        onCta={() => navigate(carPath("my-bookings"))}
        secondary={{ label: "Browse vehicles", onClick: () => navigate(carPath()) }}
      />
    </AppContainer>
  );

  return (
    <AppContainer className={cn("py-6", step === "form" && "pb-[calc(var(--checkout-footer-h,120px)+16px)]")}>
      <div className="grid gap-1 lg:grid-cols-[1fr_360px] lg:gap-4">
        <div className="space-y-1">
          {step === "form" ? (
            <>
              {/* Details */}
              <div className="space-y-3 rounded-radius-lg bg-card p-4">
                <h2 className="text-title font-semibold text-foreground">Your details</h2>
                <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
                <div className="space-y-1.5"><Label>WhatsApp</Label><Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+504 …" /></div>
                <div className="space-y-1.5"><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>

              {/* Insurance + Delivery — summary rows opening a sheet (DESIGN.md §9) */}
              <div className="overflow-hidden rounded-radius-lg bg-card">
                <SummaryRow
                  icon={<ShieldCheck className="h-5 w-5 text-muted-foreground" />}
                  tint="bg-inset"
                  title="Insurance"
                  value={insurance ? `${insurance.name}${insuranceCents > 0 ? ` · ${formatUSD(insuranceCents)}` : " · included"}` : "Choose coverage"}
                  onClick={() => setInsOpen(true)}
                />
                <SummaryRow
                  icon={<MapPin className="h-5 w-5 text-muted-foreground" />}
                  tint="bg-inset"
                  title="Delivery"
                  value={zone ? `${zone.name}${deliveryFee > 0 ? ` · ${formatUSD(deliveryFee)}` : " · free"}` : "Pick up at our office — free"}
                  onClick={() => setZoneOpen(true)}
                />
                {/* Where to bring it — asked only when it is being brought. */}
                {zone && (
                  <div className="space-y-1.5 px-4 pb-4">
                    <Label htmlFor="rent-addr">Where should we bring the car?</Label>
                    <Input id="rent-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Hotel, building, street…" />
                  </div>
                )}
              </div>

              {/* Extras */}
              {extras.length > 0 && (
                <div className="space-y-1 rounded-radius-lg bg-card p-4">
                  <h2 className="mb-1 text-title font-semibold text-foreground">Extras</h2>
                  {extras.map((e) => {
                    const active = extraIds.has(e.id);
                    return (
                      <button key={e.id} type="button" onClick={() => toggleExtra(e.id)}
                        className="flex w-full items-center gap-3 rounded-radius-sm px-2 py-2 text-left transition-colors hover:bg-inset">
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                          {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 text-body text-foreground">{e.name}</span>
                        <span className="text-meta tabular-nums text-muted-foreground">{formatUSD(e.price_cents)}{e.price_type === "per_day" ? " / day" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Payment method — the Pay button itself lives in the sticky
                  footer below, where every other checkout on the platform
                  keeps it. It used to sit inside this card, mid-scroll: the
                  most important button on the page was the only one a customer
                  had to go looking for. */}
              <div className="space-y-3 rounded-radius-lg bg-card p-4">
                <h2 className="text-title font-semibold text-foreground">Payment</h2>
                <PaymentMethodTiles value={method} onChange={setMethod} available={methods} />
              </div>
            </>
          ) : (
            <div className="rounded-radius-lg bg-card p-4">
              {method === "paypal" ? (
                <>
                  <h2 className="mb-3 text-title font-semibold text-foreground">Pay with PayPal</h2>
                  <PayPalPanel
                    totalCents={serverCharged ?? effectiveTotal}
                    onPaid={(cap: string) => activate(cap, "paypal")}
                    // Write the order id the moment PayPal issues it. Without a
                    // reference on the row, a capture whose browser died before
                    // it could confirm is invisible to the reconcile — the
                    // customer has paid and the booking gets expired instead.
                    onOrderCreated={(orderId: string) => {
                      if (pendingIdRef.current) {
                        void accountApi(`/rentals/bookings/${pendingIdRef.current}/reference`, {
                          method: "POST", body: JSON.stringify({ payment_reference: orderId, payment_method: "paypal" }),
                        });
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
        {/* What you're booking comes first on a phone — it used to be the
            last thing on the page, under the payment tiles. */}
        <div className="order-first space-y-1 lg:order-none lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-radius-lg bg-card p-4">
            <div className="mb-3 flex gap-3">
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-[8px] bg-inset">
                <Photo src={v.image_url} icon={Car} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-title font-semibold text-foreground">{v.name}</p>
                <p className="text-meta text-muted-foreground">{format(new Date(fromISO + "T00:00:00"), "MMM d")} → {format(new Date(toISOParam + "T00:00:00"), "MMM d")}</p>
                <p className="text-meta text-muted-foreground">{pricing.rentalDays} day{pricing.rentalDays > 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-border/60 pt-3 text-body">
              <Line label={`Car · ${pricing.rentalDays} day${pricing.rentalDays > 1 ? "s" : ""}`} value={formatUSD(pricing.subtotalCents)} />
              {pricing.discountCents > 0 && <Line label="Multi-day discount" value={`−${formatUSD(pricing.discountCents)}`} accent />}
              {insuranceCents > 0 && <Line label={insurance?.name ?? "Insurance"} value={formatUSD(insuranceCents)} />}
              {chosenExtras.map((e) => <Line key={e.id} label={e.name} value={formatUSD(extraCost(e, days))} />)}
              {deliveryFee > 0 && <Line label={`Delivery · ${zone?.name}`} value={formatUSD(deliveryFee)} />}
              {effectiveTotal > baseTotal && <Line label="Payment fee" value={formatUSD(effectiveTotal - baseTotal)} />}
              <div className="flex justify-between border-t border-border/60 pt-2 text-title font-semibold text-foreground">
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
          <Button size="lg" className="w-full" disabled={reserving}
            onClick={() => (isAuthenticated ? void startPay() : openAuthModal("login", location.pathname + location.search))}>
            {reserving && <Spinner size="sm" className="mr-2" />}
            {isAuthenticated ? `Pay ${formatUSD(effectiveTotal)}` : `Sign in to book · ${formatUSD(effectiveTotal)}`}
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
                    <p className="text-title font-semibold text-foreground">{t.name}</p>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", t.price_per_day_cents === 0 ? "text-positive" : "text-foreground")}>
                      {t.price_per_day_cents === 0 ? "Included" : `${formatUSD(t.price_per_day_cents)}/day · ${formatUSD(cost)}`}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {t.items.map((it, i) => (
                      <li key={i} className="flex items-start gap-2 text-meta text-muted-foreground">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" /> {it}
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
        <p className="text-title font-semibold text-foreground">{title}</p>
        <p className="truncate text-meta text-muted-foreground">{value}</p>
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
        <p className="text-title font-semibold text-foreground">{title}</p>
        <span className="shrink-0 text-body font-semibold tabular-nums text-foreground">{sub}</span>
      </div>
      {areas && <p className="mt-0.5 text-meta text-muted-foreground">{areas}</p>}
    </button>
  );
}
