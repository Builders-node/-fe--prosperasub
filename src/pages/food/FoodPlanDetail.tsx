import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChefHat, UtensilsCrossed, CalendarDays,
  RefreshCw, Check,
  MessageCircle, MapPin, User as UserIcon, CheckCircle2,
  Zap, Wallet, Bitcoin, ShoppingCart,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { CheckoutShell } from "@/components/patterns/CheckoutShell";
import { supabase, supabaseDb, accountApi } from "@/integrations/supabase/client";
import { InvoiceQrPanel } from "@/components/payment/InvoiceQrPanel";
import { useInvoicePayment } from "@/hooks/useInvoicePayment";
import { useAuth } from "@/contexts/AuthContext";
import { LocationPicker } from "@/components/account/SavedLocations";
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
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useCart } from "@/contexts/CartContext";
import { DURATION_OPTIONS, durationLabel } from "@/lib/durations";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";

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
  residence: "",
  delivery_address: "",
  notes: "",
  duration_weeks: 1,
};

type CheckoutMode = "order" | "subscribe";
type PaymentStep = "details" | "pay" | "success";

// ─── Component ────────────────────────────────────────────────────────────────
const FoodPlanDetail = () => {
  const { providerId, planId } = useParams<{ providerId: string; planId: string }>();
  const [searchParams] = useSearchParams();
  const renewSubId = searchParams.get("renew");
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
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const { data: residences = [] } = useResidences();
  const { residence: globalResidence } = useSelectedResidence();
  const { addItem: addToCart } = useCart();
  const [cartDuration, setCartDuration] = useState(1);

  const handleAddToCart = () => {
    if (!plan) return;
    addToCart({
      providerId: plan.provider_id,
      providerName: provider?.name ?? "Restaurant",
      planId: plan.id,
      planName: plan.name,
      unitPriceCents: plan.weekly_price_cents,
      durationWeeks: cartDuration,
      mealsPerDay: plan.meals_per_day ?? 3,
    }, 1);
    toast.success(`Added to cart · ${durationLabel(cartDuration)}`, {
      action: { label: "View cart", onClick: () => navigate("/cart") },
    });
  };
  const [isPaid, setIsPaid] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const mutationCalledRef = useRef(false);

  // Unified Lightning + on-chain invoice generation + polling.
  const inv = useInvoicePayment({
    onPaid: (paymentRef) => {
      setIsPaid(true);
      if (!mutationCalledRef.current) {
        mutationCalledRef.current = true;
        createRecordMutation.mutate({ paymentRef, satsAmount: inv.state.sats ?? 0 });
      }
    },
  });

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

  // Renewal: load the existing subscription so we can prefill + lock its plan.
  const { data: renewSub } = useQuery({
    queryKey: ["food-renew-sub", renewSubId],
    enabled: !!renewSubId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_subscriptions").select("*").eq("id", renewSubId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // When renewing, jump straight into the subscribe checkout, prefilled from the sub.
  useEffect(() => {
    if (!renewSubId || !renewSub || !plan) return;
    setCheckout({
      customer_name: renewSub.customer_name ?? userData?.display_name ?? "",
      customer_whatsapp: renewSub.customer_whatsapp ?? "",
      residence: renewSub.residence ?? "",
      delivery_address: renewSub.delivery_address ?? "",
      notes: renewSub.notes ?? "",
      duration_weeks: renewSub.commitment_weeks || 1,
    });
    setCheckoutMode("subscribe");
    setPaymentStep("details");
    setDialogOpen(true);
  }, [renewSubId, renewSub, plan, userData]);

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
  const effectiveTotalCents = addSurchargeCents(totalCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);
  const totalUsd = centsToDollars(effectiveTotalCents);
  const estimatedSats = convertToSats(totalUsd);
  const mealTypes = plan ? getMealTypesForPlan(plan) : [];
  const mealPhotos = (weeklyMenu?.meals ?? [])
    .map((m) => m.image_url)
    .filter((u): u is string => !!u);
  const checkoutValid =
    checkout.customer_name.trim() &&
    checkout.customer_whatsapp.trim() &&
    checkout.delivery_address.trim();

  // ─── Create record after payment ──────────────────────────────────────────
  // Track the pending row so payment confirmation UPDATEs it in place. Keeps a
  // record if the user closes the tab mid-payment — admin can complete it.
  const pendingRecordIdRef = useRef<string | null>(null);

  const reservePendingRecord = async (): Promise<string | null> => {
    if (!plan || renewSubId) return null; // renewals don't need a pre-created row
    const weekStart = weeklyMenu?.menu.week_start_date ?? currentWeekMonday();
    const methodKey = paymentMethod === "infinita" ? "crypto" : paymentMethod;

    try {
      if (checkoutMode === "order") {
        const payload = {
          user_id: userUuid ?? user!.id,
          provider_id: plan.provider_id,
          meal_plan_id: planId,
          menu_id: weeklyMenu?.menu.id ?? null,
          week_start_date: weekStart,
          total_cents: totalCents,
          duration_weeks: checkout.duration_weeks,
          status: "pending",
          delivery_status: "pending",
          customer_name: checkout.customer_name.trim(),
          customer_whatsapp: checkout.customer_whatsapp.trim(),
          delivery_address: checkout.delivery_address.trim(),
          notes: checkout.notes.trim() || null,
        };
        if (pendingRecordIdRef.current) {
          await supabaseDb.from("food_orders").update(payload).eq("id", pendingRecordIdRef.current);
          return pendingRecordIdRef.current;
        }
        const { data, error } = await supabaseDb.from("food_orders").insert(payload).select("id").single();
        if (error) throw error;
        pendingRecordIdRef.current = data.id as string;
        return data.id as string;
      }
      const payload = {
        user_id: userUuid ?? user!.id,
        provider_id: plan.provider_id,
        meal_plan_id: planId,
        weekly_price_cents: plan.weekly_price_cents,
        commitment_weeks: checkout.duration_weeks,
        status: "pending",
        payment_status: "pending",
        payment_method: methodKey,
        customer_name: checkout.customer_name.trim(),
        customer_whatsapp: checkout.customer_whatsapp.trim(),
        residence: checkout.residence.trim() || null,
        delivery_address: checkout.delivery_address.trim(),
        notes: checkout.notes.trim() || null,
      };
      if (pendingRecordIdRef.current) {
        await supabaseDb.from("food_subscriptions").update(payload).eq("id", pendingRecordIdRef.current);
        return pendingRecordIdRef.current;
      }
      const { data, error } = await supabaseDb.from("food_subscriptions").insert(payload).select("id").single();
      if (error) throw error;
      pendingRecordIdRef.current = data.id as string;
      return data.id as string;
    } catch (e: any) {
      toast.error(e?.message || "Could not reserve record");
      return null;
    }
  };

  const createRecordMutation = useMutation({
    mutationFn: async ({ paymentRef, satsAmount, pending }: { paymentRef: string; satsAmount: number; pending?: boolean }) => {
      const weekStart = weeklyMenu?.menu.week_start_date ?? currentWeekMonday();

      if (checkoutMode === "order") {
        const patch = {
          status: pending ? "pending" : "confirmed",
          delivery_status: "pending",
        };
        if (pendingRecordIdRef.current) {
          const { data, error } = await supabaseDb.from("food_orders")
            .update(patch).eq("id", pendingRecordIdRef.current).select("id").single();
          if (error) throw error;
          return data.id as string;
        }
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
            customer_name: checkout.customer_name.trim(),
            customer_whatsapp: checkout.customer_whatsapp.trim(),
            delivery_address: checkout.delivery_address.trim(),
            notes: checkout.notes.trim() || null,
            ...patch,
          })
          .select("id")
          .single();
        if (error) throw error;
        pendingRecordIdRef.current = data.id as string;
        return data.id as string;
      } else if (renewSubId) {
        // Renewal: payment done → extend the existing subscription's period.
        const { error } = await accountApi(`/account/food/subscriptions/${renewSubId}/renew`, { method: "POST" });
        if (error) throw error;
        return renewSubId;
      } else {
        const patch = {
          status: pending ? "pending" : "active",
          payment_status: pending ? "pending" : "paid",
          payment_method: paymentMethod === "infinita" ? "crypto" : paymentMethod,
          payment_reference: paymentRef || null,
        };
        if (pendingRecordIdRef.current) {
          const { data, error } = await supabaseDb.from("food_subscriptions")
            .update(patch).eq("id", pendingRecordIdRef.current).select("id").single();
          if (error) throw error;
          return data.id as string;
        }
        const { data, error } = await supabaseDb
          .from("food_subscriptions")
          .insert({
            user_id: userUuid ?? user!.id,
            provider_id: plan!.provider_id,
            meal_plan_id: planId,
            weekly_price_cents: plan!.weekly_price_cents,
            commitment_weeks: checkout.duration_weeks,
            customer_name: checkout.customer_name.trim(),
            customer_whatsapp: checkout.customer_whatsapp.trim(),
            residence: checkout.residence.trim() || null,
            delivery_address: checkout.delivery_address.trim(),
            notes: checkout.notes.trim() || null,
            ...patch,
          })
          .select("id")
          .single();
        if (error) throw error;
        pendingRecordIdRef.current = data.id as string;
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

    // Reserve a pending row BEFORE payment. Survives tab-close.
    const reserved = await reservePendingRecord();
    if (!reserved && !renewSubId) { setIsGenerating(false); return; }

    try {
      const label = checkoutMode === "order" ? "Order" : "Subscription";
      const description = `Food ${label} - ${plan.name} - ${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""} - ${formatUSD(totalCents)}`;

      if (paymentMethod === "infinita" || paymentMethod === "paypal") {
        setPaymentStep("pay");
        return;
      }

      if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
      const satsAmount = convertToSats(totalUsd);
      if (satsAmount <= 0) { toast.error("Unable to calculate payment amount."); return; }

      mutationCalledRef.current = false;
      setPaymentStep("pay");
      await inv.start({
        method: paymentMethod === "onchain" ? "onchain" : "lightning",
        amountCents: effectiveTotalCents,
        amountSats: satsAmount,
        description,
        context: `food_${checkoutMode}`,
        externalId: `food-${checkoutMode}-${planId}-${Date.now()}`.slice(0, 100),
        meta: {
          service_name: `Food ${label}`,
          client_name: checkout.customer_name.trim(),
          client_phone: checkout.customer_whatsapp.trim(),
          plan_name: plan.name,
          duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
          admin_url: `${window.location.origin}/admin/food/subscriptions`,
        },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInfinitaPaid = (paymentId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      // SimpleFi confirms the payment via status check → create the order as paid.
      createRecordMutation.mutate({ paymentRef: paymentId, satsAmount: 0, pending: false });
    }
  };

  const handlePaypalPaid = (captureId: string) => {
    setIsPaid(true);
    if (!mutationCalledRef.current) {
      mutationCalledRef.current = true;
      createRecordMutation.mutate({ paymentRef: captureId, satsAmount: 0 });
    }
  };

  // ─── Dialog open handlers ─────────────────────────────────────────────────
  const openCheckout = (mode: CheckoutMode) => {
    if (!isAuthenticated) { openAuthModal(); return; }
    setCheckoutMode(mode);
    setPaymentStep("details");
    inv.reset();
    setIsPaid(false);
    setCreatedId(null);
    mutationCalledRef.current = false;
    setCheckout({
      customer_name: userData?.name ?? "",
      customer_whatsapp: "",
      residence: globalResidence || "",
      delivery_address: "",
      notes: "",
      duration_weeks: mode === "subscribe" ? 4 : 1,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    inv.reset();
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
            <div className="overflow-hidden rounded-3xl bg-card">
              {/* Dish photo hero */}
              <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-orange-500/25 via-amber-500/10 to-transparent md:h-52">
                {mealPhotos.length > 0 ? (
                  <img src={mealPhotos[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <UtensilsCrossed className="h-16 w-16 text-muted-foreground/15" />
                  </div>
                )}
                {mealPhotos.length > 1 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-bold text-foreground backdrop-blur-sm">
                    {mealPhotos.length} dishes
                  </span>
                )}
              </div>

              <div className="p-5 md:p-7">
                {provider && (
                  <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">
                    <ChefHat className="h-3 w-3" /> {provider.name}
                  </p>
                )}
                <h1 className="mt-1 text-2xl font-black leading-tight tracking-tight text-foreground md:text-3xl">
                  {plan.name}
                </h1>
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

                <div className="mt-5 flex items-baseline gap-1 border-t border-border/60 pt-4">
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
            <Check className="h-3.5 w-3.5 text-primary" />
            {formatUSD(plan.weekly_price_cents)} / week · Pay with Lightning
          </div>
          <div className="flex gap-2">
            <Select value={String(cartDuration)} onValueChange={(v) => setCartDuration(parseInt(v))}>
              <SelectTrigger className="h-14 w-[116px] shrink-0 rounded-2xl font-semibold" aria-label="Duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d.weeks} value={String(d.weeks)}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="lg"
              variant="outline"
              className="h-14 shrink-0 rounded-2xl px-4 font-bold"
              onClick={handleAddToCart}
              aria-label="Add to cart"
            >
              <ShoppingCart className="h-5 w-5" />
            </Button>
            <Button
              size="lg"
              className="h-14 flex-1 rounded-2xl font-bold text-base"
              onClick={() => openCheckout("subscribe")}
            >
              <Zap className="mr-2 h-5 w-5" />
              Subscribe
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Add multiple portions to your cart and pay together
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
            ? paymentMethod === "infinita" ? "Pay with LIVES"
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
                    <>Pay {formatUSD(effectiveTotalCents)} with LIVES</>
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
              {renewSubId ? (
                /* Renewal: duration is fixed to the original subscription term. */
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm">
                  <p className="font-bold text-foreground">Renewing your subscription</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""} · continues from your current period.
                  </p>
                </div>
              ) : (
                /* Duration selector */
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
              )}

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
                    <span className="font-black text-orange-400">{formatUSD(effectiveTotalCents)}</span>
                    {feePct > 0 && (
                      <p className="text-[10px] text-muted-foreground">Base {formatUSD(totalCents)} + {feePct}% fee</p>
                    )}
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
                {residences.length > 0 && (
                  <div>
                    <Label className="mb-1.5 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Residence
                    </Label>
                    <Select value={checkout.residence || "_none"}
                      onValueChange={(v) => setCheckout((f) => ({ ...f, residence: v === "_none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select your residence" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Other / not listed</SelectItem>
                        {residences.map((r) => (
                          <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="mb-1.5 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Apartment / Address *
                  </Label>
                  <LocationPicker userId={userData?.id} onPick={(line) => setCheckout((f) => ({ ...f, delivery_address: line }))} />
                  <Textarea value={checkout.delivery_address}
                    onChange={(e) => setCheckout((f) => ({ ...f, delivery_address: e.target.value }))}
                    rows={2} placeholder="Apartment / unit, building, details…" />
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
              totalCents={effectiveTotalCents}
              onPaid={handleInfinitaPaid}
              orderMeta={{
                description: `Food ${checkoutMode === "order" ? "Order" : "Subscription"} - ${plan.name}`,
                service_name: `Food ${checkoutMode === "order" ? "Order" : "Subscription"}`,
                client_name: checkout.customer_name.trim(),
                client_phone: checkout.customer_whatsapp.trim(),
                plan_name: plan.name,
                duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
                admin_url: `${window.location.origin}/admin/food/subscriptions`,
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
                totalCents={effectiveTotalCents}
                onPaid={handlePaypalPaid}
                orderMeta={{
                  description: `Food ${checkoutMode === "order" ? "Order" : "Subscription"} - ${plan.name}`,
                  service_name: `Food ${checkoutMode === "order" ? "Order" : "Subscription"}`,
                  client_name: checkout.customer_name.trim(),
                  client_phone: checkout.customer_whatsapp.trim(),
                  plan_name: plan.name,
                  duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
                  admin_url: `${window.location.origin}/admin/food/subscriptions`,
                }}
              />
            )
          )}

          {paymentStep === "pay" && (inv.state.invoice || inv.state.address) && (
            <InvoiceQrPanel
              mode={inv.state.invoice ? "lightning" : "onchain"}
              invoice={inv.state.invoice}
              address={inv.state.address}
              uri={inv.state.uri}
              sats={inv.state.sats ?? 0}
              totalCents={effectiveTotalCents}
              isPaid={isPaid}
              successLabel={`Creating ${checkoutMode === "order" ? "order" : "subscription"}…`}
            />
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
                      : `${(inv.state.sats ?? 0).toLocaleString()} sats (${formatUSD(totalCents)})`}
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
