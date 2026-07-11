import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChefHat, ExternalLink, CalendarDays, UtensilsCrossed, AlertTriangle, Lock, RefreshCw,
} from "lucide-react";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MyRationView } from "@/components/food/MyRationView";
import { MealSelectionPicker, defaultMealsForCount, formatMeals, type MealKey } from "@/components/food/MealSelectionPicker";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getMealTypesForPlan, formatWeekLabel } from "@/lib/foodUtils";
import { formatUSD } from "@/lib/pricing";
import { RateAndTip } from "@/components/food/RateAndTip";
import { RenewPreviewDialog } from "@/components/subscriptions/RenewPreviewDialog";
import { toast } from "sonner";
import type { FoodMenuMeal } from "@/types/food";

type EffStatus = "active" | "expiring_soon" | "expired" | "paused" | "cancelled" | "pending";

interface AccessResponse {
  access: boolean;
  status: EffStatus;
  reason: string;
  daysLeft: number;
  canRenew: boolean;
  subscription: {
    id: string;
    provider_id: string | null;
    meal_plan_id: string | null;
    status: string;
    started_at: string | null;
    end_date: string | null;
    commitment_weeks: number;
    weekly_price_cents: number;
    delivery_address: string | null;
    customer_whatsapp: string | null;
    notes: string | null;
  };
  provider: { id: string; name: string } | null;
  plan: { id: string; name: string; meals_per_day: number } | null;
  menu: { week_start_date: string; meals: FoodMenuMeal[] } | null;
}

