import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, UtensilsCrossed } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPicker } from "@/components/patterns/UserPicker";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useResidences } from "@/hooks/useResidences";
import { logAuditEvent } from "@/lib/auditLog";
import { todayHN, addDaysISO } from "@/lib/timezone";
import { formatUSD } from "@/lib/pricing";
import { MealSelectionPicker, defaultMealsForCount, type MealKey } from "@/components/food/MealSelectionPicker";
import { useProviderItemsByLegacy, itemKeys } from "@/lib/services/providerItems";

/**
 * Admin one-off "add food subscription for user" dialog — mounted on the
 * Bookings tab of a food provider workspace. Mirrors the shape of
 * NewCleaningBookingDialog: pick a customer, pick a meal plan, choose
 * duration + start, submit → single `food_subscriptions` insert marked
 * paid/manual so it shows up as active revenue immediately.
 */

interface Props {
  /** Legacy food_providers.id — scopes the meal-plan picker. */
  providerId: string;
  /** Optional trigger to override the default "+ New subscription" button. */
  trigger?: React.ReactNode;
}

interface PlanOption {
  id: string;
  name: string;
  weekly_price_cents: number;
  /** How many of the provider's day this plan buys — and WHICH is a further choice. */
  meals_per_day: number | null;
  days_per_week: number | null;
  meals_per_week: number | null;
}

/**
 * What a plan actually is, in one line.
 *
 * The picker used to read "Standard Plan - 2 Times — $90.00/week", which does
 * not say what separates it from "Mon-Fri: 2 Times" at $75 — the answer is six
 * delivery days against five, and it was nowhere on the screen.
 */
function planSummary(p: PlanOption): string {
  const parts: string[] = [];
  if (p.meals_per_day) parts.push(`${p.meals_per_day}/day`);
  if (p.days_per_week) parts.push(`${p.days_per_week} days/week`);
  if (p.meals_per_week) parts.push(`${p.meals_per_week} meals/week`);
  return parts.join(" · ");
}

function endDateFor(startISO: string, weeks: number): string {
  return addDaysISO(startISO, Math.max(weeks || 1, 1) * 7 - 1);
}

