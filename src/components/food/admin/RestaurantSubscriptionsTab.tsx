import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseDb, adminApi } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, parseISO, isWithinInterval, format } from "date-fns";
import { formatUSD } from "@/lib/pricing";
import { nowHN, todayHN, addWeeksISO, addDaysISO, daysUntilHN, formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { UserPicker } from "@/components/UserPicker";
import { useResidences } from "@/hooks/useResidences";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { logAuditEvent } from "@/lib/auditLog";
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import type { FoodSubscription, FoodSubscriptionStatus, FoodMealPlan } from "@/types/food";
import { Pause, Play, X, Plus, Trash2, Check, Pencil, StickyNote, MoreVertical, RefreshCw, MapPin, ShoppingBag, Bell } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

// Supabase PostgrestErrors are plain objects, so String(e) yields "[object Object]".
// Pull out a human-readable message instead.
function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const msg = o.message ?? o.error_description ?? o.details ?? o.hint;
    if (typeof msg === "string" && msg) return msg;
  }
  return "Something went wrong. Please try again.";
}

const STATUS_COLORS: Record<FoodSubscriptionStatus, string> = {
  pending: "bg-orange-500/15 text-orange-400",
  active: "bg-green-500/15 text-green-400",
  paused: "bg-yellow-500/15 text-yellow-400",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS: Record<FoodSubscriptionStatus, string> = {
  pending: "pending payment",
  active: "active",
  paused: "paused",
  cancelled: "cancelled",
  expired: "Inactive (Expired)",
};

type SubRow = FoodSubscription & { planName: string | null };

// end_date is the authoritative period end (= started_at + commitment_weeks*7).
// Persist it on manual create/edit so the lifecycle (active/expiring/expired) is
// computed correctly instead of staying null until a lazy backend write.
function computeEndDate(startedAt: string, weeks: number): string {
  return addWeeksISO(startedAt, Math.max(weeks || 1, 1));
}

// Period history is recorded automatically by a Postgres trigger on
// food_subscriptions (insert + period-date change) — no client-side write needed.

const EMPTY_FORM = {
  meal_plan_id: "",
  user_id: "",
  customer_name: "",
  customer_whatsapp: "",
  residence: "",
  delivery_address: "",
  weekly_price_cents: 0,
  commitment_weeks: 4,
  started_at: "",
  notes: "",
  admin_notes: "",
  status: "active" as FoodSubscriptionStatus,
  payment_status: "paid",
  payment_method: "cash",
  payment_reference: "",
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "lightning", label: "Lightning" },
  { value: "onchain", label: "On-chain BTC" },
  { value: "crypto", label: "LIVES" },
  { value: "paypal", label: "PayPal" },
  { value: "manual", label: "Manual (off-platform)" },
] as const;

interface Props {
  providerId: string;
}

