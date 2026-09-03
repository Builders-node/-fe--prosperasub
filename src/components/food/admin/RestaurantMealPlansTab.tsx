import type { Entitlement } from "@/lib/plans/entitlements";
import { useState } from "react";
import { fetchPlanGallery, savePlanGallery } from "@/lib/plans/planGallery";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { StatusPill } from "@/components/patterns/StatusPill";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { DIETARY_TAG_KEYS, DIETARY_TAGS, type DietaryTag } from "@/lib/foodDietaryTags";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PlanForm, cleanFeatures, type PlanFormValues } from "@/components/provider/plans/PlanForm";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatUSD } from "@/lib/pricing";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { useResidences } from "@/hooks/useResidences";
import { MapPin } from "lucide-react";
import type { FoodMealPlan } from "@/types/food";

/** Food bills one way. Offering the other four would be offering a lie. */
const FOOD_PERIODS = ["weekly"] as const;

/** The public card has room for four. Anything past that is silently unseen. */
const FOOD_HIGHLIGHT_LIMIT = 4;

const EMPTY_FORM = {
  name: "",
  description: "",
  weekly_price_cents: 0,
  meals_per_day: 3,
  days_per_week: 5,
  highlights: [] as string[],
  dietary_tags: [] as DietaryTag[],
  status: "active" as string,
  sort_order: 0,
};

interface Props {
  providerId: string;
}

