import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Eye, EyeOff, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  weekly_price_cents: 0,
  meals_per_day: 3,
  meals_per_week: 5,
  days_per_week: 5,
  highlights: ["", "", "", ""] as string[],
  status: "active" as const,
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
    setPlanResidenceIds([]);
  };

  const openEdit = (plan: FoodMealPlan) => {
    setIsNew(false);
    setEditPlan(plan);
    const highlights = plan.highlights ?? [];
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      weekly_price_cents: plan.weekly_price_cents,
      meals_per_day: plan.meals_per_day ?? 3,
      meals_per_week: plan.meals_per_week,
      days_per_week: plan.days_per_week,
      highlights: [highlights[0] ?? "", highlights[1] ?? "", highlights[2] ?? "", highlights[3] ?? ""],
      status: plan.status,
      sort_order: plan.sort_order,
    });
    setPlanResidenceIds(planResidences[plan.id] ?? []);
  };

  const closeDialog = () => { setEditPlan(null); setIsNew(false); };
  const isOpen = isNew || editPlan !== null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const highlights = form.highlights.map((h) => h.trim()).filter(Boolean);
      const payload = {
        provider_id: providerId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        weekly_price_cents: form.weekly_price_cents,
        meals_per_day: form.meals_per_day,
        meals_per_week: form.meals_per_week,
        days_per_week: form.days_per_week,
        highlights: highlights.length > 0 ? highlights : null,
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
          {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-14 text-center">
          <p className="font-semibold">No meal plans yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the first plan for this restaurant.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center gap-4 rounded-2xl bg-card p-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-foreground">{plan.name}</span>
                  <Badge className={`rounded-full text-xs ${STATUS_COLORS[plan.status]}`}>
                    {plan.status}
                  </Badge>
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

      {/* Create / Edit dialog */}
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Meal Plan" : "Edit Meal Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plan Name *</Label>
              <Input value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Standard Plan" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2} placeholder="Fresh meals Mon–Fri..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Meals / day</Label>
                <Input type="number" min={1} max={10} value={form.meals_per_day}
                  onChange={(e) => setForm((f) => ({ ...f, meals_per_day: parseInt(e.target.value || "3") }))} />
              </div>
              <div>
                <Label>Days / week</Label>
                <Input type="number" min={1} max={7} value={form.days_per_week}
                  onChange={(e) => setForm((f) => ({ ...f, days_per_week: parseInt(e.target.value || "5") }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price / week ($)</Label>
                <Input type="number" min={0} step={0.01}
                  value={(form.weekly_price_cents / 100).toFixed(2)}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    weekly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  }))} />
              </div>
              <div>
                <Label>Total meals / week</Label>
                <Input type="number" min={1} value={form.meals_per_week}
                  onChange={(e) => setForm((f) => ({ ...f, meals_per_week: parseInt(e.target.value || "1") }))} />
              </div>
            </div>

            <div>
              <Label>Highlights (up to 4)</Label>
              <div className="mt-1 space-y-2">
                {form.highlights.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={h}
                      onChange={(e) => {
                        const next = [...form.highlights];
                        next[i] = e.target.value;
                        setForm((f) => ({ ...f, highlights: next }));
                      }}
                      placeholder={`Highlight ${i + 1}`} />
                    {h && (
                      <Button type="button" size="sm" variant="ghost"
                        className="h-9 w-9 p-0 shrink-0"
                        onClick={() => {
                          const next = [...form.highlights];
                          next[i] = "";
                          setForm((f) => ({ ...f, highlights: next }));
                        }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
              </div>
            </div>

            {residences.length > 0 && (
              <div>
                <Label>Available in locations</Label>
                <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
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
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {planResidenceIds.length === 0 ? "Available everywhere" : `Limited to ${planResidenceIds.length} location${planResidenceIds.length > 1 ? "s" : ""}`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
