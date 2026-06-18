import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChefHat, UtensilsCrossed, CalendarDays,
  RefreshCw, Check,
  MessageCircle, MapPin, User as UserIcon, CheckCircle2,
  Zap, Copy, Wallet, Bitcoin,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { CheckoutShell } from "@/components/patterns/CheckoutShell";
import { QRCodeSVG } from "qrcode.react";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { getMealTypesForPlan, formatWeekLabel } from "@/lib/foodUtils";
import { WeeklyMenuDisplay } from "@/components/food/WeeklyMenuDisplay";
import type { FoodProvider, FoodMealPlan, FoodWeeklyMenu, FoodMenuMeal } from "@/types/food";
import { MEAL_TYPE_LABELS } from "@/types/food";
import { toast } from "sonner";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";

// ─── Duration options ─────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { weeks: 1, label: "1 Week" },
  { weeks: 2, label: "2 Weeks" },
  { weeks: 3, label: "3 Weeks" },
  { weeks: 4, label: "1 Month" },
] as const;

function currentWeekMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

// ─── Checkout state ───────────────────────────────────────────────────────────
const EMPTY_CHECKOUT = {
  customer_name: "",
  customer_whatsapp: "",
  delivery_address: "",
  notes: "",
  duration_weeks: 1,
};

type CheckoutMode = "order" | "subscribe";
type PaymentStep = "details" | "pay" | "success";

