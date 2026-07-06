import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useFoodRestaurant } from "@/hooks/useFoodRestaurant";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { AdminListShell } from "@/components/admin/AdminListShell";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import type { FoodSubscription, FoodSubscriptionStatus, FoodProvider, FoodMealPlan } from "@/types/food";
import { Pause, Play, X, Plus, Check, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

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

type SubWithProvider = FoodSubscription & { provider: FoodProvider | null; planName: string | null };

const EMPTY_FORM = {
  provider_id: "",
  meal_plan_id: "",
  customer_name: "",
  customer_whatsapp: "",
  delivery_address: "",
  weekly_price_cents: 0,
  commitment_weeks: 4,
  notes: "",
  admin_notes: "",
  status: "active" as FoodSubscriptionStatus,
};

const FoodSubscriptions = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { restaurants, selectedId, select } = useFoodRestaurant();

  const [selectedSub, setSelectedSub] = useState<SubWithProvider | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    sub: SubWithProvider;
    action: "approve" | "pause" | "resume" | "cancel" | "reactivate";
  } | null>(null);

  // ─── New subscription dialog ───────────────────────────────────────────────
  const [createDialog, setCreateDialog] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // ─── Plans query ───────────────────────────────────────────────────────────
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-food-meal-plans-all"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FoodMealPlan[];
    },
  });

  const plansForProvider = (pid: string) => plans.filter((p) => p.provider_id === pid);

  // ─── Subscriptions query ───────────────────────────────────────────────────
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-food-subscriptions", selectedId],
    queryFn: async () => {
      let q = supabaseDb.from("food_subscriptions").select("*").order("created_at", { ascending: false });
      if (selectedId !== "all") q = q.eq("provider_id", selectedId);
      const { data, error } = await q;
      if (error) throw error;

      const providerMap: Record<string, FoodProvider> = {};
      restaurants.forEach((p) => { providerMap[p.id] = p; });
      const planMap: Record<string, string> = {};
      plans.forEach((p) => { planMap[p.id] = p.name; });

      return (data ?? []).map((s: FoodSubscription) => ({
        ...s,
        provider: providerMap[s.provider_id] ?? null,
        planName: s.meal_plan_id ? (planMap[s.meal_plan_id] ?? null) : null,
      })) as SubWithProvider[];
    },
    enabled: true,
  });

  // Global location filter (admin header selector) + text search.
  const { residence: globalResidence } = useSelectedResidence();
  const [search, setSearch] = useState("");
  const locScopedSubs = globalResidence
    ? subs.filter((s) => (s.residence ?? "") === globalResidence)
    : subs;
  const q = search.trim().toLowerCase();
  const visibleSubs = q
    ? locScopedSubs.filter((s) =>
        [s.customer_name, s.customer_whatsapp, s.delivery_address, s.planName, s.provider?.name]
          .some((v) => (v ?? "").toLowerCase().includes(q)))
    : locScopedSubs;

  // ─── Create mutation ───────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userData!.id, // admin user as placeholder
        provider_id: form.provider_id,
        meal_plan_id: form.meal_plan_id || null,
        customer_name: form.customer_name.trim(),
        customer_whatsapp: form.customer_whatsapp.trim() || null,
        delivery_address: form.delivery_address.trim() || null,
        weekly_price_cents: form.weekly_price_cents,
        commitment_weeks: form.commitment_weeks,
        notes: form.notes.trim() || null,
        admin_notes: form.admin_notes.trim() || null,
        status: form.status,
        started_at: new Date().toISOString().split("T")[0],
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
    onError: (e) => toast.error(String(e)),
  });

  // ─── Notes mutation ────────────────────────────────────────────────────────
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
    onError: (e) => toast.error(String(e)),
  });

  // ─── Action mutation ───────────────────────────────────────────────────────
  const actionMutation = useMutation({
    mutationFn: async ({ sub, action }: { sub: SubWithProvider; action: "approve" | "pause" | "resume" | "cancel" | "reactivate" }) => {
      const today = new Date().toISOString().split("T")[0];
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (action === "approve") { updates.status = "active"; updates.payment_status = "paid"; }
      else if (action === "pause") { updates.status = "paused"; updates.paused_at = today; }
      else if (action === "resume") { updates.status = "active"; updates.paused_at = null; }
      else if (action === "reactivate") {
        // Start a fresh period from today.
        const weeks = Math.max(sub.commitment_weeks || 1, 1);
        const end = new Date();
        end.setDate(end.getDate() + weeks * 7);
        updates.status = "active";
        updates.started_at = today;
        updates.end_date = end.toISOString().split("T")[0];
        updates.paused_at = null;
        updates.cancelled_at = null;
        // A reactivated period hasn't been paid yet — mark unpaid until collected.
        updates.payment_status = "pending";
      }
      else { updates.status = "cancelled"; updates.cancelled_at = today; }
      const { error } = await supabaseDb.from("food_subscriptions").update(updates).eq("id", sub.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_subscription", sub.id, { action });
    },
    onSuccess: (_, vars) => {
      const labels = { approve: "Approved", pause: "Paused", resume: "Resumed", cancel: "Cancelled", reactivate: "Reactivated" };
      toast.success(`Subscription ${labels[vars.action]}`);
      qc.invalidateQueries({ queryKey: ["admin-food-subscriptions"] });
      setConfirmAction(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ sub, paid }: { sub: SubWithProvider; paid: boolean }) => {
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
    onError: (e) => toast.error(String(e)),
  });

  // ─── Open create dialog ────────────────────────────────────────────────────
  const openCreate = () => {
    const defaultProvider = selectedId !== "all" ? selectedId : (restaurants[0]?.id ?? "");
    setForm({
      ...EMPTY_FORM,
      provider_id: defaultProvider,
    });
    setCreateDialog(true);
  };

  // Auto-fill price when plan changes
  const onPlanChange = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    setForm((f) => ({
      ...f,
      meal_plan_id: planId,
      weekly_price_cents: plan?.weekly_price_cents ?? f.weekly_price_cents,
    }));
  };

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Food Subscriptions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage recurring weekly food subscriptions
              {globalResidence ? ` · ${globalResidence}` : ""}
            </p>
          </div>
          <div className="flex gap-3">
            {restaurants.length > 1 && (
              <Select value={selectedId} onValueChange={select}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="All Restaurants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Restaurants</SelectItem>
                  {restaurants.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={openCreate} className="gap-2 rounded-full" disabled={restaurants.length === 0}>
              <Plus className="h-4 w-4" /> New Subscription
            </Button>
          </div>
        </div>

        {/* List */}
        <AdminListShell
          search={search} onSearch={setSearch}
          searchPlaceholder="Search by name, phone, plan…"
          isLoading={isLoading}
          isEmpty={subs.length === 0}
          isNoResults={subs.length > 0 && visibleSubs.length === 0}
          count={visibleSubs.length}
          emptyTitle={globalResidence ? `No subscriptions in ${globalResidence}` : "No subscriptions yet"}
          emptySubtitle={globalResidence ? "Clear the location filter in the header to see all." : "Create one manually or wait for customers to subscribe."}
          onClearFilters={() => setSearch("")}
        >
          <div className="space-y-3">
            {visibleSubs.map((sub) => (
              <div key={sub.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">
                        {sub.customer_name ?? sub.user_id.slice(0, 8) + "…"}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        · {sub.provider?.name ?? "—"}
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
                      {sub.customer_whatsapp && ` · ${sub.customer_whatsapp}`}
                    </p>
                    {sub.delivery_address && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        📍 {sub.delivery_address}
                      </p>
                    )}
                    {(() => {
                      const paidNow = (sub.payment_status ?? "paid") === "paid" && (sub.status === "active" || sub.status === "paused");
                      return (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${paidNow ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>
                            {paidNow ? "Paid" : "Unpaid"}
                          </span>
                          {paidNow && <PaymentMethodBadge method={sub.payment_method} />}
                          {paidNow && sub.payment_reference && <PaymentReference method={sub.payment_method} reference={sub.payment_reference} />}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
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
                    {sub.status === "expired" && (
                      <Button size="sm" className="gap-1 rounded-full bg-green-600 text-white hover:bg-green-600/90"
                        onClick={() => setConfirmAction({ sub, action: "reactivate" })}>
                        <RefreshCw className="h-3.5 w-3.5" /> Reactivate
                      </Button>
                    )}
                    {sub.status !== "cancelled" && sub.status !== "expired" && (
                      <Button size="sm" variant="ghost"
                        className="gap-1 rounded-full text-destructive hover:text-destructive"
                        onClick={() => setConfirmAction({ sub, action: "cancel" })}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-full text-xs"
                      onClick={() => paymentMutation.mutate({ sub, paid: (sub.payment_status ?? "paid") !== "paid" })}>
                      {(sub.payment_status ?? "paid") === "paid" ? "Mark unpaid" : "Mark paid"}
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-full text-xs"
                      onClick={() => { setSelectedSub(sub); setAdminNotes(sub.admin_notes ?? ""); }}>
                      Notes
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminListShell>
      </div>

      {/* ─── Create subscription dialog ──────────────────────────────────── */}
      <Dialog open={createDialog} onOpenChange={(o) => { if (!o) setCreateDialog(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Restaurant */}
            <div>
              <Label>Restaurant *</Label>
              <Select
                value={form.provider_id}
                onValueChange={(v) => setForm((f) => ({ ...f, provider_id: v, meal_plan_id: "" }))}
              >
                <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
                <SelectContent>
                  {restaurants.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Meal Plan */}
            <div>
              <Label>Meal Plan</Label>
              <Select
                value={form.meal_plan_id || "_none"}
                onValueChange={(v) => onPlanChange(v === "_none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No specific plan</SelectItem>
                  {plansForProvider(form.provider_id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatUSD(p.weekly_price_cents)}/week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer info */}
            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
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

            {/* Pricing & duration */}
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

            {/* Total */}
            <div className="flex justify-between rounded-xl bg-muted/50 p-3">
              <span className="font-bold">Total</span>
              <span className="font-black text-orange-400">
                {formatUSD(form.weekly_price_cents * form.commitment_weeks)}
              </span>
            </div>

            {/* Status & notes */}
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
              disabled={!form.provider_id || !form.customer_name.trim() || createMutation.isPending}
            >
              {createMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Create Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Admin notes dialog ──────────────────────────────────────────── */}
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

      {/* ─── Action confirmation ─────────────────────────────────────────── */}
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
    </SuperAdminLayout>
  );
};

export default FoodSubscriptions;
