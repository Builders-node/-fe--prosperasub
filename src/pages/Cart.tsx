import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import {
  ShoppingCart, Trash2, Minus, Plus, MapPin, MessageCircle, User as UserIcon,
  Check, UtensilsCrossed, X,
} from "lucide-react";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { CheckoutStickyFooter } from "@/components/patterns/CheckoutStickyFooter";
import { CheckoutSuccessPanel } from "@/components/patterns/CheckoutSuccessPanel";
import { NotesField } from "@/components/patterns/NotesField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { toast } from "sonner";
import { supabaseDb } from "@/integrations/supabase/client";
import { LocationPicker } from "@/components/account/SavedLocations";
import { useCart, cartLineTotal } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePhonePrefill } from "@/hooks/useAccountPhone";
import { phoneError } from "@/components/patterns/CustomerPhone";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { payLabel } from "@/lib/checkout/ctaLabel";
import { CheckoutCard, CheckoutLineItem, PersonalDataCard, ResumeCard } from "@/components/checkout/CheckoutBlocks";
import { PaymentMethodTiles } from "@/components/payment/PaymentMethodTiles";
import { todayHN, addDaysISO } from "@/lib/timezone";
import { DURATION_OPTIONS } from "@/lib/durations";
import { CART_SERVICES, lineTotalCents, periodLabel, quantityLabel } from "@/lib/cart/cartItem";
import { CART_TABLES, buildRows, paidPatch, needsUuidUser, isUuid } from "@/lib/cart/checkoutRows";
import { resolveCheckoutPlan, type CheckoutPlan } from "@/lib/checkout/planCheckoutModel";
import type { CartService } from "@/lib/cart/cartItem";
import { Sparkles, Waves, Package } from "lucide-react";

/** A line reads as its service at a glance, not as food-with-a-different-name. */
const SERVICE_ICON: Record<CartService, typeof UtensilsCrossed> = {
  food: UtensilsCrossed,
  cleaning: Sparkles,
  beach: Waves,
  plan: Package,
};

type Step = "cart" | "pay" | "success";

/**
 * End date for a food subscription bought through the cart.
 *
 * `weeks*7 - 1` because the period is INCLUSIVE of the start day — a 1-week
 * plan starting Monday ends the following Sunday, not the following Monday.
 * FoodPlanDetail has always done it this way (addDaysIso(start, weeks*7 - 1));
 * the cart's own `+ weeks*7` silently granted one extra delivery day per line
 * for the identical product.
 *
 * Also routed through addDaysISO: the old local-midnight → toISOString() pair
 * shifted the result a day for any browser east of UTC.
 */
function endDateFor(startISO: string, weeks: number): string {
  return addDaysISO(startISO, Math.max(weeks || 1, 1) * 7 - 1);
}