const STATUS_BADGE: Record<EffStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-500/15 text-green-400" },
  expiring_soon: { label: "Expiring soon", className: "bg-amber-500/15 text-amber-500" },
  expired: { label: "Expired", className: "bg-red-500/15 text-red-400" },
  paused: { label: "Paused", className: "bg-yellow-500/15 text-yellow-400" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending payment", className: "bg-orange-500/15 text-orange-400" },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString() : "—");

export default function FoodSubscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["food-subscription-access", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/food/subscriptions/${id}`);
      if (error) throw error;
      return data as AccessResponse;
    },
  });

  // Renew → open a preview dialog (dates + amount) → on confirm, verify the
  // plan still exists then jump to checkout. Preview stops the "why did I get
  // charged" support tickets that come from mis-taps.
  const [renewChecking, setRenewChecking] = useState(false);
  const [renewPreviewOpen, setRenewPreviewOpen] = useState(false);
  const [mealsSheetOpen, setMealsSheetOpen] = useState(false);
  const [draftMeals, setDraftMeals] = useState<MealKey[]>([]);

  // Load the subscription's stored meal selection separately — the account
  // API only returns the summary fields, and adding this to Prisma requires a
  // schema sync we don't want to block the UI on.
  const { data: mealsRow } = useQuery({
    queryKey: ["food-subscription-meals", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("selected_meals")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as { selected_meals: string[] | null } | null;
    },
  });

  const saveMeals = useMutation({
    mutationFn: async (next: MealKey[]) => {
      const { error } = await supabaseDb
        .from("food_subscriptions")
        .update({ selected_meals: next, updated_at: new Date().toISOString() })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meals updated");
      queryClient.invalidateQueries({ queryKey: ["food-subscription-meals", id] });
      queryClient.invalidateQueries({ queryKey: ["food-subscription-access", id] });
      setMealsSheetOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  const performRenewNavigation = async () => {
    const sub = data?.subscription;
    if (!sub?.provider_id || !sub?.meal_plan_id) {
      toast.error("This plan can't be renewed online. Please contact support.");
      return;
    }
    setRenewChecking(true);
    try {
      const { data: plan, error } = await supabaseDb
        .from("food_meal_plans")
        .select("id, is_active")
        .eq("id", sub.meal_plan_id)
        .maybeSingle();
      if (error) throw error;
      if (!plan || plan.is_active === false) {
        toast.error("This plan is no longer offered. Browse other plans to continue.");
        navigate(`/services/food/${sub.provider_id}`);
        return;
      }
      navigate(`/services/food/${sub.provider_id}/plans/${sub.meal_plan_id}?renew=${sub.id}`);
    } catch {
      navigate(`/services/food/${sub.provider_id}/plans/${sub.meal_plan_id}?renew=${sub.id}`);
    } finally {
      setRenewChecking(false);
    }
  };

  const goRenew = () => setRenewPreviewOpen(true);

  if (isLoading) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions?tab=food">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          <div className="h-72 animate-pulse rounded-3xl bg-muted" />
        </div>
      </UserLayout>
    );
  }

  if (isError || !data) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions?tab=food">
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <ChefHat className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Subscription not found</p>
          <Button className="mt-4 rounded-full" onClick={() => navigate("/my-subscriptions?tab=food")}>
            Back to my bookings
          </Button>
        </div>
      </UserLayout>
    );
  }

  const { access, status, reason, canRenew, subscription: sub, provider, plan, menu } = data;
  const mealTypes = getMealTypesForPlan((plan as any) ?? null);
  const totalCents = (sub.weekly_price_cents || 0) * (sub.commitment_weeks || 1);
  const badge = STATUS_BADGE[status];

  // Client-side preview of the continuous period the server will assign after
  // renewal. Mirrors backend logic: next_start = max(today, prev_end+1); the
  // server is still authoritative — this is display-only.
  const renewPreview = (() => {
    if (!sub.end_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const prevEnd = new Date(`${sub.end_date}T00:00:00`);
    const prevEndPlus1 = new Date(prevEnd);
    prevEndPlus1.setDate(prevEndPlus1.getDate() + 1);
    const newStart = prevEndPlus1 > today ? prevEndPlus1 : today;
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + (sub.commitment_weeks || 1) * 7);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { newStart: iso(newStart), newEnd: iso(newEnd) };
  })();

  const RenewButton = ({ block }: { block?: boolean }) => (
    <Button
      className={`gap-2 rounded-full ${block ? "w-full" : ""}`}
      onClick={goRenew}
      loading={renewChecking}
      loadingText="Checking plan…"
    >
      <RefreshCw className="h-4 w-4" />
      Renew subscription
    </Button>
  );

  return (
    <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions?tab=food">
      <div className="mx-auto max-w-xl space-y-4 px-4 py-4 md:py-8">
        {/* Header — mobile-first: icon + stacked title/plan/status, external
            link is an icon-only pill so the title never has to wrap around it. */}
        <div className="flex items-start gap-3 rounded-3xl bg-card p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black tracking-tight text-foreground">
              {provider?.name ?? "Meal plan"}
            </h1>
            {plan?.name && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{plan.name}</p>
            )}
            <div className="mt-2">
              <Badge className={`rounded-full text-xs ${badge.className}`}>{badge.label}</Badge>
            </div>
          </div>
          {provider && (
            <button
              type="button"
              aria-label="Open restaurant page"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/50 text-foreground transition-colors hover:bg-muted"
              onClick={() => window.open(`/services/food/${provider.id}`, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Rate the restaurant & leave a tip for this purchase */}
        {provider && (
          <RateAndTip
            providerId={provider.id}
            providerName={provider.name}
            subscriptionId={sub.id}
            customerName={sub.customer_name}
          />
        )}

        {/* Expiring-soon banner (still has access) */}
        {access && status === "expiring_soon" && (
          <div className="flex flex-col gap-3 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold text-foreground">{reason}</p>
                <p className="text-sm text-muted-foreground">
                  Renew now to keep your meals without interruption — ends {fmtDate(sub.end_date)}.
                </p>
              </div>
            </div>
            <RenewButton />
          </div>
        )}

        {/* Blocked access — expired / paused / cancelled / pending */}
        {!access && (
          <section className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className={`flex h-16 w-16 items-center justify-center rounded-full ${badge.className}`}>
                <Lock className="h-8 w-8" />
              </span>
              <h2 className="text-xl font-black text-foreground">
                {status === "expired"
                  ? "Your subscription has expired"
                  : status === "paused"
                    ? "Your subscription is paused"
                    : status === "pending"
                      ? "Payment pending"
                      : "Subscription cancelled"}
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                {status === "expired"
                  ? "Access to this week's menu and your meal plan is locked. Renew your subscription to continue."
                  : status === "paused"
                    ? "Your plan is paused. Contact the restaurant to resume it."
                    : status === "pending"
                      ? "We're waiting for your payment to confirm. Once paid, your meals unlock automatically."
                      : "This subscription has been cancelled."}
              </p>
              {canRenew && (
                <div className="mt-2 w-full max-w-xs">
                  <RenewButton block />
                </div>
              )}
              <Button variant="ghost" className="rounded-full" onClick={() => navigate("/services/food")}>
                Browse meal plans
              </Button>
            </div>
          </section>
        )}

        {/* Details */}
        <section className="overflow-hidden rounded-3xl bg-card">
          <div className="p-5">
            <h2 className="text-base font-black tracking-tight text-foreground">Subscription details</h2>
          </div>
          <div className="divide-y divide-border/60 border-t border-border/60">
            {plan && <DetailRow label="Plan" value={`${plan.name} · ${plan.meals_per_day} meals/day`} />}
            {/* Structured meal choice — tap to reopen the picker. Falls back
                to the plan default when the row hasn't been saved yet (legacy). */}
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm text-muted-foreground">Meals per day</span>
              <div className="flex items-center gap-2">
                <span className="text-right text-sm font-medium text-foreground">
                  {formatMeals(
                    (mealsRow?.selected_meals as MealKey[] | null) ??
                    (plan ? defaultMealsForCount(plan.meals_per_day) : []),
                  )}
                </span>
                {plan && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftMeals(
                        (mealsRow?.selected_meals as MealKey[] | null) ??
                        defaultMealsForCount(plan.meals_per_day),
                      );
                      setMealsSheetOpen(true);
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            </div>
            <DetailRow label="Weekly price" value={formatUSD(sub.weekly_price_cents || 0)} />
            <DetailRow label="Duration" value={`${sub.commitment_weeks || 1} week${(sub.commitment_weeks || 1) > 1 ? "s" : ""}`} />
            <DetailRow label="Current period" value={`${fmtDate(sub.started_at)} → ${fmtDate(sub.end_date)}`} />
            {sub.delivery_address && <DetailRow label="Delivery address" value={sub.delivery_address} />}
            {sub.customer_whatsapp && <DetailRow label="WhatsApp" value={sub.customer_whatsapp} />}
            {sub.notes && <DetailRow label="Notes" value={sub.notes} />}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 p-5">
            <span className="text-base font-black text-foreground">Total</span>
            <span className="text-xl font-black tabular-nums text-primary">{formatUSD(totalCents)}</span>
          </div>
        </section>

        {/* Confirmation dialog — shown when the user taps Renew. Confirms
            dates + amount before we start the checkout flow. */}
        {renewPreview && (
          <RenewPreviewDialog
            open={renewPreviewOpen}
            onOpenChange={setRenewPreviewOpen}
            title={plan?.name ?? provider?.name ?? "Meal plan"}
            currentEndDate={sub.end_date}
            newStartDate={renewPreview.newStart}
            newEndDate={renewPreview.newEnd}
            amountCents={totalCents}
            onConfirm={() => void performRenewNavigation()}
          />
        )}

        {/* My ration — Yandex Lavka-style: day picker + meal cards for
            the selected day, with kcal pill and dish thumbnails. */}
        {access && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-black tracking-tight text-foreground">My ration</h2>
              {menu && (
                <Badge variant="secondary" className="rounded-full text-xs">
                  <CalendarDays className="mr-1 h-3 w-3" />
                  Week of {formatWeekLabel(menu.week_start_date)}
                </Badge>
              )}
            </div>
            <MyRationView
              meals={menu?.meals ?? []}
              mealTypes={mealTypes}
              weekStartDate={menu?.week_start_date ?? ""}
            />
          </div>
        )}
      </div>

      {/* Change-your-meals sheet — same picker used at checkout, in a bottom
          sheet so it plays nicely with iOS one-hand. Save invalidates both
          the local `selected_meals` query and the parent `access` query so
          any dependent UI (MyRationView filters, admin manifest) refetches. */}
      <Sheet open={mealsSheetOpen} onOpenChange={setMealsSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto rounded-t-3xl border-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="px-1 pb-4">
            <SheetTitle className="text-left">Change your meals</SheetTitle>
          </SheetHeader>
          {plan && (
            <>
              <MealSelectionPicker
                value={draftMeals}
                onChange={setDraftMeals}
                mealsPerDay={plan.meals_per_day}
              />
              <div className="mt-6 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setMealsSheetOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => saveMeals.mutate(draftMeals)}
                  disabled={
                    draftMeals.length !== plan.meals_per_day
                    || new Set(draftMeals).size !== draftMeals.length
                    || saveMeals.isPending
                  }
                  loading={saveMeals.isPending}
                  loadingText="Saving…"
                >
                  Save
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Changes apply from the next delivery day.
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </UserLayout>
  );
}