export function RestaurantMealPlansTab({ providerId }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editPlan, setEditPlan] = useState<FoodMealPlan | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [planResidenceIds, setPlanResidenceIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<FoodMealPlan | null>(null);
  /** Photographs of the plan. They live on the universal mirror. */
  const [gallery, setGallery] = useState<string[]>([]);
  /** Which courts/rooms this plan opens. Empty = all of them. */
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  /** Lines beyond the first — the first is this form's quantity/unit. */
  const [extraEntitlements, setExtraEntitlements] = useState<Entitlement[]>([]);

  const { data: residences = [] } = useResidences();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-food-meal-plans", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans")
        .select("*")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FoodMealPlan[];
    },
  });

  // plan → [residence_id] map (which locations each plan is offered in; empty = all)
  const { data: planResidences = {} } = useQuery({
    queryKey: ["admin-food-plan-residences", providerId, plans.map((p) => p.id).join(",")],
    enabled: plans.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plan_residences")
        .select("meal_plan_id, residence_id")
        .in("meal_plan_id", plans.map((p) => p.id));
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r: any) => {
        (map[r.meal_plan_id] ??= []).push(r.residence_id);
      });
      return map;
    },
  });
  const residenceNameById: Record<string, string> = {};
  residences.forEach((r) => { residenceNameById[r.id] = r.name; });

  const openNew = () => {
    setIsNew(true);
    setEditPlan(null);
    setForm({ ...EMPTY_FORM });
    setGallery([]);
    setPlanResidenceIds([]);
  };

  const openEdit = (plan: FoodMealPlan) => {
    void fetchPlanGallery("food", plan.id).then(setGallery);
    setIsNew(false);
    setEditPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      weekly_price_cents: plan.weekly_price_cents,
      meals_per_day: plan.meals_per_day ?? 3,
      days_per_week: plan.days_per_week,
      // No longer padded to four empty slots: the highlights are typed one per
      // line now, and three blank trailing lines is a strange thing to open on.
      highlights: (plan.highlights ?? []).filter(Boolean),
      dietary_tags: ((plan as any).dietary_tags ?? []).filter(
        (t: unknown): t is DietaryTag => typeof t === "string" && (DIETARY_TAG_KEYS as string[]).includes(t),
      ),
      status: plan.status,
      sort_order: plan.sort_order,
    });
    setPlanResidenceIds(planResidences[plan.id] ?? []);
  };

  const closeDialog = () => { setEditPlan(null); setIsNew(false); };
  const isOpen = isNew || editPlan !== null;

  // ── Bridge to the shared PlanForm ────────────────────────────────────────
  // Food's own columns stay exactly as they are; this only presents them in
  // the common vocabulary — how many, of what, how often, for how much.
  const mealsPerWeek = form.meals_per_day * form.days_per_week;
  const highlightCount = form.highlights.filter((h) => h.trim()).length;

  const planFormValues: PlanFormValues = {
    name: form.name,
    description: form.description,
    priceCents: form.weekly_price_cents,
    quantity: mealsPerWeek,
    period: "weekly",
    unit: "meal",
    features: form.highlights,
    status: form.status,
    // This table has no visibility column; the mirror publishes it.
    visibility: "public",
    // Photographs live on the universal mirror — see lib/plans/planGallery.
    gallery,
    resourceIds,
    extraEntitlements,
    sortOrder: form.sort_order,
  };

  const applyPlanFormPatch = (patch: Partial<PlanFormValues>) => {
    if (patch.gallery !== undefined) setGallery(patch.gallery);
    if (patch.resourceIds !== undefined) setResourceIds(patch.resourceIds);
    if (patch.extraEntitlements !== undefined) setExtraEntitlements(patch.extraEntitlements);
    setForm((f) => ({
      ...f,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.priceCents !== undefined && { weekly_price_cents: patch.priceCents }),
      ...(patch.features !== undefined && { highlights: patch.features }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
    }));
    // quantity / period / unit are not editable here — meals per week is
    // derived from the two factors in `extras`, and food bills weekly.
  };

  // Pre-save guard: when shrinking meals_per_day on an existing plan, warn if
  // any live subscription's selected_meals count is still larger. Without this
  // Ops keeps shipping the meals the customer originally picked (verbatim from
  // selected_meals) even though the plan now advertises fewer.
  const [shrinkConflict, setShrinkConflict] = useState<{ n: number; maxSelected: number } | null>(null);

  const runSave = () => saveMutation.mutate();
  const trySave = async () => {
    if (!isNew && editPlan && form.meals_per_day < (editPlan.meals_per_day ?? 3)) {
      const { data } = await supabaseDb
        .from("food_subscriptions")
        .select("selected_meals,status")
        .eq("meal_plan_id", editPlan.id)
        .in("status", ["active", "paused"]);
      const rows = (data ?? []) as { selected_meals?: string[] | null }[];
      const maxSelected = rows.reduce((m, r) => Math.max(m, Array.isArray(r.selected_meals) ? r.selected_meals.length : 0), 0);
      if (maxSelected > form.meals_per_day) {
        setShrinkConflict({ n: rows.length, maxSelected });
        return;
      }
    }
    runSave();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const highlights = cleanFeatures(form.highlights).slice(0, FOOD_HIGHLIGHT_LIMIT);
      const payload = {
        provider_id: providerId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        weekly_price_cents: form.weekly_price_cents,
        meals_per_day: form.meals_per_day,
        // Always recomputed on save, so an existing plan whose stored total
        // disagrees with its two factors is corrected the next time it's edited.
        meals_per_week: form.meals_per_day * form.days_per_week,
        days_per_week: form.days_per_week,
        highlights: highlights.length > 0 ? highlights : null,
        dietary_tags: form.dietary_tags.length > 0 ? form.dietary_tags : null,
        status: form.status,
        sort_order: form.sort_order,
        updated_at: new Date().toISOString(),
      };
      let planId: string;
      if (isNew) {
        const { data, error } = await supabaseDb
          .from("food_meal_plans").insert(payload).select("id").single();
        if (error) throw error;
        planId = data.id;
        await logAuditEvent(userData!.id, "create", "food_meal_plan", data.id, payload);
      } else {
        planId = editPlan!.id;
        const { error } = await supabaseDb
          .from("food_meal_plans").update(payload).eq("id", editPlan!.id);
        if (error) throw error;
        await logAuditEvent(userData!.id, "edit", "food_meal_plan", editPlan!.id, payload);
      }

      // The photographs belong to the mirror, not to this table — the trigger
      // never overwrites them, so they survive every later edit here.
      await savePlanGallery("food", planId, gallery);

      // Sync plan → locations (empty selection = available everywhere).
      const { error: delErr } = await supabaseDb
        .from("food_meal_plan_residences").delete().eq("meal_plan_id", planId);
      if (delErr) throw delErr;
      if (planResidenceIds.length > 0) {
        const rows = planResidenceIds.map((rid) => ({ meal_plan_id: planId, residence_id: rid }));
        const { error: insErr } = await supabaseDb.from("food_meal_plan_residences").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? "Plan created" : "Plan updated");
      qc.invalidateQueries({ queryKey: ["admin-food-meal-plans", providerId] });
      qc.invalidateQueries({ queryKey: ["admin-food-meal-plans-all"] });
      qc.invalidateQueries({ queryKey: ["admin-food-plan-residences", providerId] });
      closeDialog();
    },
    onError: (e: any) => toast.error(e?.message || e?.error_description || "Failed to save plan"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (plan: FoodMealPlan) => {
      const { error } = await supabaseDb.from("food_meal_plans").delete().eq("id", plan.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", "food_meal_plan", plan.id, { name: plan.name });
    },
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["admin-food-meal-plans", providerId] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const toggleStatus = async (plan: FoodMealPlan) => {
    const newStatus = plan.status === "active" ? "inactive" : "active";
    const { error } = await supabaseDb
      .from("food_meal_plans")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", plan.id);
    if (error) toast.error(error.message);
    else {
      toast.success(newStatus === "active" ? "Plan activated" : "Plan deactivated");
      qc.invalidateQueries({ queryKey: ["admin-food-meal-plans", providerId] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Meal Plans</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage plans for this restaurant
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-full">
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-radius-md bg-muted" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-radius-md bg-card py-14 text-center">
          <p className="font-semibold">No meal plans yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the first plan for this restaurant.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center gap-4 rounded-radius-md bg-card p-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-foreground">{plan.name}</span>
                  <StatusPill status={plan.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatUSD(plan.weekly_price_cents)}/week · {plan.meals_per_day ?? 3} meals/day · {plan.days_per_week} days/week
                </p>
                {plan.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{plan.description}</p>
                )}
                {residences.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 text-orange-400" />
                    {(() => {
                      const ids = planResidences[plan.id] ?? [];
                      if (ids.length === 0) return "All locations";
                      return ids.map((id) => residenceNameById[id]).filter(Boolean).join(", ");
                    })()}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                  title={plan.status === "active" ? "Deactivate" : "Activate"}
                  onClick={() => toggleStatus(plan)}>
                  {plan.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(plan)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(plan)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog — mobile-first: single-column stacking, section
          overlines to break the wall of inputs, highlights collapse into a
          compact live list (empty rows hidden, "Add highlight" until 4). */}
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader className="pb-1">
            <DialogTitle>{isNew ? "New Meal Plan" : "Edit Meal Plan"}</DialogTitle>
          </DialogHeader>
          {/* The shared plan form. Food keeps its own table, its own columns and
              its own mutation — only the LAYOUT is common, so a provider who
              runs a restaurant and a cleaning service meets the same fields in
              the same order in both. Everything food-specific goes through
              `extras`, in one predictable place. */}
          <PlanForm
            hideVisibility
            values={planFormValues}
            onChange={applyPlanFormPatch}
            priceLabel="Price / week"
            priceHint="What the customer pays each week of their subscription."
            fixedUnit="meal"
            periods={FOOD_PERIODS}
            // The quantity is not typed here: it comes from meals/day × days/week
            // below, which is what ops actually packs. The preview line above
            // still reads "15 meals a week" — the figure on the public card.
            hideQuantity
            featuresLabel="Highlights"
            featuresPlaceholder={"One per line, up to 4\ne.g. Fresh, home-style meals"}
            extras={
              <>
                {/* ── Sizing ─────────────────────────────────────────────── */}
                <section className="space-y-3">
                  <SectionOverline label="Sizing" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Meals / day</Label>
                      <Input type="number" min={1} max={10} inputMode="numeric" value={form.meals_per_day}
                        onChange={(e) => setForm((f) => ({ ...f, meals_per_day: parseInt(e.target.value || "3") }))} />
                    </div>
                    <div>
                      <Label>Days / week</Label>
                      <Input type="number" min={1} max={7} inputMode="numeric" value={form.days_per_week}
                        onChange={(e) => setForm((f) => ({ ...f, days_per_week: parseInt(e.target.value || "5") }))} />
                    </div>
                    {/* Derived, not typed. This is the number the customer reads
                        on the listing card ("15 meals/week"), and it used to be a
                        third free field beside the two it is made of — so a plan
                        could advertise 3 meals while delivering 3 × 5 for the
                        same price. Nothing recomputed it and nothing checked it. */}
                    <div>
                      <Label>Total / week</Label>
                      <Input
                        type="number" value={mealsPerWeek}
                        readOnly tabIndex={-1}
                        className="bg-muted text-muted-foreground"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {form.meals_per_day} × {form.days_per_week}, calculated
                      </p>
                    </div>
                  </div>
                </section>

                {/* ── Dietary tags — multi-select chip picker. Fixed vocab lives
                       in lib/foodDietaryTags.ts and mirrors the DB CHECK. */}
                <section className="space-y-3">
                  <SectionOverline
                    label="Dietary type"
                    count={form.dietary_tags.length > 0 ? String(form.dietary_tags.length) : undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tag this plan so customers can filter by diet (Keto, Vegan, Gym, …). Pick zero or more.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DIETARY_TAG_KEYS.map((key) => {
                      const meta = DIETARY_TAGS[key];
                      const Icon = meta.icon;
                      const on = form.dietary_tags.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              dietary_tags: on
                                ? f.dietary_tags.filter((t) => t !== key)
                                : [...f.dietary_tags, key],
                            }))
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                            on
                              ? `${meta.tint} ring-1 ring-primary/40`
                              : "bg-muted/40 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            }
            footer={
              <>
                {highlightCount > FOOD_HIGHLIGHT_LIMIT && (
                  <p className="text-xs text-destructive">
                    Only the first {FOOD_HIGHLIGHT_LIMIT} highlights are shown on the public card —
                    {highlightCount - FOOD_HIGHLIGHT_LIMIT} will be dropped when you save.
                  </p>
                )}

                {residences.length > 0 && (
                  <section className="space-y-3">
                    <SectionOverline label="Availability" />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to offer this plan in <strong>all</strong> locations. Select specific residences to limit it.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {residences.map((r) => {
                        const active = planResidenceIds.includes(r.id);
                        return (
                          <button key={r.id} type="button"
                            onClick={() => setPlanResidenceIds((prev) => active ? prev.filter((x) => x !== r.id) : [...prev, r.id])}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                              active ? "border-primary bg-primary/15 text-foreground" : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                            }`}>
                            <MapPin className="h-3.5 w-3.5" /> {r.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {planResidenceIds.length === 0 ? "Available everywhere" : `Limited to ${planResidenceIds.length} location${planResidenceIds.length > 1 ? "s" : ""}`}
                    </p>
                  </section>
                )}
              </>
            }
          />
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={trySave}
              disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* meals_per_day-shrink guard: warn before customer/ops copy diverges. */}
      <AlertDialog open={!!shrinkConflict} onOpenChange={(o) => !o && setShrinkConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shrink meals per day on live subscriptions?</AlertDialogTitle>
            <AlertDialogDescription>
              {shrinkConflict && (
                <>
                  You're setting meals per day to <strong>{form.meals_per_day}</strong>, but
                  {" "}<strong>{shrinkConflict.n}</strong> active subscription{shrinkConflict.n === 1 ? "" : "s"}
                  {" "}on this plan already picked <strong>{shrinkConflict.maxSelected}</strong> meals.
                  Operations will keep sending those meals until the customer re-picks in <em>My Ration</em>,
                  so the customer-facing plan card and the delivery manifest will disagree. Continue anyway?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShrinkConflict(null); runSave(); }}>
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. Subscriptions linked to this plan will lose their plan reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