export default function Cart() {
  const navigate = useNavigate();
  const goBack = useGoBack("/discovery");
  const { items, totalCents, count, setQty, setPeriods, removeItem, clear } = useCart();
  const { isAuthenticated, userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const userUuid = useUserUuid();
  const { btcPrice, convertToSats, isLoading: isPriceLoading } = useBtcPrice();
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const { data: residences = [] } = useResidences();
  const { residence: globalResidence } = useSelectedResidence();

  /**
   * The basket and the checkout are two screens, not one scroll.
   *
   * Everything used to live at `/cart`: the items, the delivery form and the
   * payment method, so "review what I am buying" and "pay for it" were the
   * same page and there was no way back from one to the other. They are two
   * URLs now, which also means the phone's back button walks between them.
   */
  const atCheckout = useLocation().pathname.replace(/\/$/, "").endsWith("/checkout");
  const [step, setStep] = useState<Step>("cart");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");

  // Draft-form state is persisted so a login modal that pops mid-checkout
  // doesn't wipe what the user has already typed. The key is device-local;
  // Cart is single-user per browser so no cross-user contamination risk.
  const DRAFT_KEY = "prospera_cart_checkout_draft";
  const EMPTY_FORM = {
    customer_name: "",
    customer_whatsapp: "",
    residence: "",
    delivery_address: "",
    notes: "",
  };
  const [form, setForm] = useState(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(DRAFT_KEY) : null;
      if (raw) return { ...EMPTY_FORM, ...JSON.parse(raw) };
    } catch { /* ignore corrupt draft */ }
    return EMPTY_FORM;
  });
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* quota / private mode */ }
  }, [form]);

  // Prefilled from the account, editable — and it will not overwrite a number
  // restored from the saved draft above.
  usePhonePrefill(form.customer_whatsapp, (phone) =>
    setForm((f) => ({ ...f, customer_whatsapp: phone })));

  // Same guard the cleaning and food checkouts use. Without it the cart
  // accepted anything non-blank, so a provider could be handed "dwqdwqd" as
  // the number to call about a delivery.
  const [phoneErr, setPhoneErr] = useState("");
  /**
   * The contact card is collapsed by default and opens itself while something
   * required is missing — the same rule as the single-plan checkout, so the two
   * screens behave identically.
   */
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const createdRef = useRef(false);
  /** batch_id of the rows reserved before payment, so we can flip them to paid. */
  const pendingBatchRef = useRef<string | null>(null);

  // Unified Lightning + on-chain invoice generation + polling.
  const inv = useInvoicePayment({
    // Reserve the rows BEFORE the customer pays. Previously the only insert
    // happened after confirmation, so a failure there (RLS, network, a closed
    // tab) meant money taken and no subscription anywhere — with no
    // payment_reference for the reconcile cron to find either. Every other
    // checkout reserves first; the cart and cars were the two that didn't.
    onInvoiceReady: (paymentRef) => { reserveRecords(paymentRef); },
    onPaid: (paymentRef) => { onPaidComplete(paymentRef); },
  });

  // Prefill name + global residence once known.
  useEffect(() => {
    setForm((f) => ({
      ...f,
      customer_name: f.customer_name || userData?.name || userData?.display_name || "",
      residence: f.residence || globalResidence || "",
    }));
  }, [userData, globalResidence]);

  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const totalUsd = centsToDollars(effectiveTotalCents);
  const estimatedSats = convertToSats(totalUsd);
  // A universal-plan line lands in the one table whose user_id is a uuid —
  // see needsUuidUser. Everything else accepts the raw auth id.
  const userIdForRows = userUuid ?? userData?.id ?? "";
  const missingUuid = items.some((i) => needsUuidUser(i.service)) && !isUuid(userIdForRows);

  const formValid =
    form.customer_name.trim()
    && !phoneError(form.customer_whatsapp)
    && form.delivery_address.trim()
    && !missingUuid;

  /** What the Personal data card reports, and what makes it open itself. */
  const missingDetails = !form.customer_name.trim()
    || !form.customer_whatsapp.trim()
    || !form.delivery_address.trim();
  useEffect(() => { if (missingDetails) setDetailsOpen(true); }, [missingDetails]);


  // ─── Create every line's rows after a single payment ──────────────────────
  /**
   * A basket can now hold four services, and each keeps its own table. The
   * shapes live in lib/cart/checkoutRows; this only decides how much of the
   * payment-method fee each line carries and writes the groups.
   */
  /**
   * Minted before payment, not during it: the notification that goes out when
   * the money lands has to be able to name the order, and it is composed at
   * invoice time. Previously it said "Booking ID: Not created yet" because
   * this id did not exist yet.
   */
  const batchIdRef = useRef<string | null>(null);
  const newBatchId = () =>
    (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  const createRecords = async (paymentRef: string, pending = false) => {
    const today = todayHN();
    const batchId = batchIdRef.current ?? newBatchId();

    // The fee is charged once on the cart total but stored per row, so spread
    // it in proportion to each line's price and put the rounding remainder on
    // the last line — the rows then sum to the fee actually charged.
    const totalSurchargeCents = effectiveTotalCents - totalCents;
    let surchargeAssigned = 0;

    // Resolve every line's plan first: the row builder needs what the plan
    // says about itself (how many visits a period includes, what the customer
    // picked inside it) and that is a query, not a lookup.
    const plans = new Map<string, CheckoutPlan>();
    for (const item of items) {
      if (plans.has(item.planId)) continue;
      const resolved = await resolveCheckoutPlan(item.planId);
      if (!resolved) throw new Error(`"${item.planName}" is no longer on sale.`);
      plans.set(item.planId, resolved);
    }

    const byTable = new Map<string, any[]>();
    items.forEach((item, index) => {
      const lineBase = cartLineTotal(item);
      const isLast = index === items.length - 1;
      const lineSurcharge = isLast
        ? totalSurchargeCents - surchargeAssigned
        : (totalCents > 0 ? Math.round((totalSurchargeCents * lineBase) / totalCents) : 0);
      surchargeAssigned += lineSurcharge;

      const rows = buildRows(item, plans.get(item.planId)!, {
        userId: userIdForRows,
        today,
        batchId,
        paid: !pending,
        paymentMethod: paymentMethod,
        paymentReference: paymentRef || null,
        customerName: form.customer_name.trim(),
        customerWhatsapp: form.customer_whatsapp.trim(),
        customerEmail: userData?.email ?? null,
        residence: form.residence.trim() || null,
        address: form.delivery_address.trim() || null,
        notes: form.notes.trim() || null,
        surchargeCents: lineSurcharge,
      });

      const table = CART_TABLES[item.service];
      byTable.set(table, [...(byTable.get(table) ?? []), ...rows]);
    });

    for (const [table, rows] of byTable) {
      const { error } = await supabaseDb.from(table).insert(rows);
      if (error) throw error;
    }
    return batchId;
  };

  /**
   * Write the basket as pending rows the moment the invoice exists. Best-effort:
   * a failure here must not block the customer from paying, but it does mean we
   * fall back to the old insert-after-payment path in `onPaidComplete`.
   */
  const reserveRecords = async (paymentRef: string) => {
    if (pendingBatchRef.current || createdRef.current) return;
    try {
      pendingBatchRef.current = await createRecords(paymentRef, true);
    } catch (e) {
      console.error("Cart: could not reserve pending rows", e);
      pendingBatchRef.current = null;
    }
  };

  const onPaidComplete = async (paymentRef: string, pending = false) => {
    if (createdRef.current) return;
    createdRef.current = true;
    try {
      if (pendingBatchRef.current) {
        // Rows already exist — promote them rather than inserting a second set.
        // Every table the basket touched, because a batch now spans services
        // and each marks "paid" with its own column names.
        const services = Array.from(new Set(items.map((i) => i.service)));
        for (const service of services) {
          const { error } = await supabaseDb
            .from(CART_TABLES[service])
            .update(paidPatch(service, paymentRef))
            .eq("batch_id", pendingBatchRef.current);
          if (error) throw error;
        }
      } else {
        await createRecords(paymentRef, pending);
      }
      setIsPaid(true);
      clear();
      // Cart succeeded — draft has served its purpose, wipe so a fresh cart
      // starts with clean fields (name prefill still runs via useEffect).
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setForm(EMPTY_FORM);
      setStep("success");
    } catch (e: any) {
      createdRef.current = false;
      toast.error(e?.message || "Could not create your orders");
    }
  };

  /** The sticky bar and BottomNav share the bottom strip — never both. */
  const showStickyCheckout = step === "cart" && items.length > 0;
  const showBasketOnly = step === "cart" && !atCheckout;

  /**
   * What this basket actually is, for the payment notification.
   *
   * It used to be the literal string "Food Cart" with no email, no plan and no
   * duration — a leftover from when only food could be added. A $79 cleaning
   * order therefore arrived announced as food, and whoever read it had to go
   * digging. A basket knows all of this about itself.
   */
  const basketMeta = () => {
    const services = [...new Set(items.map((i) => CART_SERVICES[i.service]?.label ?? i.service))];
    const lines = items.map((i) => `${i.planName}${i.qty > 1 ? ` ×${i.qty}` : ""}`);
    const durations = [...new Set(items.map((i) =>
      `${i.periods} ${CART_SERVICES[i.service]?.periodNoun ?? "period"}${i.periods > 1 ? "s" : ""}`))];
    return {
      service_name: services.join(" + ") || "Cart",
      client_name: form.customer_name.trim(),
      client_email: userData?.email ?? undefined,
      client_phone: form.customer_whatsapp.trim(),
      plan_name: lines.join(", "),
      duration: durations.join(" · "),
      booking_id: batchIdRef.current ?? undefined,
      selected_date_time: todayHN(),
      admin_url: `${window.location.origin}/admin/marketplace/subscriptions`,
    };
  };

  const startCheckout = async () => {
    if (!isAuthenticated) { openAuthModal("login", "/cart"); return; }
    if (!formValid || items.length === 0) return;
    createdRef.current = false;
    batchIdRef.current = newBatchId();
    const description = `${[...new Set(items.map((i) => CART_SERVICES[i.service]?.label ?? i.service))].join(" + ")} — ${count} item${count > 1 ? "s" : ""} — ${formatUSD(totalCents)}`;

    if (paymentMethod === "paypal") {
      setStep("pay");
      return;
    }

    if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
    const sats = convertToSats(totalUsd);
    if (sats <= 0) { toast.error("Unable to calculate payment amount."); return; }

    setIsGenerating(true);
    setStep("pay");
    try {
      await inv.start({
        method: paymentMethod === "onchain" ? "onchain" : "lightning",
        amountCents: effectiveTotalCents,
        amountSats: sats,
        description,
        context: "cart",
        externalId: `cart-${batchIdRef.current}`.slice(0, 100),
        meta: basketMeta(),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const backToCart = () => {
    inv.reset();
    setStep("cart");
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-28 md:pb-12">
      <HomeHeader title={atCheckout ? "Checkout" : "Cart"} showBackButton onBack={goBack} />
      <DesktopHeader showBackButton breadcrumb="Cart" />

      <main className={atCheckout
        ? "mx-auto max-w-xl space-y-1 pt-1 pb-[calc(var(--checkout-footer-h,180px)+16px)] md:px-4 md:py-space-6"
        : "app-container space-y-5 py-space-4 md:py-space-6"}>
        {step === "success" ? (
          <CheckoutSuccessPanel
            icon={UtensilsCrossed}
            eyebrow="Payment received"
            amount={<>−{formatUSD(effectiveTotalCents)}</>}
            subtitle={
              <>
                {count} portion{count > 1 ? "s" : ""} confirmed. Track them in My Subscriptions.
              </>
            }
            ctaLabel="Great"
            onCta={() => navigate("/my-subscriptions")}
            secondary={{ label: "Order more", onClick: () => navigate("/services/food") }}
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="mb-4 h-14 w-14 text-muted-foreground/30" />
            <h1 className="text-xl font-black tracking-tight">Your cart is empty</h1>
            <p className="mt-1 text-muted-foreground">Add meal portions and pay for them together.</p>
            <Button onClick={() => navigate("/services/food")} className="mt-5 rounded-full">Browse food</Button>
          </div>
        ) : (
          <>
            {!atCheckout && (
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">Your cart</h1>
            )}

            {/* Items — one card container with row dividers (Yandex Lavka pattern).
                Left: 56px thumbnail tile · middle: name + provider + duration
                chip + qty pill · right: total price + close X. */}
            {atCheckout ? (
              items.map((item) => (
                <CheckoutLineItem
                  key={item.key}
                  title={item.planName}
                  description={`${item.providerName} · ${periodLabel(item)}`}
                  priceCents={cartLineTotal(item)}
                  quantity={item.qty}
                />
              ))
            ) : (
            <section className="overflow-hidden rounded-3xl bg-card divide-y divide-border/60">
              {items.map((item) => {
                const shape = CART_SERVICES[item.service];
                const Icon = SERVICE_ICON[item.service];
                return (
                <div key={item.key} className="flex items-start gap-3 p-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold leading-tight text-foreground">{item.planName}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.providerName} · {formatUSD(item.unitPriceCents)}/{shape.periodNoun === "week" ? "wk" : "mo"}
                          {shape.unitNoun ? ` per ${shape.unitNoun}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        aria-label="Remove item"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* How long — weeks for meals, months for everything else.
                        A service that only sells one length says so instead of
                        offering a select with a single option. */}
                    <div className="mt-2">
                      {shape.periodOptions.length > 1 ? (
                        <Select value={String(item.periods)} onValueChange={(v) => setPeriods(item.key, parseInt(v))}>
                          <SelectTrigger className="h-7 w-auto min-w-[104px] rounded-full border-0 bg-muted/40 px-3 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {shape.periodOptions.map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} {shape.periodNoun}{n === 1 ? "" : "s"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="inline-flex rounded-full bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                          {periodLabel(item)}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      {shape.allowsQuantity ? (
                        <div className="inline-flex items-center rounded-full bg-muted/40">
                          <button
                            type="button"
                            onClick={() => setQty(item.key, item.qty - 1)}
                            aria-label="Decrease"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums text-foreground">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(item.key, item.qty + 1)}
                            aria-label="Increase"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span />
                      )}
                      <p className="text-base font-black tabular-nums text-foreground">
                        {formatUSD(cartLineTotal(item))}
                      </p>
                    </div>

                    {shape.allowsQuantity && shape.unitNoun && (
                      <p className="mt-1 text-xs text-muted-foreground">{quantityLabel(item)}</p>
                    )}
                  </div>
                </div>
                );
              })}
            </section>
            )}

            {/* Summary — the design's Resume once we are at the till. */}
            {!atCheckout && (
            <section className="rounded-2xl bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-foreground">
                  Total ({count} item{count > 1 ? "s" : ""})
                </span>
                <div className="text-right">
                  <span className="text-2xl font-black tabular-nums text-primary">{formatUSD(effectiveTotalCents)}</span>
                  {feePct > 0 && (
                    <p className="text-[10px] text-muted-foreground">Base {formatUSD(totalCents)} + {feePct}% fee</p>
                  )}
                </div>
              </div>
            </section>
            )}

            {step === "cart" && atCheckout && (
              <>
                {/* Delivery details — mobile-first pattern: one card, rows
                    separated by divide-y, borderless inputs. Icon + label
                    left, input value fills the right. Matches iOS Settings /
                    Yandex Lavka form aesthetic. */}
                <PersonalDataCard
                  name={form.customer_name || null}
                  lines={[userData?.email, form.customer_whatsapp, form.residence, form.delivery_address]}
                  open={detailsOpen}
                  onEdit={() => setDetailsOpen((o) => !o)}
                  incomplete={missingDetails}
                >
                  <div className="overflow-hidden rounded-radius-md bg-inset divide-y divide-border/40">
                    {/* Full name */}
                    <div className="flex items-center gap-3 px-4">
                      <UserIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Full name <span className="text-destructive">*</span>
                        </label>
                        <input
                          value={form.customer_name}
                          onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                          placeholder="Your full name"
                          className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>

                    {/* WhatsApp */}
                    <div className="flex items-center gap-3 px-4">
                      <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          WhatsApp <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="tel"
                          inputMode="tel"
                          value={form.customer_whatsapp}
                          onChange={(e) => {
                            setForm((f) => ({ ...f, customer_whatsapp: e.target.value }));
                            if (phoneErr) setPhoneErr("");
                          }}
                          onBlur={() => setPhoneErr(form.customer_whatsapp.trim() ? (phoneError(form.customer_whatsapp) ?? "") : "")}
                          autoComplete="tel"
                          placeholder="+504 1234 5678"
                          className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>
                    {phoneErr && <p className="text-xs text-destructive">{phoneErr}</p>}

                    {/* Residence */}
                    {residences.length > 0 && (
                      <div className="flex items-center gap-3 px-4">
                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Residence
                          </label>
                          <Select value={form.residence || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, residence: v === "_none" ? "" : v }))}>
                            <SelectTrigger className="h-auto w-full justify-between border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground shadow-none focus:ring-0">
                              <SelectValue placeholder="Other / not listed" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Other / not listed</SelectItem>
                              {residences.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Delivery address — saved chips + textarea */}
                    <div className="flex items-start gap-3 px-4 py-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Delivery address <span className="text-destructive">*</span>
                        </label>
                        <LocationPicker
                          userId={userData?.id}
                          value={form.delivery_address}
                          onPick={(line) => setForm((f) => ({ ...f, delivery_address: line }))}
                        />
                        <textarea
                          value={form.delivery_address}
                          onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
                          rows={2}
                          placeholder="Apartment / unit, building, street…"
                          className="w-full resize-none border-0 bg-transparent px-0 py-1 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>

                    {/* Notes — Yandex Eda "Комментарий" pattern: row → sheet */}
                    <NotesField
                      value={form.notes}
                      onChange={(next) => setForm((f) => ({ ...f, notes: next }))}
                      label="Notes"
                      title="Comment"
                      description="Allergies, preferences, anything the kitchen should know."
                      placeholder="What should we know?"
                    />
                  </div>
                </PersonalDataCard>

                {/* The design's order: what you bought, who you are, what it
                    costs, how you pay. The total belongs after the details it
                    can still change — an address can add a delivery fee. */}
                <ResumeCard
                  goodsCents={totalCents}
                  feeCents={Math.max(0, effectiveTotalCents - totalCents)}
                  feeLabel={feePct > 0 ? `Fee · ${feePct}%` : "Fee"}
                  totalCents={effectiveTotalCents}
                  extra={[{ label: "Items", value: String(count) }]}
                />

                <CheckoutCard title="Payment method">
                  <PaymentMethodTiles value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
                </CheckoutCard>
              </>
            )}

            {/* Payment panels */}
            {step === "pay" && paymentMethod === "paypal" && (
              <PayPalPanel
                totalCents={effectiveTotalCents}
                onPaid={(cap) => onPaidComplete(cap)}
                // The same basket the other rails announce. Without it the
                // admin's "payment received" said Not provided five times.
                orderMeta={basketMeta()}
              />
            )}
            {step === "pay" && (inv.state.invoice || inv.state.address) && (
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
                successLabel="Creating your orders…"
              />
            )}

            {step === "pay" && (paymentMethod === "lightning" || paymentMethod === "onchain") && (
              <Button variant="ghost" className="w-full" onClick={backToCart}>Cancel payment</Button>
            )}
          </>
        )}
      </main>

      {/* Sticky checkout bar */}
      {showStickyCheckout && (
        <CheckoutStickyFooter>
          {enabledMethods.length === 0 && (
            <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400">
              Payments are temporarily unavailable. Try again in a few minutes.
            </p>
          )}
          {showBasketOnly ? (
            <Button size="lg" className="h-12 w-full rounded-radius-md text-[16px] font-semibold tracking-[-0.02em]"
              onClick={() => isAuthenticated ? navigate("/cart/checkout") : openAuthModal("login", "/cart/checkout")}>
              {isAuthenticated ? payLabel(totalCents) : "Log in to checkout"}
            </Button>
          ) : (
          <Button size="lg" className="h-12 w-full rounded-radius-md text-[16px] font-semibold tracking-[-0.02em]"
            onClick={startCheckout}
            disabled={
              !formValid ||
              isGenerating ||
              enabledMethods.length === 0 ||
              !enabledMethods.includes(paymentMethod) ||
              ((paymentMethod === "lightning" || paymentMethod === "onchain") && (isPriceLoading || !btcPrice))
            }>
            {isGenerating ? (
              <><Spinner size="sm" className="mr-2" /> Starting…</>
            ) : !isAuthenticated ? (
              "Log in to checkout"
            ) : (
              // Same words as every other pay button. The rail is picked right
              // above this; spelling it out here gave one action four names.
              payLabel(effectiveTotalCents)
            )}
          </Button>
          )}
          {!showBasketOnly && !formValid && (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
              <Check className="h-3 w-3" />
              {missingUuid
                // Rare, and worth saying out loud rather than a dead button:
                // one of the lines needs the account fully set up.
                ? "We're still setting up your account — reload in a moment"
                : "Fill name, WhatsApp and delivery address to continue"}
            </p>
          )}
        </CheckoutStickyFooter>
      )}

      {/* The sticky checkout bar and the bottom nav occupy the same strip, so
          only one may render. This used to test `!isAuthenticated`, which is
          merely correlated with "no sticky bar" — a logged-out user can't
          check out. The consequence was that a signed-in user lost the bottom
          nav on /cart even with an empty basket, on the one page in the app
          that hid it. Test the actual condition instead. */}
      {!showStickyCheckout && <BottomNav />}
    </div>
  );
}
