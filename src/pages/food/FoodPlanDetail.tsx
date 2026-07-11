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
import { NotesField } from "@/components/patterns/NotesField";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { ChevronRight as ChevronRightIcon } from "lucide-react";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { getMealTypesForPlan, formatWeekLabel } from "@/lib/foodUtils";
import { MyRationView } from "@/components/food/MyRationView";
import { MealSelectionPicker, defaultMealsForCount, type MealKey } from "@/components/food/MealSelectionPicker";
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
// start_date is the day meal deliveries kick off; end_date = start + weeks*7 - 1
// (inclusive). Default is today ("start immediately").
const EMPTY_CHECKOUT = {
  customer_name: "",
  customer_whatsapp: "",
  residence: "",
  delivery_address: "",
  notes: "",
  duration_weeks: 1,
  start_date: "" as string, // ISO YYYY-MM-DD; filled in lazily to today's HN date
};

/** Add N days to an ISO date-only string. */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today in Honduras timezone as YYYY-MM-DD. */
function todayHnIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" });
}

/** Next occurrence of the target weekday (0=Sun … 6=Sat) starting from `after`.
 *  If today IS Monday, "next Monday" is 7 days from now — never today. */
function nextWeekdayIso(after: string, targetDow: number): string {
  const d = new Date(`${after}T00:00:00`);
  const cur = d.getDay();
  const delta = ((targetDow - cur + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

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
  // Meal selection lives outside the flat checkout object because its length
  // is coupled to the plan (not user-editable text): easier to reset when the
  // plan loads. Initialised empty so the customer must actively pick — unless
  // the plan is 3-meal, in which case the picker auto-locks all three.
  const [selectedMeals, setSelectedMeals] = useState<MealKey[]>([]);

  // ─── Payment state ────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const { data: residences = [] } = useResidences();
  const { residence: globalResidence } = useSelectedResidence();
  const { addItem: addToCart } = useCart();
  const [cartDuration, setCartDuration] = useState(1);
  // Button-level "Added ✓" confirmation that lives on the button itself, so
  // even if the toast is missed the user sees clearly the tap succeeded.
  const [justAdded, setJustAdded] = useState(false);

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
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
    toast.success(`Added to cart · ${durationLabel(cartDuration)}`, {
      action: { label: "View cart", onClick: () => navigate("/cart") },
    });
  };
  const [isPaid, setIsPaid] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const mutationCalledRef = useRef(false);
  // Stable idempotency key for this checkout attempt — reused across polling
  // retries so a duplicate call to /renew returns the same outcome.
  const renewIdempotencyKeyRef = useRef<string | null>(null);

  // Unified Lightning + on-chain invoice generation + polling.
  const inv = useInvoicePayment({
    onPaid: (paymentRef) => {
      setIsPaid(true);
      if (!mutationCalledRef.current) {
        mutationCalledRef.current = true;
        createRecordMutation.mutate({ paymentRef, satsAmount: inv.state.sats ?? 0 });
      }
    },
    // Persist the invoice ref onto the pending row the instant it exists.
    // If the tab dies before onPaid, the server reconcile cron can still
    // verify with Blink and mark the sub paid + active.
    onInvoiceReady: (paymentRef, method) => {
      const id = pendingRecordIdRef.current;
      if (!id || checkoutMode !== "subscribe" || renewSubId) return;
      void supabaseDb.from("food_subscriptions")
        .update({ payment_reference: paymentRef, payment_method: method })
        .eq("id", id);
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
    // Renewal: carry the existing sub's meal selection forward. If the DB row
    // is missing selected_meals (very old data), fall back to the plan default.
    setSelectedMeals(
      Array.isArray(renewSub.selected_meals) && renewSub.selected_meals.length > 0
        ? (renewSub.selected_meals as MealKey[])
        : defaultMealsForCount(plan.meals_per_day ?? 3),
    );
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
  const requiredMeals = plan?.meals_per_day ?? 3;
  const mealsValid = selectedMeals.length === Math.max(1, Math.min(requiredMeals, 3))
    && new Set(selectedMeals).size === selectedMeals.length;
  const checkoutValid =
    checkout.customer_name.trim() &&
    checkout.customer_whatsapp.trim() &&
    checkout.delivery_address.trim() &&
    mealsValid;

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
      // Resolve start date. Default = today HN. Inclusive semantics: end_date
      // = start + weeks*7 - 1 (so 1 week = 7 days counting the start).
      const startDate = checkout.start_date || todayHnIso();
      const endDate = addDaysIso(startDate, checkout.duration_weeks * 7 - 1);
      const payload = {
        user_id: userUuid ?? user!.id,
        provider_id: plan.provider_id,
        meal_plan_id: planId,
        weekly_price_cents: plan.weekly_price_cents,
        commitment_weeks: checkout.duration_weeks,
        started_at: startDate,
        end_date: endDate,
        status: "pending",
        payment_status: "pending",
        payment_method: methodKey,
        customer_name: checkout.customer_name.trim(),
        customer_whatsapp: checkout.customer_whatsapp.trim(),
        residence: checkout.residence.trim() || null,
        delivery_address: checkout.delivery_address.trim(),
        notes: checkout.notes.trim() || null,
        // Structured meal preference — replaces the old "note the customer left"
        // pattern. DB trigger rejects duplicates; `mealsValid` guards length.
        selected_meals: selectedMeals,
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
        // Server verifies the payment_reference against the provider before
        // extending — a stolen JWT alone can't renew for free. The idempotency
        // key makes accidental double-taps safe.
        const idempotencyKey = renewIdempotencyKeyRef.current || crypto.randomUUID();
        renewIdempotencyKeyRef.current = idempotencyKey;
        const { error } = await accountApi(`/account/food/subscriptions/${renewSubId}/renew`, {
          method: "POST",
          body: JSON.stringify({
            payment_method: paymentMethod === "infinita" ? "crypto" : paymentMethod,
            payment_reference: paymentRef,
            amount_cents: totalCents,
            idempotency_key: idempotencyKey,
          }),
        });
        if (error) throw error;
        return renewSubId;
      } else {
        // Fallback insert (no pending row reserved). Same inclusive period math.
        const startDate = checkout.start_date || todayHnIso();
        const endDate = addDaysIso(startDate, checkout.duration_weeks * 7 - 1);
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
            started_at: startDate,
            end_date: endDate,
            customer_name: checkout.customer_name.trim(),
            customer_whatsapp: checkout.customer_whatsapp.trim(),
            residence: checkout.residence.trim() || null,
            delivery_address: checkout.delivery_address.trim(),
            notes: checkout.notes.trim() || null,
            selected_meals: selectedMeals,
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
          admin_url: `${window.location.origin}/admin/marketplace/subscriptions`,
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
    // 3-meal plans have only one legal answer (all three), so we auto-lock it —
    // the picker still shows for confirmation. Anything else starts empty so the
    // customer explicitly chooses their two-of-three or one-of-three combo.
    const perDay = plan?.meals_per_day ?? 3;
    setSelectedMeals(perDay >= 3 ? defaultMealsForCount(perDay) : []);
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
        <HomeHeader title="Meal Plan" showBackButton onBack={() => navigate(`/services/food/${providerId}`)} />
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
        <HomeHeader title="Meal Plan" showBackButton onBack={() => navigate(`/services/food/${providerId}`)} />
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
      <HomeHeader title={plan.name} showBackButton onBack={() => navigate(`/services/food/${providerId}`)} />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-12">
        <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-8 xl:grid-cols-[420px_1fr]">

          {/* Left column — Plan info (sticky on desktop) */}
          <section className="lg:sticky lg:top-20 lg:self-start">
            <div className="overflow-hidden rounded-3xl bg-card">
              {/* Dish photo hero */}
              <div className="relative h-44 w-full overflow-hidden bg-muted/30 md:h-52">
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
                  <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
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
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      {MEAL_TYPE_LABELS[t]}
                    </span>
                  ))}
                </div>

                {plan.highlights && plan.highlights.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
                    {plan.highlights.map((h, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {h}
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
              <MyRationView
                meals={weeklyMenu?.meals ?? []}
                mealTypes={mealTypes}
                weekStartDate={weeklyMenu?.menu.week_start_date ?? ""}
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
              className={`h-14 shrink-0 rounded-2xl px-4 font-bold transition-colors ${
                justAdded ? "border-green-500/50 bg-green-500/10 text-green-500" : ""
              }`}
              onClick={handleAddToCart}
              aria-label={justAdded ? "Added to cart" : "Add to cart"}
            >
              {justAdded ? <Check className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
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
                  disabled={!checkoutValid || isGenerating || !enabledMethods.includes(paymentMethod)}
                >
                  {isGenerating ? (
                    <><Spinner size="sm" className="mr-2" /> Creating…</>
                  ) : (
                    <>Pay {formatUSD(effectiveTotalCents)} · LIVES</>
                  )}
                </Button>
              ) : paymentMethod === "paypal" ? (
                <Button
                  className="w-full h-14 rounded-2xl bg-[#0070ba] text-white hover:bg-[#0070ba]/90 font-bold text-base"
                  onClick={generateInvoice}
                  disabled={!checkoutValid || !enabledMethods.includes(paymentMethod)}
                >
                  Pay {formatUSD(effectiveTotalCents)} · PayPal
                </Button>
              ) : (
                <Button
                  className="w-full h-14 rounded-2xl font-bold text-base"
                  onClick={generateInvoice}
                  disabled={!checkoutValid || isGenerating || isPriceLoading || !btcPrice || !enabledMethods.includes(paymentMethod)}
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
                <div className="rounded-2xl bg-primary/10 p-4 text-sm">
                  <p className="font-bold text-foreground">Renewing your subscription</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""} · continues from your current period.
                  </p>
                </div>
              ) : (
                <>
                  {/* Duration selector */}
                  <div>
                    <Label className="mb-2 block">
                      {checkoutMode === "order" ? "Duration" : "Subscription Period"}
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      {DURATION_OPTIONS.map(({ weeks, label }) => (
                        <button key={weeks} type="button"
                          onClick={() => setCheckout((f) => ({ ...f, duration_weeks: weeks }))}
                          className={`rounded-2xl py-3 text-center text-sm font-bold transition-colors ${
                            checkout.duration_weeks === weeks
                              ? "bg-primary/15 text-foreground ring-1 ring-primary"
                              : "bg-muted/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Start-date picker (subscriptions only — orders start the same day).
                      Inclusive 7-day math means "start today for 1 week" = Mon–Sun. */}
                  {checkoutMode === "subscribe" && (() => {
                    const today = todayHnIso();
                    const tomorrow = addDaysIso(today, 1);
                    const nextMonday = nextWeekdayIso(today, 1);
                    const effectiveStart = checkout.start_date || today;
                    const effectiveEnd = addDaysIso(effectiveStart, checkout.duration_weeks * 7 - 1);
                    const isCustom = effectiveStart !== today && effectiveStart !== tomorrow && effectiveStart !== nextMonday;
                    const fmt = (iso: string) =>
                      new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: "short", day: "numeric", month: "short",
                      });
                    const options: { key: string; label: string; sub: string; value: string }[] = [
                      { key: "today", label: "Today", sub: fmt(today), value: today },
                      { key: "tomorrow", label: "Tomorrow", sub: fmt(tomorrow), value: tomorrow },
                      { key: "monday", label: "Next Monday", sub: fmt(nextMonday), value: nextMonday },
                    ];
                    return (
                      <div>
                        <Label className="mb-2 block">Start delivery</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {options.map((o) => (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => setCheckout((f) => ({ ...f, start_date: o.value }))}
                              className={`rounded-2xl py-2.5 text-center transition-colors ${
                                effectiveStart === o.value && !isCustom
                                  ? "bg-primary/15 text-foreground ring-1 ring-primary"
                                  : "bg-muted/40 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <p className="text-sm font-bold">{o.label}</p>
                              <p className="mt-0.5 text-[10px] uppercase tracking-wider opacity-80">{o.sub}</p>
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Label className="shrink-0 text-xs text-muted-foreground">or pick a date</Label>
                          <input
                            type="date"
                            min={today}
                            value={isCustom ? effectiveStart : ""}
                            onChange={(e) => setCheckout((f) => ({ ...f, start_date: e.target.value }))}
                            className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Deliveries {fmt(effectiveStart)} — {fmt(effectiveEnd)}{" "}
                          ({checkout.duration_weeks * 7} days, incl. start day)
                        </p>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Meal selection — structured replacement for free-form notes
                  like "2 Lunch per day instead of dinner". Duplicates are not
                  allowed (that's a separate plan); customer picks exactly
                  meals_per_day unique meals. Gated Pay button reads the same
                  `mealsValid` used for `checkoutValid`. */}
              <section className="space-y-2">
                <div className="px-1"><SectionOverline label="Your daily meals" /></div>
                <div className="rounded-3xl bg-card p-5">
                  <MealSelectionPicker
                    value={selectedMeals}
                    onChange={setSelectedMeals}
                    mealsPerDay={requiredMeals}
                  />
                </div>
              </section>

              {/* Summary — mobile-first: single card, subtle dividers between
                  breakdown rows, clear total row with primary emphasis. */}
              <section className="space-y-2">
                <div className="px-1"><SectionOverline label="Order summary" /></div>
                <div className="overflow-hidden rounded-3xl bg-card">
                  <div className="divide-y divide-border/40 px-5">
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-semibold text-foreground">{plan.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-muted-foreground">Restaurant</span>
                      <span className="text-foreground">{provider?.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-muted-foreground">
                        {formatUSD(plan.weekly_price_cents)} × {checkout.duration_weeks} week{checkout.duration_weeks > 1 ? "s" : ""}
                      </span>
                      <span className="text-foreground">{formatUSD(totalCents)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 px-5 py-4">
                    <span className="text-base font-black text-foreground">Total</span>
                    <div className="text-right">
                      <p className="text-2xl font-black tabular-nums leading-none text-foreground">{formatUSD(effectiveTotalCents)}</p>
                      {feePct > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Base {formatUSD(totalCents)} + {feePct}% fee</p>
                      )}
                      {btcPrice && (
                        <p className="mt-1 text-xs text-muted-foreground">≈ {estimatedSats.toLocaleString()} sats</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Delivery details — unified card, iOS Settings / Yandex Lavka
                  pattern: icon + overline label + borderless input per row,
                  hairline dividers between rows. Matches Cart. */}
              <section className="space-y-2">
                <div className="px-1"><SectionOverline label="Delivery details" /></div>
                <div className="overflow-hidden rounded-3xl bg-card divide-y divide-border/40">
                  <div className="flex items-center gap-3 px-4">
                    <UserIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Full name <span className="text-destructive">*</span>
                      </label>
                      <input
                        value={checkout.customer_name}
                        onChange={(e) => setCheckout((f) => ({ ...f, customer_name: e.target.value }))}
                        placeholder="Your full name"
                        className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-4">
                    <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        WhatsApp <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="tel"
                        value={checkout.customer_whatsapp}
                        onChange={(e) => setCheckout((f) => ({ ...f, customer_whatsapp: e.target.value }))}
                        placeholder="+504 1234 5678"
                        className="w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  {residences.length > 0 && (
                    <div className="flex items-center gap-3 px-4">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <label className="block pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Residence
                        </label>
                        <select
                          value={checkout.residence || "_none"}
                          onChange={(e) => setCheckout((f) => ({ ...f, residence: e.target.value === "_none" ? "" : e.target.value }))}
                          className="w-full appearance-none border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none"
                        >
                          <option value="_none">Other / not listed</option>
                          {residences.map((r) => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground/60" />
                    </div>
                  )}

                  <div className="flex items-start gap-3 px-4 py-3">
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Apartment / address <span className="text-destructive">*</span>
                      </label>
                      <LocationPicker
                        userId={userData?.id}
                        value={checkout.delivery_address}
                        onPick={(line) => setCheckout((f) => ({ ...f, delivery_address: line }))}
                      />
                      <textarea
                        value={checkout.delivery_address}
                        onChange={(e) => setCheckout((f) => ({ ...f, delivery_address: e.target.value }))}
                        rows={2}
                        placeholder="Apartment / unit, building, details…"
                        className="w-full resize-none border-0 bg-transparent px-0 pb-0 pt-0 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <NotesField
                    value={checkout.notes}
                    onChange={(next) => setCheckout((f) => ({ ...f, notes: next }))}
                    label="Notes"
                    title="Comment"
                    description="Allergies, preferences, anything the kitchen should know."
                    placeholder="What should we know?"
                  />
                </div>
              </section>

              {/* Payment */}
              <section className="space-y-3">
                <div className="px-1"><SectionOverline label="Payment" /></div>
                <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
                {enabledMethods.length === 0 && (
                  <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                    Payments are temporarily unavailable. Try again in a few minutes.
                  </p>
                )}
              </section>

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
              onInvoiceReady={(paymentId) => {
                const id = pendingRecordIdRef.current;
                if (!id || checkoutMode !== "subscribe" || renewSubId) return;
                void supabaseDb.from("food_subscriptions")
                  .update({ payment_reference: paymentId, payment_method: "crypto" })
                  .eq("id", id);
              }}
              orderMeta={{
                description: `Food ${checkoutMode === "order" ? "Order" : "Subscription"} - ${plan.name}`,
                service_name: `Food ${checkoutMode === "order" ? "Order" : "Subscription"}`,
                client_name: checkout.customer_name.trim(),
                client_phone: checkout.customer_whatsapp.trim(),
                plan_name: plan.name,
                duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
                admin_url: `${window.location.origin}/admin/marketplace/subscriptions`,
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
                onOrderCreated={(orderId) => {
                  const id = pendingRecordIdRef.current;
                  if (!id || checkoutMode !== "subscribe" || renewSubId) return;
                  void supabaseDb.from("food_subscriptions")
                    .update({ payment_reference: orderId, payment_method: "paypal" })
                    .eq("id", id);
                }}
                orderMeta={{
                  description: `Food ${checkoutMode === "order" ? "Order" : "Subscription"} - ${plan.name}`,
                  service_name: `Food ${checkoutMode === "order" ? "Order" : "Subscription"}`,
                  client_name: checkout.customer_name.trim(),
                  client_phone: checkout.customer_whatsapp.trim(),
                  plan_name: plan.name,
                  duration: `${checkout.duration_weeks} week${checkout.duration_weeks > 1 ? "s" : ""}`,
                  admin_url: `${window.location.origin}/admin/marketplace/subscriptions`,
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
