import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, parseISO, isWithinInterval, format, addWeeks } from "date-fns";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { UserPicker } from "@/components/UserPicker";
import { logAuditEvent } from "@/lib/auditLog";
import type { FoodSubscription, FoodSubscriptionStatus, FoodMealPlan } from "@/types/food";
import { Pause, Play, X, Plus, Trash2, Check, Pencil } from "lucide-react";
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
};

const STATUS_LABELS: Record<FoodSubscriptionStatus, string> = {
  pending: "pending payment",
  active: "active",
  paused: "paused",
  cancelled: "cancelled",
};

type SubRow = FoodSubscription & { planName: string | null };

const EMPTY_FORM = {
  meal_plan_id: "",
  user_id: "",
  customer_name: "",
  customer_whatsapp: "",
  delivery_address: "",
  weekly_price_cents: 0,
  commitment_weeks: 4,
  started_at: "",
  notes: "",
  admin_notes: "",
  status: "active" as FoodSubscriptionStatus,
};

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
    action: "approve" | "pause" | "resume" | "cancel";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubRow | null>(null);

  const [createDialog, setCreateDialog] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [statsMode, setStatsMode] = useState<"all" | "weekly">("all");

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

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-food-subscriptions", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const planMap: Record<string, string> = {};
      plans.forEach((p) => { planMap[p.id] = p.name; });

      return (data ?? []).map((s: FoodSubscription) => ({
        ...s,
        planName: s.meal_plan_id ? (planMap[s.meal_plan_id] ?? null) : null,
      })) as SubRow[];
    },
    enabled: plans.length >= 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: form.user_id || userData!.id,
        provider_id: providerId,
        meal_plan_id: form.meal_plan_id || null,
        customer_name: form.customer_name.trim(),
        customer_whatsapp: form.customer_whatsapp.trim() || null,
        delivery_address: form.delivery_address.trim() || null,
        weekly_price_cents: form.weekly_price_cents,
        commitment_weeks: form.commitment_weeks,
        notes: form.notes.trim() || null,
        admin_notes: form.admin_notes.trim() || null,
        status: form.status,
        started_at: form.started_at || new Date().toISOString().split("T")[0],
      };
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await logAuditEvent(userData!.id, "create", "food_subscription", data.id, payload);
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
      const payload = {
        meal_plan_id: editForm.meal_plan_id || null,
        customer_name: editForm.customer_name.trim(),
        customer_whatsapp: editForm.customer_whatsapp.trim() || null,
        delivery_address: editForm.delivery_address.trim() || null,
        weekly_price_cents: editForm.weekly_price_cents,
        commitment_weeks: editForm.commitment_weeks,
        started_at: editForm.started_at || editTarget.started_at,
        notes: editForm.notes.trim() || null,
        admin_notes: editForm.admin_notes.trim() || null,
        status: editForm.status,
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
    mutationFn: async ({ sub, action }: { sub: SubRow; action: "approve" | "pause" | "resume" | "cancel" }) => {
      const today = new Date().toISOString().split("T")[0];
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (action === "approve") { updates.status = "active"; }
      else if (action === "pause") { updates.status = "paused"; updates.paused_at = today; }
      else if (action === "resume") { updates.status = "active"; updates.paused_at = null; }
      else { updates.status = "cancelled"; updates.cancelled_at = today; }
      const { error } = await supabaseDb.from("food_subscriptions").update(updates).eq("id", sub.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_subscription", sub.id, { action });
    },
    onSuccess: (_, vars) => {
      const labels = { approve: "Approved", pause: "Paused", resume: "Resumed", cancel: "Cancelled" };
      toast.success(`Subscription ${labels[vars.action]}`);
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setConfirmAction(null);
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
    setForm({ ...EMPTY_FORM, started_at: new Date().toISOString().split("T")[0] });
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
      delivery_address: sub.delivery_address ?? "",
      weekly_price_cents: sub.weekly_price_cents ?? 0,
      commitment_weeks: sub.commitment_weeks ?? 1,
      started_at: sub.started_at ?? new Date().toISOString().split("T")[0],
      notes: sub.notes ?? "",
      admin_notes: sub.admin_notes ?? "",
      status: sub.status,
    });
  };

  const pendingSubs = subs.filter((s) => s.status === "pending");
  const activeSubs = subs.filter((s) => s.status === "active");
  const otherSubs = subs.filter((s) => s.status !== "active" && s.status !== "pending");

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
  // Contracted revenue = weekly price × committed weeks, excluding cancelled and
  // not-yet-approved (pending) subscriptions.
  const revenueCents = scopedSubs
    .filter((s) => s.status !== "cancelled" && s.status !== "pending")
    .reduce((sum, s) => sum + (s.weekly_price_cents || 0) * (s.commitment_weeks || 1), 0);

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
            {subs.length} subscription{subs.length !== 1 ? "s" : ""}
            {activeSubs.length > 0 && ` · ${activeSubs.length} active`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 rounded-full">
          <Plus className="h-4 w-4" /> New Subscription
        </Button>
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
      ) : (
        <div className="space-y-3">
          {[...pendingSubs, ...activeSubs, ...otherSubs].map((sub) => (
            <div key={sub.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold break-words">
                      {sub.customer_name ?? sub.user_id.slice(0, 8) + "…"}
                    </span>
                    {sub.planName && (
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                        {sub.planName}
                      </span>
                    )}
                    <Badge className={`rounded-full text-xs ${STATUS_COLORS[sub.status]}`}>
                      {STATUS_LABELS[sub.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatUSD(sub.weekly_price_cents)}/week
                    {sub.commitment_weeks ? ` · ${sub.commitment_weeks} week${sub.commitment_weeks > 1 ? "s" : ""}` : ""}
                    {" "}· Started {new Date(sub.started_at).toLocaleDateString()}
                    {sub.started_at && ` · Until ${addWeeks(parseISO(sub.started_at), sub.commitment_weeks || 1).toLocaleDateString()}`}
                    {sub.customer_whatsapp && ` · ${sub.customer_whatsapp}`}
                  </p>
                  {sub.delivery_address && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      📍 {sub.delivery_address}
                    </p>
                  )}
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {sub.status === "pending" && (
                    <Button size="sm" className="gap-1 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                      onClick={() => setConfirmAction({ sub, action: "approve" })}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                  )}
                  {sub.status === "active" && (
                    <Button size="sm" variant="outline" className="gap-1 rounded-full"
                      onClick={() => setConfirmAction({ sub, action: "pause" })}>
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </Button>
                  )}
                  {sub.status === "paused" && (
                    <Button size="sm" variant="outline" className="gap-1 rounded-full"
                      onClick={() => setConfirmAction({ sub, action: "resume" })}>
                      <Play className="h-3.5 w-3.5" /> Resume
                    </Button>
                  )}
                  {sub.status !== "cancelled" && (
                    <Button size="sm" variant="ghost"
                      className="gap-1 rounded-full text-destructive hover:text-destructive"
                      onClick={() => setConfirmAction({ sub, action: "cancel" })}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1 rounded-full"
                    onClick={() => openEdit(sub)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-full text-xs"
                    onClick={() => { setSelectedSub(sub); setAdminNotes(sub.admin_notes ?? ""); }}>
                    Notes
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteTarget(sub)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
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
              <div>
                <Label>Delivery Address</Label>
                <Textarea value={form.delivery_address}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
                  rows={2} placeholder="Building, apartment, street…" />
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
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
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
              <div>
                <Label>Delivery Address</Label>
                <Textarea value={editForm.delivery_address}
                  onChange={(e) => setEditForm((f) => ({ ...f, delivery_address: e.target.value }))}
                  rows={2} placeholder="Building, apartment, street…" />
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

            <div>
              <Label>Admin Notes (internal)</Label>
              <Textarea value={editForm.admin_notes}
                onChange={(e) => setEditForm((f) => ({ ...f, admin_notes: e.target.value }))}
                rows={2} placeholder="Payment reference, internal info…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={!editForm.customer_name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save Changes
            </Button>
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
                : "Cancel subscription?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "approve"
                ? "Confirm the payment was received. The subscription will become active."
                : confirmAction?.action === "cancel"
                ? "This will permanently cancel the subscription. This cannot be undone."
                : confirmAction?.action === "pause"
                ? "The subscription will be paused until manually resumed."
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