export function RestaurantSubscriptionsTab({ providerId }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const [selectedSub, setSelectedSub] = useState<SubRow | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    sub: SubRow;
    action: "approve" | "pause" | "resume" | "cancel" | "reactivate" | "renew";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubRow | null>(null);

  const [createDialog, setCreateDialog] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [statsMode, setStatsMode] = useState<"all" | "weekly">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FoodSubscriptionStatus>("all");
  const { residence: globalResidence } = useSelectedResidence();
  const [residenceFilter, setResidenceFilter] = useState<string>(globalResidence || "all");
  // Header location selector drives the page filter; local dropdown can still override.
  useEffect(() => { setResidenceFilter(globalResidence || "all"); }, [globalResidence]);

  const { data: residences = [] } = useResidences();

  // ─── Edit subscription ─────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<SubRow | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });

  const { data: plans = [] } = useQuery({
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

  // Resolve plan name at render time from the loaded plans — baking it into the
  // subscriptions query caused a stale-closure race (plans loaded after subs).
  const planNameById: Record<string, string> = {};
  plans.forEach((p) => { planNameById[p.id] = p.name; });
  const planNameFor = (sub: { meal_plan_id?: string | null; planName?: string | null }) =>
    (sub.meal_plan_id ? planNameById[sub.meal_plan_id] : null) ?? sub.planName ?? null;

  // Full period history for the subscription open in the edit dialog.
  const { data: editPeriods = [] } = useQuery({
    queryKey: ["food-sub-periods", editTarget?.id],
    enabled: !!editTarget,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("subscription_periods")
        .select("id, started_at, end_date, amount_cents, payment_method, payment_status, source, recorded_at")
        .eq("service", "food")
        .eq("subscription_id", editTarget!.id)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-food-subscriptions", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((s: FoodSubscription) => ({
        ...s,
        planName: null,
      })) as SubRow[];
    },
    enabled: plans.length >= 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const startedAt = form.started_at || todayHN();
      const payload = {
        user_id: form.user_id || userData!.id,
        provider_id: providerId,
        meal_plan_id: form.meal_plan_id || null,
        customer_name: form.customer_name.trim(),
        customer_whatsapp: form.customer_whatsapp.trim() || null,
        residence: form.residence.trim() || null,
        delivery_address: form.delivery_address.trim() || null,
        weekly_price_cents: form.weekly_price_cents,
        commitment_weeks: form.commitment_weeks,
        notes: form.notes.trim() || null,
        admin_notes: form.admin_notes.trim() || null,
        status: form.status,
        started_at: startedAt,
        end_date: computeEndDate(startedAt, form.commitment_weeks),
        payment_status: form.payment_status,
        payment_method: form.payment_method || null,
        payment_reference: form.payment_reference.trim() || null,
      };
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent(userData!.id, "create", "food_subscription", data.id, payload);
      // Period history is recorded automatically by a DB trigger.
      return data.id;
    },
    onSuccess: () => {
      toast.success("Subscription created");
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setCreateDialog(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const startedAt = editForm.started_at || editTarget.started_at;
      const payload = {
        meal_plan_id: editForm.meal_plan_id || null,
        customer_name: editForm.customer_name.trim(),
        customer_whatsapp: editForm.customer_whatsapp.trim() || null,
        residence: editForm.residence.trim() || null,
        delivery_address: editForm.delivery_address.trim() || null,
        weekly_price_cents: editForm.weekly_price_cents,
        commitment_weeks: editForm.commitment_weeks,
        started_at: startedAt,
        end_date: computeEndDate(startedAt, editForm.commitment_weeks),
        notes: editForm.notes.trim() || null,
        admin_notes: editForm.admin_notes.trim() || null,
        status: editForm.status,
        payment_status: editForm.payment_status,
        payment_method: editForm.payment_method || null,
        payment_reference: editForm.payment_reference.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseDb
        .from("food_subscriptions")
        .update(payload)
        .eq("id", editTarget.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_subscription", editTarget.id, payload);
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setEditTarget(null);
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const updateNotesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSub) return;
      const { error } = await supabaseDb
        .from("food_subscriptions")
        .update({ admin_notes: adminNotes.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", selectedSub.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setSelectedSub(null);
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ sub, action }: { sub: SubRow; action: "approve" | "pause" | "resume" | "cancel" | "reactivate" | "renew" }) => {
      const today = todayHN();
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (action === "approve") { updates.status = "active"; updates.payment_status = "paid"; }
      else if (action === "pause") { updates.status = "paused"; updates.paused_at = today; }
      else if (action === "resume") { updates.status = "active"; updates.paused_at = null; }
      else if (action === "renew") {
        // Record an off-platform paid renewal: extend the period continuously
        // (next start = max(today, current end + 1 day)), mark paid, count it.
        const weeks = Math.max(sub.commitment_weeks || 1, 1);
        const nextStart = sub.end_date && sub.end_date >= today ? addDaysISO(sub.end_date, 1) : today;
        updates.status = "active";
        updates.started_at = nextStart;
        updates.end_date = addWeeksISO(nextStart, weeks);
        updates.paused_at = null;
        updates.cancelled_at = null;
        updates.payment_status = "paid";
        updates.payment_method = "manual";
        updates.periods_paid = (Number((sub as any).periods_paid) || 1) + 1;
      }
      else if (action === "reactivate") {
        const weeks = Math.max(sub.commitment_weeks || 1, 1);
        updates.status = "active";
        updates.started_at = today;
        updates.end_date = addWeeksISO(today, weeks);
        updates.paused_at = null;
        updates.cancelled_at = null;
        // A reactivated period hasn't been paid yet — mark unpaid until collected.
        updates.payment_status = "pending";
      }
      else { updates.status = "cancelled"; updates.cancelled_at = today; }
      const { error } = await supabaseDb.from("food_subscriptions").update(updates).eq("id", sub.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_subscription", sub.id, { action });
      // Period history (renew/reactivate) is recorded automatically by a DB trigger.
    },
    onSuccess: (_, vars) => {
      const labels = { approve: "Approved", pause: "Paused", resume: "Resumed", cancel: "Cancelled", reactivate: "Reactivated", renew: "Renewed (payment recorded)" };
      toast.success(`Subscription ${labels[vars.action]}`);
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setConfirmAction(null);
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const reminderMutation = useMutation({
    mutationFn: async (sub: SubRow) => {
      const { data, error } = await adminApi(`/admin/food/subscriptions/${sub.id}/payment-reminder`, { method: "POST" });
      if (error) throw error;
      return data as { ok: boolean; methods?: string[]; reason?: string };
    },
    onSuccess: (res) => {
      if (res?.ok) toast.success(`Reminder sent${res.methods?.length ? ` (${res.methods.join(", ")})` : ""}`);
      else if (res?.reason === "already_paid") toast.info("Already paid — no reminder needed");
      else if (res?.reason === "no_channel") toast.error("No email/account on file to notify this member");
      else toast.error("Could not send reminder");
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const remindAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/food/payment-reminders/remind-unpaid`, {
        method: "POST", body: JSON.stringify({ providerId }),
      });
      if (error) throw error;
      return data as { total: number; sent: number; skipped: number };
    },
    onSuccess: (r) => toast.success(`Reminders: ${r.sent} sent${r.skipped ? `, ${r.skipped} skipped` : ""} (of ${r.total} unpaid)`),
    onError: (e) => toast.error(errMessage(e)),
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ sub, paid }: { sub: SubRow; paid: boolean }) => {
      const { error } = await supabaseDb.from("food_subscriptions")
        .update({ payment_status: paid ? "paid" : "pending", updated_at: new Date().toISOString() })
        .eq("id", sub.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_subscription", sub.id, { payment_status: paid ? "paid" : "pending" });
    },
    onSuccess: (_, vars) => {
      toast.success(vars.paid ? "Marked as paid" : "Marked as unpaid");
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (sub: SubRow) => {
      const { error } = await supabaseDb.from("food_subscriptions").delete().eq("id", sub.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", "food_subscription", sub.id, { customer: sub.customer_name });
    },
    onSuccess: () => {
      toast.success("Subscription deleted");
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(errMessage(e)),
  });

  const onPlanChange = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    setForm((f) => ({
      ...f,
      meal_plan_id: planId,
      weekly_price_cents: plan?.weekly_price_cents ?? f.weekly_price_cents,
    }));
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, started_at: todayHN() });
    setCreateDialog(true);
  };

  const onEditPlanChange = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    setEditForm((f) => ({
      ...f,
      meal_plan_id: planId,
      weekly_price_cents: plan?.weekly_price_cents ?? f.weekly_price_cents,
    }));
  };

  const openEdit = (sub: SubRow) => {
    setEditTarget(sub);
    setEditForm({
      meal_plan_id: sub.meal_plan_id ?? "",
      user_id: sub.user_id ?? "",
      customer_name: sub.customer_name ?? "",
      customer_whatsapp: sub.customer_whatsapp ?? "",
      residence: sub.residence ?? "",
      delivery_address: sub.delivery_address ?? "",
      weekly_price_cents: sub.weekly_price_cents ?? 0,
      commitment_weeks: sub.commitment_weeks ?? 1,
      started_at: sub.started_at ?? todayHN(),
      notes: sub.notes ?? "",
      admin_notes: sub.admin_notes ?? "",
      status: sub.status,
      payment_status: sub.payment_status ?? "paid",
      payment_method: sub.payment_method ?? "cash",
      payment_reference: sub.payment_reference ?? "",
    });
  };

  // ─── Plan + status filters ────────────────────────────────────────────────
  const matchesFilters = (s: SubRow) =>
    (planFilter === "all"
      || (planFilter === "_none" ? !s.meal_plan_id : s.meal_plan_id === planFilter))
    && (statusFilter === "all" || s.status === statusFilter)
    && (residenceFilter === "all"
      || (residenceFilter === "_none" ? !s.residence : s.residence === residenceFilter));
  const filtersActive = planFilter !== "all" || statusFilter !== "all" || residenceFilter !== "all";
  const filteredSubs = subs.filter(matchesFilters);

  // Cart batches: subscriptions created together share a batch_id.
  const batchCounts: Record<string, number> = {};
  subs.forEach((s) => { const b = (s as any).batch_id; if (b) batchCounts[b] = (batchCounts[b] ?? 0) + 1; });

  const pendingSubs = filteredSubs.filter((s) => s.status === "pending");
  const activeSubs = filteredSubs.filter((s) => s.status === "active");
  const unpaidCount = subs.filter((s) => (s.payment_status ?? "paid") !== "paid" && s.status !== "cancelled").length;
  const otherSubs = filteredSubs.filter((s) => s.status !== "active" && s.status !== "pending");

  // ─── Finance stats (All vs Weekly by payment/start date) ──────────────────
  const weekStart = startOfWeek(nowHN(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(nowHN(), { weekStartsOn: 1 });
  const inScope = (s: SubRow) => {
    if (statsMode === "all") return true;
    if (!s.started_at) return false;
    try {
      return isWithinInterval(parseISO(s.started_at), { start: weekStart, end: weekEnd });
    } catch {
      return false;
    }
  };
  const scopedSubs = subs.filter(inScope);
  const scopedActive = scopedSubs.filter((s) => s.status === "active");
  // Revenue = weekly price × committed weeks × number of paid periods. In "All"
  // mode renewals count toward total revenue; "Weekly" shows just the current
  // period. Excludes cancelled and not-yet-approved (pending) subscriptions.
  const revenueCents = scopedSubs
    .filter((s) => s.status !== "cancelled" && s.status !== "pending")
    .reduce((sum, s) => {
      const periods = statsMode === "all" ? ((s as any).periods_paid || 1) : 1;
      return sum + (s.weekly_price_cents || 0) * (s.commitment_weeks || 1) * periods;
    }, 0);

  return (
    <div className="space-y-6">
      {/* Finance stats */}
      <section className="rounded-2xl bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Finance</p>
          <div className="inline-flex rounded-full bg-muted/40 p-0.5 text-xs font-semibold">
            {(["all", "weekly"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStatsMode(m)}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors",
                  statsMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "all" ? "All" : "Weekly"}
              </button>
            ))}
          </div>
        </div>
        {statsMode === "weekly" && (
          <p className="mb-3 text-xs text-muted-foreground">
            Payments dated {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Revenue" value={formatUSD(revenueCents)} highlight />
          <StatCard label="Subscriptions" value={String(scopedSubs.length)} />
          <StatCard label="Active" value={String(scopedActive.length)} />
        </div>
      </section>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {filtersActive
              ? `${filteredSubs.length} of ${subs.length} subscription${subs.length !== 1 ? "s" : ""}`
              : `${subs.length} subscription${subs.length !== 1 ? "s" : ""}`}
            {activeSubs.length > 0 && ` · ${activeSubs.length} active`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={residenceFilter} onValueChange={setResidenceFilter}>
            <SelectTrigger className="h-9 w-[170px] rounded-full"><SelectValue placeholder="Residence" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All residences</SelectItem>
              <SelectItem value="_none">No residence</SelectItem>
              {residences.map((r) => (
                <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="h-9 w-[170px] rounded-full"><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="_none">No plan</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-[150px] rounded-full"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending payment</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="expired">Inactive (Expired)</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground"
              onClick={() => { setPlanFilter("all"); setStatusFilter("all"); setResidenceFilter("all"); }}>
              Clear
            </Button>
          )}
          {unpaidCount > 0 && (
            <Button variant="outline" className="gap-2 rounded-full" onClick={() => remindAllMutation.mutate()} disabled={remindAllMutation.isPending}>
              <Bell className="h-4 w-4" /> Remind unpaid ({unpaidCount})
            </Button>
          )}
          <Button onClick={openCreate} className="gap-2 rounded-full">
            <Plus className="h-4 w-4" /> New Subscription
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : subs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-14 text-center">
          <p className="font-semibold">No subscriptions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one manually or wait for customers to subscribe.
          </p>
        </div>
      ) : filteredSubs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-14 text-center">
          <p className="font-semibold">No matching subscriptions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No subscriptions match the selected filters.
          </p>
          <Button variant="outline" size="sm" className="mt-3 rounded-full"
            onClick={() => { setPlanFilter("all"); setStatusFilter("all"); setResidenceFilter("all"); }}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...pendingSubs, ...activeSubs, ...otherSubs].map((sub) => {
                const paidNow = (sub.payment_status ?? "paid") === "paid" && (sub.status === "active" || sub.status === "paused");
                const endDate = sub.end_date || computeEndDate(sub.started_at, sub.commitment_weeks || 1);
                const daysLeft = daysUntilHN(endDate);
                // Renewal reminder for any active plan ending within 2 days.
                const expiringSoon = sub.status === "active" && daysLeft != null && daysLeft >= 0 && daysLeft <= 2;
                return (
                  <TableRow key={sub.id} className="[&>td]:py-2.5">
                    <TableCell className="max-w-[240px]">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {sub.customer_name ?? sub.user_id.slice(0, 8) + "…"}
                        {(sub as any).batch_id && batchCounts[(sub as any).batch_id] > 1 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                            title={`Part of a cart order of ${batchCounts[(sub as any).batch_id]} portions`}>
                            <ShoppingBag className="h-2.5 w-2.5" />×{batchCounts[(sub as any).batch_id]}
                          </span>
                        )}
                      </p>
                      {sub.customer_whatsapp && (
                        <p className="text-xs text-muted-foreground">{sub.customer_whatsapp}</p>
                      )}
                      {(sub.residence || sub.delivery_address) && (
                        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground"
                          title={[sub.residence, sub.delivery_address].filter(Boolean).join(" · ")}>
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {sub.residence && <span className="text-foreground/80">{sub.residence}</span>}
                            {sub.residence && sub.delivery_address && " · "}
                            {sub.delivery_address && <span>Apt {sub.delivery_address}</span>}
                          </span>
                        </p>
                      )}
                      {sub.notes && (
                        <p className="mt-0.5 flex items-start gap-1 text-xs italic text-muted-foreground" title={sub.notes}>
                          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">{sub.notes}</span>
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{planNameFor(sub) ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatUSD(sub.weekly_price_cents)}<span className="text-muted-foreground">/wk</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateHN(sub.started_at)} — {formatDateHN(endDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${paidNow ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>
                          {paidNow ? "Paid" : "Unpaid"}
                        </span>
                        {paidNow && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PaymentMethodBadge method={sub.payment_method} />
                            {sub.payment_reference && <PaymentReference method={sub.payment_method} reference={sub.payment_reference} />}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge className={`rounded-full text-xs ${STATUS_COLORS[sub.status]}`}>
                          {STATUS_LABELS[sub.status]}
                        </Badge>
                        {expiringSoon && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400"
                            title="Renewal due soon">
                            <Bell className="h-3 w-3" />
                            {daysLeft === 0 ? "Renew today" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {sub.status === "pending" && (
                          <Button size="sm" className="gap-1.5 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                            onClick={() => setConfirmAction({ sub, action: "approve" })}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                        {sub.status === "active" && (
                          <Button size="sm" variant="outline" className="gap-1.5 rounded-full"
                            onClick={() => setConfirmAction({ sub, action: "pause" })}>
                            <Pause className="h-3.5 w-3.5" /> Pause
                          </Button>
                        )}
                        {sub.status === "paused" && (
                          <Button size="sm" variant="outline" className="gap-1.5 rounded-full"
                            onClick={() => setConfirmAction({ sub, action: "resume" })}>
                            <Play className="h-3.5 w-3.5" /> Resume
                          </Button>
                        )}
                        {sub.status === "expired" && (
                          <Button size="sm" className="gap-1.5 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                            onClick={() => setConfirmAction({ sub, action: "reactivate" })}>
                            <RefreshCw className="h-3.5 w-3.5" /> Reactivate
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="iconSm" variant="ghost" className="rounded-full" title="More actions" aria-label="More actions">
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEdit(sub)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            {sub.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => setConfirmAction({ sub, action: "renew" })}>
                                <RefreshCw className="mr-2 h-4 w-4 text-green-500" /> Renew (payment received)
                              </DropdownMenuItem>
                            )}
                            {(sub.payment_status ?? "paid") === "paid" ? (
                              <DropdownMenuItem onClick={() => paymentMutation.mutate({ sub, paid: false })}>
                                <X className="mr-2 h-4 w-4" /> Mark as unpaid
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => paymentMutation.mutate({ sub, paid: true })}>
                                <Check className="mr-2 h-4 w-4 text-green-500" /> Mark as paid
                              </DropdownMenuItem>
                            )}
                            {(sub.payment_status ?? "paid") !== "paid" && sub.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => reminderMutation.mutate(sub)} disabled={reminderMutation.isPending}>
                                <Bell className="mr-2 h-4 w-4 text-amber-500" /> Send payment reminder
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => { setSelectedSub(sub); setAdminNotes(sub.admin_notes ?? ""); }}>
                              <StickyNote className={`mr-2 h-4 w-4 ${sub.admin_notes ? "text-primary" : ""}`} />
                              Notes{sub.admin_notes ? " •" : ""}
                            </DropdownMenuItem>
                            {sub.status !== "cancelled" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setConfirmAction({ sub, action: "cancel" })}>
                                  <X className="mr-2 h-4 w-4" /> Cancel subscription
                                </DropdownMenuItem>
                              </>
                            )}
                            {sub.status === "cancelled" && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(sub)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create subscription dialog */}
      <Dialog open={createDialog} onOpenChange={(o) => { if (!o) setCreateDialog(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Meal Plan</Label>
              <Select
                value={form.meal_plan_id || "_none"}
                onValueChange={(v) => onPlanChange(v === "_none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No specific plan</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatUSD(p.weekly_price_cents)}/week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
              <div>
                <Label>Platform user</Label>
                <UserPicker
                  value={form.user_id}
                  onSelect={(u) => setForm((f) => ({
                    ...f,
                    user_id: u?.id ?? "",
                    customer_name: u ? (u.display_name || u.name || u.email || f.customer_name) : f.customer_name,
                  }))}
                  placeholder="Select an existing user…"
                  allowClear
                  clearLabel="No linked user (manual entry)"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Link to a platform user, or leave unset and enter the name manually below.
                </p>
              </div>
              <div>
                <Label>Full Name *</Label>
                <Input value={form.customer_name}
                  onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                  placeholder="John Doe" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.customer_whatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, customer_whatsapp: e.target.value }))}
                  placeholder="+504 1234 5678" type="tel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Residence</Label>
                  <Select value={form.residence || "_none"}
                    onValueChange={(v) => setForm((f) => ({ ...f, residence: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select residence" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No residence</SelectItem>
                      {residences.map((r) => (
                        <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Apartment / Unit</Label>
                  <Input value={form.delivery_address}
                    onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
                    placeholder="e.g. 407" />
                </div>
              </div>
            </div>

            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.started_at}
                onChange={(e) => setForm((f) => ({ ...f, started_at: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weekly Price ($)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={(form.weekly_price_cents / 100).toFixed(2)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      weekly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Duration (weeks)</Label>
                <Input
                  type="number" min={1}
                  value={form.commitment_weeks}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, commitment_weeks: parseInt(e.target.value || "1") }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-between rounded-xl bg-muted/50 p-3">
              <span className="font-bold">Total</span>
              <span className="font-black text-orange-400">
                {formatUSD(form.weekly_price_cents * form.commitment_weeks)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as FoodSubscriptionStatus }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending payment</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="expired">Inactive (Expired)</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Customer Notes</Label>
                <Input value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Allergies, preferences…" />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment status</Label>
                  <Select value={form.payment_status} onValueChange={(v) => setForm((f) => ({ ...f, payment_status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment method</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Payment reference (optional)</Label>
                <Input value={form.payment_reference}
                  onChange={(e) => setForm((f) => ({ ...f, payment_reference: e.target.value }))}
                  placeholder="Tx hash, invoice id…" />
              </div>
            </div>

            <div>
              <Label>Admin Notes (internal)</Label>
              <Textarea value={form.admin_notes}
                onChange={(e) => setForm((f) => ({ ...f, admin_notes: e.target.value }))}
                rows={2} placeholder="Payment reference, internal info…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.customer_name.trim() || createMutation.isPending}
            >
              {createMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Create Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit subscription dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Meal Plan</Label>
              <Select
                value={editForm.meal_plan_id || "_none"}
                onValueChange={(v) => onEditPlanChange(v === "_none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No specific plan</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatUSD(p.weekly_price_cents)}/week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
              <div>
                <Label>Full Name *</Label>
                <Input value={editForm.customer_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, customer_name: e.target.value }))}
                  placeholder="John Doe" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={editForm.customer_whatsapp}
                  onChange={(e) => setEditForm((f) => ({ ...f, customer_whatsapp: e.target.value }))}
                  placeholder="+504 1234 5678" type="tel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Residence</Label>
                  <Select value={editForm.residence || "_none"}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, residence: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select residence" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No residence</SelectItem>
                      {residences.map((r) => (
                        <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Apartment / Unit</Label>
                  <Input value={editForm.delivery_address}
                    onChange={(e) => setEditForm((f) => ({ ...f, delivery_address: e.target.value }))}
                    placeholder="e.g. 407" />
                </div>
              </div>
            </div>

            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={editForm.started_at}
                onChange={(e) => setEditForm((f) => ({ ...f, started_at: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weekly Price ($)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={(editForm.weekly_price_cents / 100).toFixed(2)}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      weekly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Duration (weeks)</Label>
                <Input
                  type="number" min={1}
                  value={editForm.commitment_weeks}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, commitment_weeks: parseInt(e.target.value || "1") }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-between rounded-xl bg-muted/50 p-3">
              <span className="font-bold">Total</span>
              <span className="font-black text-orange-400">
                {formatUSD(editForm.weekly_price_cents * editForm.commitment_weeks)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as FoodSubscriptionStatus }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending payment</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Customer Notes</Label>
                <Input value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Allergies, preferences…" />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment status</Label>
                  <Select value={editForm.payment_status} onValueChange={(v) => setEditForm((f) => ({ ...f, payment_status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment method</Label>
                  <Select value={editForm.payment_method} onValueChange={(v) => setEditForm((f) => ({ ...f, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Payment reference (optional)</Label>
                <Input value={editForm.payment_reference}
                  onChange={(e) => setEditForm((f) => ({ ...f, payment_reference: e.target.value }))}
                  placeholder="Tx hash, invoice id…" />
              </div>
            </div>

            <div>
              <Label>Admin Notes (internal)</Label>
              <Textarea value={editForm.admin_notes}
                onChange={(e) => setEditForm((f) => ({ ...f, admin_notes: e.target.value }))}
                rows={2} placeholder="Payment reference, internal info…" />
            </div>

            {editPeriods.length > 0 && (
              <div className="border-t border-border pt-4">
                <Label className="mb-2 block">Period history ({editPeriods.length})</Label>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {editPeriods.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{formatDateHN(p.started_at)} — {formatDateHN(p.end_date)}</span>
                        <span className="ml-2 text-xs capitalize text-muted-foreground">{p.source}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs">{formatUSD(p.amount_cents || 0)}</span>
                        {p.payment_status === "paid"
                          ? <PaymentMethodBadge method={p.payment_method} />
                          : <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">Unpaid</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            {editTarget && editTarget.status !== "cancelled" ? (
              <Button
                variant="outline"
                className="gap-1.5 border-green-600/40 text-green-500 hover:bg-green-600/10 hover:text-green-500"
                onClick={() => { const t = editTarget; setEditTarget(null); setConfirmAction({ sub: t, action: "renew" }); }}
              >
                <RefreshCw className="h-4 w-4" /> Renew (payment received)
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={!editForm.customer_name.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending && <Spinner size="sm" className="mr-2" />}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin notes dialog */}
      <Dialog open={!!selectedSub} onOpenChange={(o) => { if (!o) setSelectedSub(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Notes</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Notes for {selectedSub?.customer_name ?? "subscriber"}</Label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={4}
              placeholder="Internal notes..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedSub(null)}>Cancel</Button>
            <Button onClick={() => updateNotesMutation.mutate()} disabled={updateNotesMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the subscription for <strong>{deleteTarget?.customer_name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action confirmation */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "approve"
                ? "Approve subscription?"
                : confirmAction?.action === "pause"
                ? "Pause subscription?"
                : confirmAction?.action === "resume"
                ? "Resume subscription?"
                : confirmAction?.action === "reactivate"
                ? "Reactivate subscription?"
                : confirmAction?.action === "renew"
                ? "Renew subscription?"
                : "Cancel subscription?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "approve"
                ? "Confirm the payment was received. The subscription will become active."
                : confirmAction?.action === "cancel"
                ? "This will permanently cancel the subscription. This cannot be undone."
                : confirmAction?.action === "pause"
                ? "The subscription will be paused until manually resumed."
                : confirmAction?.action === "reactivate"
                ? "This starts a fresh subscription period from today, extending the end date by the plan duration."
                : confirmAction?.action === "renew"
                ? "Record an off-platform payment: the period is extended by the plan duration (continuing from the current end date) and marked Paid (method: Manual). Use this when money was received outside the platform."
                : "The subscription will resume from today."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction?.action === "cancel"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={() => confirmAction && actionMutation.mutate(confirmAction)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── StatCard (finance metric) ───────────────────────────────────────────────
function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-black tabular-nums leading-none", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