export function NewFoodSubscriptionDialog({ providerId, trigger }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { data: residences = [] } = useResidences();

  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState<string>("");
  const [planId, setPlanId] = useState<string>("");
  const [weeklyPriceCents, setWeeklyPriceCents] = useState<number>(0);
  const [weeks, setWeeks] = useState<number>(4);
  const [startedAt, setStartedAt] = useState<string>(todayHN());
  const [residence, setResidence] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [meals, setMeals] = useState<MealKey[]>([]);

  // Breakfast/lunch/dinner is this restaurant's own list, not a platform enum.
  const { items: providerItems } = useProviderItemsByLegacy("food", providerId);

  const { data: plans = [], isLoading: plansLoading } = useQuery<PlanOption[]>({
    queryKey: ["admin-new-food-sub-plans", providerId],
    enabled: open && !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans")
        .select("id,name,weekly_price_cents,meals_per_day,days_per_week,meals_per_week")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanOption[];
    },
  });

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);

  // When the admin picks a plan, seed the weekly price from the plan itself
  // (they can still override it — off-platform deals sometimes get a discount).
  useEffect(() => {
    if (selectedPlan) setWeeklyPriceCents(selectedPlan.weekly_price_cents);
  }, [selectedPlan]);

  const mealsPerDay = selectedPlan?.meals_per_day ?? 0;

  // "2 Times" says how many, never which. Seed the provider's own default —
  // the LAST n of their day — and let it be changed; without this the row went
  // in with selected_meals NULL and the kitchen guessed.
  useEffect(() => {
    setMeals(mealsPerDay > 0 ? defaultMealsForCount(mealsPerDay, providerItems) : []);
  }, [selectedPlan?.id, mealsPerDay, providerItems]);

  const mealChoiceCount = Math.max(1, Math.min(mealsPerDay || 1, itemKeys(providerItems).length));
  const mealsChosen = meals.length === mealChoiceCount;

  const totalCents = weeklyPriceCents * Math.max(weeks || 1, 1);
  const endDate = endDateFor(startedAt, weeks);

  const create = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Pick a customer");
      if (!planId) throw new Error("Pick a meal plan");
      if (!startedAt) throw new Error("Pick a start date");
      if (weeklyPriceCents <= 0) throw new Error("Weekly price must be greater than 0");
      if (weeks < 1) throw new Error("Duration must be at least 1 week");
      if (mealsPerDay > 0 && !mealsChosen) {
        throw new Error(`Pick ${mealChoiceCount} meal${mealChoiceCount === 1 ? "" : "s"} for this plan`);
      }

      const payload = {
        user_id: userId,
        provider_id: providerId,
        meal_plan_id: planId,
        weekly_price_cents: weeklyPriceCents,
        commitment_weeks: weeks,
        started_at: startedAt,
        end_date: endDate,
        status: "active",
        payment_status: "paid",
        payment_method: "manual",
        periods_paid: 1,
        // Which of the day the customer gets. Free text by design — it carries
        // "Tennis Court 1" elsewhere — so the provider's own keys go in as-is.
        selected_meals: meals.length ? meals : null,
        customer_name: customerName.trim() || null,
        customer_whatsapp: customerWhatsapp.trim() || null,
        residence: residence.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        notes: notes.trim() || null,
      };

      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      if (userData?.id) {
        await logAuditEvent(
          userData.id, "create", "food_subscription", data?.id ?? null, payload,
        );
      }
      return data?.id;
    },
    onSuccess: () => {
      toast.success("Subscription created");
      // Refresh every surface on the same page that reads food subs.
      qc.invalidateQueries({ queryKey: ["provider-food-subs", providerId] });
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      resetAndClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not create subscription"),
  });

  const resetAndClose = () => {
    setOpen(false);
    setUserId("");
    setCustomerName("");
    setCustomerWhatsapp("");
    setPlanId("");
    setWeeklyPriceCents(0);
    setWeeks(4);
    setStartedAt(todayHN());
    setResidence("");
    setDeliveryAddress("");
    setNotes("");
  };

  const defaultTrigger = (
    <Button onClick={() => setOpen(true)} className="gap-2 rounded-full">
      <Plus className="h-4 w-4" /> New subscription
    </Button>
  );

  return (
    <>
      {trigger ? <span onClick={() => setOpen(true)}>{trigger}</span> : defaultTrigger}

      <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-primary" /> New food subscription
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <UserPicker
                value={userId}
                onSelect={(u) => {
                  setUserId(u?.id ?? "");
                  if (u) {
                    // Pre-fill the display name so the row reads as the right
                    // person on the provider's Bookings list without extra typing.
                    setCustomerName(u.display_name || u.name || u.email || "");
                  }
                }}
                placeholder="Pick a platform user…"
              />
            </div>

            <div>
              <Label>Meal plan *</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder={plansLoading ? "Loading…" : "Pick a meal plan"} />
                </SelectTrigger>
                <SelectContent>
                  {plans.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {plansLoading ? "Loading plans…" : "This provider has no meal plans yet."}
                    </div>
                  )}
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {/* Two lines, because the name alone does not separate
                          "Standard Plan - 2 Times" from "Mon-Fri: 2 Times" —
                          six delivery days against five, at $15 difference. */}
                      <span className="block">{p.name} — {formatUSD(p.weekly_price_cents)}/week</span>
                      {planSummary(p) && (
                        <span className="block text-[12px] text-muted-foreground">{planSummary(p)}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlan && planSummary(selectedPlan) && (
                <p className="mt-1 text-[12px] text-muted-foreground">{planSummary(selectedPlan)}</p>
              )}
            </div>

            {/*
              Which of the day they get.
              A plan says HOW MANY meals — "2 Times" — and never which two, so
              the row used to go in with selected_meals NULL and the kitchen
              fell back to the last n of the provider's day. It is a real
              choice inside the tariff, so it is asked here.
            */}
            {mealsPerDay > 0 && (
              <div>
                <Label>Meals *</Label>
                <MealSelectionPicker
                  value={meals}
                  onChange={setMeals}
                  mealsPerDay={mealsPerDay}
                  items={providerItems}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weekly price ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={(weeklyPriceCents / 100).toFixed(2)}
                  onChange={(e) =>
                    setWeeklyPriceCents(Math.round(parseFloat(e.target.value || "0") * 100))
                  }
                />
              </div>
              <div>
                <Label>Duration (weeks) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={weeks}
                  onChange={(e) => setWeeks(Math.max(1, parseInt(e.target.value || "1", 10)))}
                />
              </div>
            </div>

            <div>
              <Label>Start date *</Label>
              <Input
                type="date"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Ends {endDate} · Total <b>{formatUSD(totalCents)}</b>
              </p>
            </div>

            <div className="space-y-3 rounded-radius-md bg-muted/30 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Delivery (optional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Residence</Label>
                  <Select
                    value={residence || "_none"}
                    onValueChange={(v) => setResidence(v === "_none" ? "" : v)}
                  >
          <SelectTrigger inputSize="sm" >
                      <SelectValue placeholder="Pick" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No residence</SelectItem>
                      {residences.map((r) => (
                        <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Apartment / unit</Label>
                  <Input
                    className="h-9"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="e.g. 407"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  className="h-9"
                  type="tel"
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  placeholder="+504 1234 5678"
                />
              </div>
            </div>

            <div>
              <Label>Notes for the kitchen</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, preferences, delivery quirks…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              // The meal choice is part of the plan, so it gates the button
              // rather than failing on submit after everything else is filled.
              disabled={
                !userId || !planId || weeklyPriceCents <= 0 || create.isPending ||
                (mealsPerDay > 0 && !mealsChosen)
              }
            >
              {create.isPending && <Spinner size="sm" className="mr-2" />}
              Create subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
