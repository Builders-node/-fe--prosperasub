import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, StickyNote, Check, X, Truck, RotateCcw, Phone, CalendarDays,
  Coffee, Sun, Moon, Apple, UtensilsCrossed,
} from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todayHN } from "@/lib/timezone";
import { effectiveFoodStatus } from "@/lib/subscriptionLifecycle";
import { useAuth } from "@/contexts/AuthContext";
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { getMealTypesForPlan } from "@/lib/foodUtils";
import { MEAL_TYPE_LABELS } from "@/types/food";
import type { FoodSubscription, FoodMealPlan, MealType } from "@/types/food";

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const msg = o.message ?? o.error_description ?? o.details ?? o.hint;
    if (typeof msg === "string" && msg) return msg;
  }
  return "Something went wrong. Please try again.";
}

interface DeliveryLog {
  id: string;
  subscription_id: string;
  delivery_date: string;
  meal_type: string;
  status: "delivered" | "failed";
  reason: string | null;
}

const FAILED_REASONS = [
  "Customer not home",
  "Could not reach customer",
  "Wrong / missing address",
  "Customer cancelled today",
  "Other",
];

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack", "other", "meal"];
const MEAL_META: Record<string, { icon: React.ReactNode; color: string }> = {
  breakfast: { icon: <Coffee className="h-3.5 w-3.5" />, color: "text-amber-400" },
  lunch:     { icon: <Sun className="h-3.5 w-3.5" />, color: "text-yellow-400" },
  dinner:    { icon: <Moon className="h-3.5 w-3.5" />, color: "text-indigo-400" },
  snack:     { icon: <Apple className="h-3.5 w-3.5" />, color: "text-green-400" },
  other:     { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
  meal:      { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
};

interface Props {
  providerId: string;
}

type ManifestRow = { sub: FoodSubscription; mealType: MealType };

export function RestaurantOperationsTab({ providerId }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const { residence: globalResidence } = useSelectedResidence();
  const [date, setDate] = useState<string>(todayHN());
  const [mealFilter, setMealFilter] = useState<MealType | "all">("all");
  const [residenceFilter, setResidenceFilter] = useState<string>(globalResidence || "all");
  useEffect(() => { setResidenceFilter(globalResidence || "all"); }, [globalResidence]);

  const { data: residences = [] } = useResidences();
  const [failTarget, setFailTarget] = useState<{ subId: string; mealType: MealType; name: string } | null>(null);
  const [failReason, setFailReason] = useState<string>(FAILED_REASONS[0]);
  const [failNote, setFailNote] = useState("");

  // Plans (for which meals each subscription serves)
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-food-meal-plans", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans").select("*").eq("provider_id", providerId);
      if (error) throw error;
      return (data ?? []) as FoodMealPlan[];
    },
  });
  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  // Active subscriptions for this restaurant
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-food-operations-subs", providerId],
    queryFn: async () => {
      // Include expired & paused (not just active) so PAST delivery dates still
      // render their manifest after a subscription has since ended. The per-date
      // period filter below decides which subs actually apply on the chosen day.
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("*")
        .eq("provider_id", providerId)
        .in("status", ["active", "expired", "paused"])
        .order("delivery_address", { ascending: true });
      if (error) throw error;
      // Derive effective status so an active-in-DB but past-end_date sub is
      // treated as expired here — otherwise today's manifest would still
      // include it until the daily expire-sweep cron runs.
      const today = todayHN();
      return (data ?? []).map((s: FoodSubscription) => ({
        ...s,
        status: effectiveFoodStatus(s, today) as FoodSubscription["status"],
      })) as FoodSubscription[];
    },
  });

  // Delivery logs for the selected date
  const { data: logs = [] } = useQuery({
    queryKey: ["admin-food-delivery-logs", providerId, date],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_delivery_logs")
        .select("id, subscription_id, delivery_date, meal_type, status, reason")
        .eq("provider_id", providerId)
        .eq("delivery_date", date);
      if (error) throw error;
      return (data ?? []) as DeliveryLog[];
    },
  });
  const logByKey = useMemo(() => {
    const m: Record<string, DeliveryLog> = {};
    logs.forEach((l) => { m[`${l.subscription_id}_${l.meal_type}`] = l; });
    return m;
  }, [logs]);

  // Manifest = active subs whose period covers the date, expanded per meal type.
  const fullManifest = useMemo<ManifestRow[]>(() => {
    const rows: ManifestRow[] = [];
    const today = todayHN();
    subs
      .filter((s) => {
        if (s.started_at && s.started_at > date) return false;
        if (s.end_date && s.end_date < date) return false;
        // Today/future: only active subs deliver. Past dates keep their history
        // (a since-expired/paused sub still shows the deliveries it had then).
        if (date >= today && s.status !== "active") return false;
        return true;
      })
      .forEach((sub) => {
        const types = getMealTypesForPlan(sub.meal_plan_id ? planById[sub.meal_plan_id] : null);
        types.forEach((mealType) => rows.push({ sub, mealType }));
      });
    // Sort by meal type (so a courier can run "all breakfasts" together), then by
    // residence, then apartment — keeps each building's deliveries together.
    return rows.sort((a, b) => {
      const mt = MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType);
      if (mt !== 0) return mt;
      const res = (a.sub.residence ?? "").localeCompare(b.sub.residence ?? "");
      if (res !== 0) return res;
      return (a.sub.delivery_address ?? "").localeCompare(b.sub.delivery_address ?? "", undefined, { numeric: true });
    });
  }, [subs, date, planById]);

  // Which meal types are present today (for the filter chips)
  const availableMeals = useMemo(() => {
    const set = new Set<MealType>();
    fullManifest.forEach((r) => set.add(r.mealType));
    return MEAL_ORDER.filter((m) => set.has(m));
  }, [fullManifest]);

  const manifest = fullManifest.filter((r) =>
    (mealFilter === "all" || r.mealType === mealFilter)
    && (residenceFilter === "all"
      || (residenceFilter === "_none" ? !r.sub.residence : r.sub.residence === residenceFilter)),
  );

  const statusOf = (r: ManifestRow) => logByKey[`${r.sub.id}_${r.mealType}`]?.status;
  const deliveredCount = manifest.filter((r) => statusOf(r) === "delivered").length;
  const failedCount = manifest.filter((r) => statusOf(r) === "failed").length;
  const pendingCount = manifest.length - deliveredCount - failedCount;

  const markMutation = useMutation({
    mutationFn: async (
      { subId, mealType, status, reason }: { subId: string; mealType: MealType; status: "delivered" | "failed"; reason?: string | null },
    ) => {
      const existing = logByKey[`${subId}_${mealType}`];
      const payload = {
        subscription_id: subId,
        provider_id: providerId,
        delivery_date: date,
        meal_type: mealType,
        status,
        reason: reason ?? null,
        marked_by: userData?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await supabaseDb
          .from("food_delivery_logs").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from("food_delivery_logs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-food-delivery-logs", providerId, date] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const clearMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabaseDb.from("food_delivery_logs").delete().eq("id", logId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-food-delivery-logs", providerId, date] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  // Mark every still-pending row in the current view as delivered.
  const markAllDelivered = useMutation({
    mutationFn: async () => {
      const pending = manifest.filter((r) => !statusOf(r));
      if (pending.length === 0) return;
      const payload = pending.map((r) => ({
        subscription_id: r.sub.id,
        provider_id: providerId,
        delivery_date: date,
        meal_type: r.mealType,
        status: "delivered",
        reason: null,
        marked_by: userData?.id ?? null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabaseDb
        .from("food_delivery_logs")
        .upsert(payload, { onConflict: "subscription_id,delivery_date,meal_type" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All remaining marked delivered");
      qc.invalidateQueries({ queryKey: ["admin-food-delivery-logs", providerId, date] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const submitFail = () => {
    if (!failTarget) return;
    const reason = failReason === "Other" ? (failNote.trim() || "Other") : failReason;
    markMutation.mutate({ subId: failTarget.subId, mealType: failTarget.mealType, status: "failed", reason });
    setFailTarget(null);
    setFailReason(FAILED_REASONS[0]);
    setFailNote("");
  };

  return (
    <div className="space-y-6">
      {/* Header + date */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Delivery Operations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily delivery run — each meal is tracked separately. Mark every meal as delivered or failed.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {residences.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Residence</Label>
              <Select value={residenceFilter} onValueChange={setResidenceFilter}>
                <SelectTrigger className="mt-1 h-9 w-[180px] rounded-full"><SelectValue placeholder="Residence" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All residences</SelectItem>
                  <SelectItem value="_none">No residence</SelectItem>
                  {residences.map((r) => (
                    <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Delivery date</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[170px]" />
              {date !== todayHN() && (
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground"
                  onClick={() => setDate(todayHN())}>
                  Today
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Meal filter */}
      {availableMeals.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMealFilter("all")}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              mealFilter === "all" ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}>
            All meals
          </button>
          {availableMeals.map((m) => (
            <button key={m} type="button" onClick={() => setMealFilter(m)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                mealFilter === m ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}>
              <span className={mealFilter === m ? "" : MEAL_META[m].color}>{MEAL_META[m].icon}</span>
              {MEAL_TYPE_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="To deliver" value={String(manifest.length)} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Delivered" value={String(deliveredCount)} tone="green" />
        <StatCard label="Failed" value={String(failedCount)} tone="red" />
        <StatCard label="Pending" value={String(pendingCount)} tone="amber" />
      </div>

      {/* Manifest */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : manifest.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-14 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold">No deliveries for this date</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No active subscriptions cover {new Date(`${date}T00:00:00`).toLocaleDateString()}.
          </p>
        </div>
      ) : (
        <>
          {pendingCount > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full"
                onClick={() => markAllDelivered.mutate()} disabled={markAllDelivered.isPending}>
                {markAllDelivered.isPending ? <Spinner size="sm" className="mr-1" /> : <Check className="h-3.5 w-3.5" />}
                Mark remaining delivered ({pendingCount})
              </Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Apt / Residence</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Mark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manifest.map(({ sub, mealType }) => {
                  const log = logByKey[`${sub.id}_${mealType}`];
                  const status = log?.status;
                  const meta = MEAL_META[mealType];
                  return (
                    <TableRow key={`${sub.id}_${mealType}`} className={cn(
                      "[&>td]:py-3",
                      status === "delivered" && "bg-green-500/5",
                      status === "failed" && "bg-red-500/5",
                    )}>
                      {/* Apartment + residence */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-base font-black tabular-nums text-foreground">
                          <MapPin className="h-3.5 w-3.5 text-orange-400" />
                          {sub.delivery_address?.trim() || "—"}
                        </span>
                        {sub.residence && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={sub.residence}>
                            {sub.residence}
                          </p>
                        )}
                      </TableCell>
                      {/* Customer */}
                      <TableCell className="max-w-[260px]">
                        <p className="text-sm font-semibold text-foreground">
                          {sub.customer_name ?? sub.user_id.slice(0, 8) + "…"}
                        </p>
                        {sub.customer_whatsapp && (
                          <a href={`https://wa.me/${sub.customer_whatsapp.replace(/[^\d]/g, "")}`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Phone className="h-3 w-3" /> {sub.customer_whatsapp}
                          </a>
                        )}
                        {sub.notes && (
                          <p className="mt-0.5 flex items-start gap-1 text-xs italic text-amber-500/90" title={sub.notes}>
                            <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                            <span className="line-clamp-2">{sub.notes}</span>
                          </p>
                        )}
                      </TableCell>
                      {/* Meal */}
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", meta.color)}>
                          {meta.icon}{MEAL_TYPE_LABELS[mealType]}
                        </span>
                      </TableCell>
                      {/* Status */}
                      <TableCell>
                        {status === "delivered" ? (
                          <Badge className="rounded-full bg-green-500/15 text-green-400">Delivered</Badge>
                        ) : status === "failed" ? (
                          <div className="space-y-0.5">
                            <Badge className="rounded-full bg-red-500/15 text-red-400">Not delivered</Badge>
                            {log?.reason && <p className="text-xs text-muted-foreground">{log.reason}</p>}
                          </div>
                        ) : (
                          <Badge className="rounded-full bg-muted text-muted-foreground">Pending</Badge>
                        )}
                      </TableCell>
                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {status ? (
                            <Button size="sm" variant="ghost" className="gap-1.5 rounded-full text-muted-foreground"
                              onClick={() => log && clearMutation.mutate(log.id)}
                              disabled={clearMutation.isPending}>
                              <RotateCcw className="h-3.5 w-3.5" /> Undo
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" className="gap-1.5 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                                onClick={() => markMutation.mutate({ subId: sub.id, mealType, status: "delivered" })}
                                disabled={markMutation.isPending}>
                                <Check className="h-3.5 w-3.5" /> Delivered
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1.5 rounded-full text-red-400 hover:text-red-400"
                                onClick={() => { setFailTarget({ subId: sub.id, mealType, name: sub.customer_name ?? "this customer" }); setFailReason(FAILED_REASONS[0]); setFailNote(""); }}>
                                <X className="h-3.5 w-3.5" /> Failed
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Failed reason dialog */}
      <Dialog open={!!failTarget} onOpenChange={(o) => { if (!o) setFailTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Why was it not delivered?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Mark <strong className="text-foreground">{failTarget ? MEAL_TYPE_LABELS[failTarget.mealType] : ""}</strong> for{" "}
              <strong className="text-foreground">{failTarget?.name}</strong> as not delivered.
            </p>
            <div className="space-y-1.5">
              {FAILED_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setFailReason(r)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                    failReason === r ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}>
                  <span className={cn("h-2 w-2 rounded-full", failReason === r ? "bg-primary" : "bg-muted-foreground/40")} />
                  {r}
                </button>
              ))}
            </div>
            {failReason === "Other" && (
              <Textarea value={failNote} onChange={(e) => setFailNote(e.target.value)}
                rows={2} placeholder="Add a note…" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFailTarget(null)}>Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={submitFail} disabled={markMutation.isPending}>
              {markMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Mark not delivered
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon, tone }: {
  label: string; value: string; icon?: React.ReactNode;
  tone?: "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green" ? "text-green-400"
    : tone === "red" ? "text-red-400"
    : tone === "amber" ? "text-amber-400"
    : "text-foreground";
  return (
    <div className="rounded-xl bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </p>
      <p className={cn("mt-1 text-2xl font-black tabular-nums leading-none", toneClass)}>{value}</p>
    </div>
  );
}