// ─── Component ────────────────────────────────────────────────────────────────
const FoodPlanDetail = () => {
  const { providerId, planId } = useParams<{ providerId: string; planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, userData, isAuthenticated } = useAuth();
  const userUuid = useUserUuid();
  const { openAuthModal } = useAuthModal();
  const { btcPrice, convertToSats, refreshPrice, isLoading: isPriceLoading } = useBtcPrice();
  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>("order");
  const [paymentStep, setPaymentStep] = useState<PaymentStep>("details");
  const [checkout, setCheckout] = useState({ ...EMPTY_CHECKOUT });

  // ─── Payment state ────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const { enabled: enabledMethods } = usePaymentMethods();
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [lockedSatsAmount, setLockedSatsAmount] = useState<number | null>(null);
  const [onchainAddress, setOnchainAddress] = useState<string | null>(null);
  const [onchainUri, setOnchainUri] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutationCalledRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Keep the selected method valid as toggles load.
  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) {
      setPaymentMethod(enabledMethods[0]);
    }
  }, [enabledMethods, paymentMethod]);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: provider } = useQuery({
    queryKey: ["food-provider", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_providers").select("*").eq("id", providerId!).single();
      if (error) throw error;
      return data as FoodProvider;
    },
    enabled: !!providerId,
  });

  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ["food-meal-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans").select("*").eq("id", planId!).single();
      if (error) throw error;
      return data as FoodMealPlan;
    },
    enabled: !!planId,
  });

  const { data: weeklyMenu, isLoading: loadingMenu } = useQuery({
    queryKey: ["food-plan-menu", planId, plan?.provider_id],
    queryFn: async () => {
      const { data: planMenus } = await supabaseDb
        .from("food_weekly_menus").select("*")
        .eq("meal_plan_id", planId!)
        .eq("is_published", true)
        .order("week_start_date", { ascending: false })
        .limit(1);

      let menu: FoodWeeklyMenu | null = planMenus?.[0] ?? null;

      if (!menu) {
        const { data: providerMenus } = await supabaseDb
          .from("food_weekly_menus").select("*")
          .eq("provider_id", plan!.provider_id)
          .is("meal_plan_id", null)
          .eq("is_published", true)
          .order("week_start_date", { ascending: false })
          .limit(1);
        menu = providerMenus?.[0] ?? null;
      }

      if (!menu) return null;

      const { data: meals } = await supabaseDb
        .from("food_menu_meals").select("*")
        .eq("menu_id", menu.id)
        .order("sort_order", { ascending: true });

      return { menu, meals: (meals ?? []) as FoodMenuMeal[] };
    },
    enabled: !!planId && !!plan,
  });

  // ─── Derived ──────────────────────────────────────────────────────────────
  const totalCents = (plan?.weekly_price_cents ?? 0) * checkout.duration_weeks;
  const totalUsd = centsToDollars(totalCents);
  const estimatedSats = convertToSats(totalUsd);
  const mealTypes = plan ? getMealTypesForPlan(plan) : [];
  const checkoutValid =
    checkout.customer_name.trim() &&
    checkout.customer_whatsapp.trim() &&
    checkout.delivery_address.trim();

  // ─── Create record after payment ──────────────────────────────────────────
  const createRecordMutation = useMutation({
    mutationFn: async ({ paymentRef, satsAmount, pending }: { paymentRef: string; satsAmount: number; pending?: boolean }) => {
      const weekStart = weeklyMenu?.menu.week_start_date ?? currentWeekMonday();

      if (checkoutMode === "order") {
        const { data, error } = await supabaseDb
          .from("food_orders")
          .insert({
            user_id: userUuid ?? user!.id,
            provider_id: plan!.provider_id,
            meal_plan_id: planId,
            menu_id: weeklyMenu?.menu.id ?? null,
            week_start_date: weekStart,
            total_cents: totalCents,
            duration_weeks: checkout.duration_weeks,
            // Infinita payments await manual admin confirmation, so the order
            // stays "pending" until an admin verifies the transaction.
            status: pending ? "pending" : "confirmed",
            delivery_status: "pending",
            customer_name: checkout.customer_name.trim(),
            customer_whatsapp: checkout.customer_whatsapp.trim(),
            delivery_address: checkout.delivery_address.trim(),
            notes: checkout.notes.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      } else {
        const { data, error } = await supabaseDb
          .from("food_subscriptions")
          .insert({
            user_id: userUuid ?? user!.id,
            provider_id: plan!.provider_id,
            meal_plan_id: planId,
            weekly_price_cents: plan!.weekly_price_cents,
            commitment_weeks: checkout.duration_weeks,
            // Infinita payments await manual admin confirmation.
            status: pending ? "pending" : "active",
            customer_name: checkout.customer_name.trim(),
            customer_whatsapp: checkout.customer_whatsapp.trim(),
            delivery_address: checkout.delivery_address.trim(),
            notes: checkout.notes.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["my-food-subscriptions"] });
      setCreatedId(id);
      setPaymentStep("success");
    },
    onError: (e) => toast.error(String(e)),
  });

  // ─── Invoice & polling ────────────────────────────────────────────────────
  const generateInvoice = async () => {
    if (!plan || !checkoutValid) return;

    setIsGenerating(true);

    try {
      const label = checkoutMode === "order" ? "Order" : "Subscription";
      const description = `Food ${label} - ${plan.name} - ${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""} - ${formatUSD(totalCents)}`;

      if (paymentMethod === "infinita" || paymentMethod === "paypal") {
        setPaymentStep("pay");
        setIsGenerating(false);
        return;
      } else if (paymentMethod === "onchain") {
        if (!btcPrice) { toast.error("BTC price not loaded yet."); setIsGenerating(false); return; }
        const satsAmount = convertToSats(totalUsd);
        if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); setIsGenerating(false); return; }
        setLockedSatsAmount(satsAmount);

        const { data, error } = await supabase.functions.invoke("create-onchain-charge", {
          body: {
            amount_sats: satsAmount,
            amount_cents: totalCents,
            description,
            service_name: `Food ${label}`,
            client_name: checkout.customer_name.trim(),
            client_phone: checkout.customer_whatsapp.trim(),
            plan_name: plan.name,
            duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
            admin_url: `${window.location.origin}/admin/food/orders`,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.address) throw new Error("Could not generate a Bitcoin address.");

        setOnchainAddress(data.address);
        setOnchainUri(`bitcoin:${data.address}?amount=${(satsAmount / 1e8).toFixed(8)}&label=ProsperaSub&message=${encodeURIComponent(description)}`);
        setPaymentStep("pay");
        startOnchainPolling(data.address, satsAmount);
      } else {
        if (!btcPrice) { toast.error("BTC price not loaded yet."); setIsGenerating(false); return; }
        const satsAmount = convertToSats(totalUsd);
        if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); setIsGenerating(false); return; }
        setLockedSatsAmount(satsAmount);

        const { data, error } = await supabase.functions.invoke("create-invoice", {
          body: {
            amount_cents: totalCents,
            amount_sats: satsAmount,
            context: `food_${checkoutMode}`,
            description,
            service_name: `Food ${label}`,
            client_name: checkout.customer_name.trim(),
            client_phone: checkout.customer_whatsapp.trim(),
            plan_name: plan.name,
            duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
            admin_url: `${window.location.origin}/admin/food/orders`,
            external_id: `food-${checkoutMode}-${planId}-${Date.now()}`.slice(0, 100),
          },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        setInvoice(data.payment_request);
        setPaymentHash(data.payment_hash);
        setPaymentStep("pay");
        startLightningPolling(data.payment_hash, satsAmount);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invoice");
      setLockedSatsAmount(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const startLightningPolling = (hash: string, satsAmount: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    mutationCalledRef.current = false;

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: { payment_hash: hash },
        });
        if (error) return;
        if (data.paid && !mutationCalledRef.current) {
          mutationCalledRef.current = true;
          setIsPaid(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          createRecordMutation.mutate({ paymentRef: hash, satsAmount });
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
          createRecordMutation.mutate({ paymentRef: address, satsAmount });
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
      // Infinita payments are confirmed manually by an admin — create the order
      // as pending. (Food subscriptions have no pending state, so they are
      // created normally and verified from the payment reference.)
      createRecordMutation.mutate({ paymentRef: txHash, satsAmount: 0, pending: true });
    }
  };

  const handlePaypalPaid = (captureId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createRecordMutation.mutate({ paymentRef: captureId, satsAmount: 0 });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  // ─── Dialog open handlers ─────────────────────────────────────────────────
  const openCheckout = (mode: CheckoutMode) => {
    if (!isAuthenticated) { openAuthModal(); return; }
    setCheckoutMode(mode);
    setPaymentStep("details");
    setInvoice(null);
    setPaymentHash(null);
    setLockedSatsAmount(null);
    setOnchainAddress(null);
    setOnchainUri(null);
    setIsPaid(false);
    setCreatedId(null);
    mutationCalledRef.current = false;
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setCheckout({
      customer_name: userData?.name ?? "",
      customer_whatsapp: "",
      delivery_address: "",
      notes: "",
      duration_weeks: mode === "subscribe" ? 4 : 1,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setDialogOpen(false);
  };

  // ─── Loading / 404 ────────────────────────────────────────────────────────
  if (loadingPlan) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Meal Plan" showBackButton onBack={() => navigate(`/food/${providerId}`)} />
        <DesktopHeader />
        <main className="market-content py-space-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Meal Plan" showBackButton onBack={() => navigate(`/food/${providerId}`)} />
        <DesktopHeader />
        <main className="market-content flex flex-col items-center justify-center py-16">
          <ChefHat className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold">Plan not found</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-36 md:pb-32">
      <HomeHeader title={plan.name} showBackButton onBack={() => navigate(`/food/${providerId}`)} />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-12">
        <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-8 xl:grid-cols-[420px_1fr]">

          {/* Left column — Plan info (sticky on desktop) */}
          <section className="lg:sticky lg:top-20 lg:self-start">
            <div className="p-6 md:p-8">
              {provider && <p className="mb-2 text-sm text-muted-foreground">{provider.name}</p>}
              <h1 className="text-page-title">{plan.name}</h1>
              {plan.description && (
                <p className="mt-2 text-body text-muted-foreground">{plan.description}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                  <UtensilsCrossed className="h-3.5 w-3.5" /> {plan.meals_per_day} meals/day
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> {plan.days_per_week} days/week
                </span>
                {mealTypes.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-400">
                    {MEAL_TYPE_LABELS[t]}
                  </span>
                ))}
              </div>

              {plan.highlights && plan.highlights.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
                  {plan.highlights.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-orange-400" /> {h}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-black tabular-nums text-foreground">
                  {formatUSD(plan.weekly_price_cents)}
                </span>
                <span className="text-sm text-muted-foreground">/ week</span>
                {btcPrice && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    ≈ {convertToSats(centsToDollars(plan.weekly_price_cents)).toLocaleString()} sats
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Right column — This week's menu */}
          <section className="mt-space-8 lg:mt-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-tight">This Week&apos;s Menu</h2>
              {weeklyMenu && (
                <Badge className="rounded-full bg-green-500/15 text-green-400">
                  Week of {formatWeekLabel(weeklyMenu.menu.week_start_date)}
                </Badge>
              )}
            </div>
            {loadingMenu ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
              </div>
            ) : (
              <WeeklyMenuDisplay
                meals={weeklyMenu?.meals ?? []}
                mealTypes={mealTypes}
                weekStartDate={weeklyMenu?.menu.week_start_date ?? ""}
                showEmptyDays={false}
              />
            )}
          </section>

        </div>
      </main>

      {/* ─── Sticky bottom bar (Yandex Прокат style — matches CarDetail) ─── */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-background border-t border-border/40 md:left-[var(--sidebar-width,0px)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="market-content px-4 py-3">
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            {formatUSD(plan.weekly_price_cents)} / week · Pay with Lightning
          </div>
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl font-bold text-base"
            onClick={() => openCheckout("subscribe")}
          >
            <Zap className="mr-2 h-5 w-5" />
            Subscribe Weekly
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Confirm in the next step
          </p>
        </div>
      </div>

      {/* ─── Unified checkout — full page via shared CheckoutShell ────────── */}
      <CheckoutShell
        open={dialogOpen}
        onClose={closeDialog}
        title={
          paymentStep === "success"
            ? "Payment Confirmed!"
            : paymentStep === "pay"
            ? paymentMethod === "infinita" ? "Pay with Infinita"
              : paymentMethod === "paypal" ? "Pay with PayPal"
              : paymentMethod === "onchain" ? "Pay on-chain (Bitcoin)"
              : "Pay with Lightning"
            : "Subscribe to Meal Plan"
        }
        footer={
          paymentStep === "details" && plan ? (
            <div className="space-y-2">
              {paymentMethod === "infinita" ? (
                <Button
                  className="w-full h-14 rounded-2xl font-bold text-base"
                  onClick={generateInvoice}
                  disabled={!checkoutValid || isGenerating}
                >
                  {isGenerating ? (
                    <><Spinner size="sm" className="mr-2" /> Creating…</>
                  ) : (
                    <>Pay {formatUSD(totalCents)} with Infinita</>
                  )}
                </Button>
              ) : paymentMethod === "paypal" ? (
                <Button
                  className="w-full h-14 rounded-2xl bg-[#0070ba] text-white hover:bg-[#0070ba]/90 font-bold text-base"
                  onClick={generateInvoice}
                  disabled={!checkoutValid}
                >
                  Continue with PayPal
                </Button>
              ) : (
                <Button
                  className="w-full h-14 rounded-2xl font-bold text-base"
                  onClick={generateInvoice}
                  disabled={!checkoutValid || isGenerating || isPriceLoading || !btcPrice}
                >
                  {isGenerating ? (
                    <><Spinner size="sm" className="mr-2" /> {paymentMethod === "onchain" ? "Generating address…" : "Generating…"}</>
                  ) : paymentMethod === "onchain" ? (
                    <><Bitcoin className="mr-2 h-5 w-5" /> Pay {estimatedSats.toLocaleString()} sats on-chain</>
                  ) : (
                    <><Zap className="mr-2 h-5 w-5" /> Pay {estimatedSats.toLocaleString()} sats</>
                  )}
                </Button>
              )}
            </div>
          ) : undefined
        }
      >

          {/* ── Step 1: Details ──────────────────────────────────────────── */}
          {paymentStep === "details" && plan && (
            <div className="space-y-5">
              {/* Duration selector */}
              <div>
                <Label className="mb-2 block">
                  {checkoutMode === "order" ? "Duration" : "Subscription Period"}
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map(({ weeks, label }) => (
                    <button key={weeks} type="button"
                      onClick={() => setCheckout((f) => ({ ...f, duration_weeks: weeks }))}
                      className={`rounded-xl border py-3 text-center text-sm font-bold transition-all ${
                        checkout.duration_weeks === weeks
                          ? "border-orange-500 bg-orange-500/15 text-orange-400"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-orange-500/50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl bg-muted/50 p-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restaurant</span>
                  <span>{provider?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {formatUSD(plan.weekly_price_cents)} × {checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""}
                  </span>
                  <span>{formatUSD(totalCents)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <span className="font-bold">Total</span>
                  <div className="text-right">
                    <span className="font-black text-orange-400">{formatUSD(totalCents)}</span>
                    {btcPrice && (
                      <p className="text-xs text-muted-foreground">
                        ≈ {estimatedSats.toLocaleString()} sats
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact details — grouped (bordered section, matches admin forms) */}
              <section className="space-y-4 rounded-2xl border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delivery details</p>
                <div>
                  <Label className="mb-1.5 flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5" /> Full Name *
                  </Label>
                  <Input value={checkout.customer_name}
                    onChange={(e) => setCheckout((f) => ({ ...f, customer_name: e.target.value }))}
                    placeholder="Your full name" />
                </div>
                <div>
                  <Label className="mb-1.5 flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Number *
                  </Label>
                  <Input value={checkout.customer_whatsapp}
                    onChange={(e) => setCheckout((f) => ({ ...f, customer_whatsapp: e.target.value }))}
                    placeholder="+504 1234 5678" type="tel" />
                </div>
                <div>
                  <Label className="mb-1.5 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Delivery Address *
                  </Label>
                  <Textarea value={checkout.delivery_address}
                    onChange={(e) => setCheckout((f) => ({ ...f, delivery_address: e.target.value }))}
                    rows={2} placeholder="Building, apartment, street…" />
                </div>
                <div>
                  <Label className="mb-1.5 block">Notes (optional)</Label>
                  <Textarea value={checkout.notes}
                    onChange={(e) => setCheckout((f) => ({ ...f, notes: e.target.value }))}
                    rows={2} placeholder="Allergies, preferences…" />
                </div>
              </section>

              <div>
                <h2 className="mb-2 text-xl font-black tracking-tight text-foreground">Payment method</h2>
                <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
              </div>

              {(paymentMethod === "lightning" || paymentMethod === "onchain") && btcPrice && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>1 BTC = ${btcPrice.toLocaleString()}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={refreshPrice}>
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
              )}
              {paymentMethod === "onchain" && (
                <p className="px-1 text-xs text-muted-foreground">On-chain Bitcoin — confirmation can take a few minutes.</p>
              )}

            </div>
          )}

          {/* ── Step 2: Payment ──────────────────────────────────────── */}
          {paymentStep === "pay" && paymentMethod === "infinita" && (
            <InfinitaPaymentPanel
              totalCents={totalCents}
              onPaid={handleInfinitaPaid}
              orderMeta={{
                description: `Food ${checkoutMode === "order" ? "Order" : "Subscription"} - ${plan.name}`,
                service_name: `Food ${checkoutMode === "order" ? "Order" : "Subscription"}`,
                client_name: checkout.customer_name.trim(),
                client_phone: checkout.customer_whatsapp.trim(),
                plan_name: plan.name,
                duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
                admin_url: `${window.location.origin}/admin/food/orders`,
              }}
            />
          )}

          {paymentStep === "pay" && paymentMethod === "paypal" && (
            isPaid ? (
              <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-sm font-semibold text-green-400">
                  Payment received! Creating {checkoutMode === "order" ? "order" : "subscription"}…
                </span>
              </div>
            ) : (
              <PayPalPanel
                totalCents={totalCents}
                onPaid={handlePaypalPaid}
                orderMeta={{
                  description: `Food ${checkoutMode === "order" ? "Order" : "Subscription"} - ${plan.name}`,
                  service_name: `Food ${checkoutMode === "order" ? "Order" : "Subscription"}`,
                  client_name: checkout.customer_name.trim(),
                  client_phone: checkout.customer_whatsapp.trim(),
                  plan_name: plan.name,
                  duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
                  admin_url: `${window.location.origin}/admin/food/orders`,
                }}
              />
            )
          )}

          {paymentStep === "pay" && paymentMethod === "lightning" && invoice && (
            <div className="space-y-4">
              <a
                href={`lightning:${invoice}`}
                className="flex justify-center p-4 bg-white rounded-xl cursor-pointer"
              >
                <QRCodeSVG value={invoice!} size={220} level="M" />
              </a>

              <div className="text-center p-4 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Amount Due</p>
                <p className="text-3xl font-black text-amber-400">
                  {(lockedSatsAmount || 0).toLocaleString()} sats
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatUSD(totalCents)} · {checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Lightning Invoice</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 p-2.5 bg-muted rounded-lg text-xs break-all max-h-16 overflow-y-auto leading-relaxed">
                    {invoice}
                  </code>
                  <Button variant="secondary" size="icon" className="shrink-0"
                    onClick={() => copyToClipboard(invoice!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className={`flex items-center justify-center gap-2 p-4 rounded-xl ${
                isPaid ? "bg-green-500/10" : "bg-amber-500/10"
              }`}>
                {isPaid ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-semibold text-green-400">
                      Payment received! Creating {checkoutMode === "order" ? "order" : "subscription"}…
                    </span>
                  </>
                ) : (
                  <>
                    <Spinner size="md" className="text-amber-400" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Waiting for payment…
                    </span>
                  </>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground">
                Scan the QR code with any Lightning wallet or tap it to open your wallet app.
              </p>
            </div>
          )}

          {paymentStep === "pay" && paymentMethod === "onchain" && onchainAddress && (
            <div className="space-y-4">
              <a
                href={onchainUri ?? `bitcoin:${onchainAddress}`}
                className="flex justify-center p-4 bg-white rounded-xl cursor-pointer"
              >
                <QRCodeSVG value={onchainUri ?? `bitcoin:${onchainAddress}`} size={220} level="M" />
              </a>

              <div className="text-center p-4 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Send exactly</p>
                <p className="text-3xl font-black text-amber-400">{(lockedSatsAmount || 0).toLocaleString()} sats</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatUSD(totalCents)} · {checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Bitcoin Address</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 p-2.5 bg-muted rounded-lg text-xs break-all leading-relaxed">{onchainAddress}</code>
                  <Button variant="secondary" size="icon" className="shrink-0" onClick={() => copyToClipboard(onchainAddress!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className={`flex items-center justify-center gap-2 p-4 rounded-xl ${isPaid ? "bg-green-500/10" : "bg-amber-500/10"}`}>
                {isPaid ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-semibold text-green-400">
                      Payment detected! Creating {checkoutMode === "order" ? "order" : "subscription"}…
                    </span>
                  </>
                ) : (
                  <>
                    <Spinner size="md" className="text-amber-400" />
                    <span className="text-sm font-medium text-muted-foreground">Waiting for payment… on-chain can take a few minutes.</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Success ──────────────────────────────────────────── */}
          {paymentStep === "success" && (
            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="rounded-full bg-green-500/15 p-4">
                <CheckCircle2 className="h-12 w-12 text-green-400" />
              </div>

              <div>
                <h3 className="text-lg font-black text-foreground">
                  {paymentMethod === "infinita"
                    ? "Payment Submitted!"
                    : checkoutMode === "order"
                    ? "Order Confirmed!"
                    : "Subscription Started!"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                  {paymentMethod === "infinita"
                    ? "An admin will verify your transaction and confirm your payment. We'll contact you on WhatsApp."
                    : checkoutMode === "order"
                    ? "Your order is confirmed and paid. We'll contact you on WhatsApp to arrange delivery."
                    : "Your weekly subscription is now active. We'll send weekly confirmations and delivery updates via WhatsApp."}
                </p>
              </div>

              {createdId && (
                <div className="rounded-lg bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
                  Reference: <span className="font-mono font-bold text-foreground">
                    {createdId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="rounded-xl bg-muted/50 p-4 w-full space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{paymentMethod === "infinita" ? "Amount" : "Paid"}</span>
                  <span className="font-bold text-green-400">
                    {paymentMethod === "infinita"
                      ? formatUSD(totalCents)
                      : `${(lockedSatsAmount ?? 0).toLocaleString()} sats (${formatUSD(totalCents)})`}
                  </span>
                </div>
              </div>

              <Button className="w-full rounded-full" onClick={() => { closeDialog(); navigate("/my-subscriptions?tab=food"); }}>
                View My Bookings
              </Button>
            </div>
          )}
      </CheckoutShell>
    </div>
  );
};

export default FoodPlanDetail;
