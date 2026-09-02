import type { Entitlement } from "@/lib/plans/entitlements";
import { useEffect, useMemo, useState } from "react";
import { fetchPlanGallery, savePlanGallery } from "@/lib/plans/planGallery";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Copy, Edit3, Package, Plus, RotateCcw, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { MobileActionSheet } from "@/components/admin/MobileActionSheet";
import { ServiceLocationsEditor } from "@/components/admin/ServiceLocationsEditor";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Textarea } from "@/components/ui/textarea";
import { PlanForm, type PlanFormValues } from "@/components/provider/plans/PlanForm";
import { StatusPill } from "@/components/patterns/StatusPill";
import { cn } from "@/lib/utils";
import {
  formatFrequencyLabel,
  formatPricingLabel,
  monthlyCleaningEstimate,
  normalizeFrequencyUnit,
  normalizePricingMode,
  resolveMonthlyPriceCents,
  validateCleaningPlanPricing,
} from "@/lib/cleaningPlanPricing";
import { BookingCalendarOverride } from "@/components/provider/BookingCalendarOverride";
import { formatUSD } from "@/lib/pricing";

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanFilter = "all" | "public" | "private" | "draft" | "archived";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  price_per_cleaning_cents: number;
  monthly_price_cents: number | null;
  cleanings_per_month: number;
  frequency_unit: string;
  frequency_count: number | null;
  custom_frequency_label: string | null;
  pricing_mode: string;
  features: string[];
  apartment_type: string;
  visibility: string;
  status: string;
  service_frequency: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Per-plan booking calendar override. NULL = inherit from provider. */
  booking_settings: unknown | null;
};

const EMPTY_PLAN: Partial<Plan> = {
  name: "",
  description: "",
  short_description: "",
  price_per_cleaning_cents: 0,
  monthly_price_cents: 0,
  cleanings_per_month: 4,
  frequency_unit: "month",
  frequency_count: 4,
  custom_frequency_label: "",
  pricing_mode: "price_per_cleaning",
  features: [],
  apartment_type: "any",
  visibility: "public",
  status: "active",
  service_frequency: "weekly",
  sort_order: 0,
  booking_settings: null,
};

const formatMonthly = (plan: Plan) => formatUSD(resolveMonthlyPriceCents(plan));


// ─── Page ────────────────────────────────────────────────────────────────────

const CleaningPlans = ({
  embedded = false,
  providerId,
}: {
  embedded?: boolean;
  /** When mounted inside a provider workspace, scopes every query + write to
   *  this provider's cleaning_packages. Absent = platform-wide admin view. */
  providerId?: string;
} = {}) => {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const adminId = userData?.id || "admin";
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string; status: string } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: plans = [], isLoading } = useQuery({
    // Cache-key includes providerId so admin (all plans) and each embedded
    // provider mount don't share results.
    queryKey: ["admin-cleaning-plans", providerId ?? "all"],
    queryFn: async () => {
      let q = supabaseDb
        .from("cleaning_packages")
        .select("*")
        .order("sort_order", { ascending: true });
      if (providerId) q = q.eq("provider_id", providerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  // Subscriber counts scoped to just this provider's plans when embedded, so a
  // cleaning owner opening Offerings doesn't see counts computed against other
  // providers' packages.
  const planIdsForCount = useMemo(() => plans.map((p) => p.id), [plans]);
  const { data: subscriberCounts = {} } = useQuery({
    queryKey: ["admin-plan-subscriber-counts", providerId ?? "all", planIdsForCount.join(",")],
    enabled: !providerId || planIdsForCount.length > 0,
    queryFn: async () => {
      // Paged — this reduces to a per-plan subscriber count.
      const data = await fetchAllRows<any>(() => {
        let q = supabaseDb
          .from("cleaning_subscriptions")
          .select("package_id")
          .eq("payment_status", "paid").order("id");
        if (providerId) q = q.in("package_id", planIdsForCount);
        return q;
      });
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.package_id] = (counts[row.package_id] || 0) + 1;
      }
      return counts;
    },
  });

  const { data: clients = [] } = useQuery({
    // providerId is part of the key: the unscoped list must not be served from
    // cache to an embedded provider (or vice-versa).
    queryKey: ["admin-cleaning-clients-for-assign", providerId ?? "all", planIdsForCount.join(",")],
    enabled: !providerId || planIdsForCount.length > 0,
    queryFn: async () => {
      // `cleaning_clients` has no provider_id — a client belongs to a provider
      // only by having a subscription to one of that provider's packages.
      //
      // Embedded in a provider workspace this list MUST be scoped: it was
      // fetching every client on the platform, so one cleaning provider could
      // read (and assign plans to) every other provider's customer list.
      let clientIds: string[] | null = null;
      if (providerId) {
        // Paged: a clipped page here would silently drop customers from the
        // provider's own assignable list.
        const subs = await fetchAllRows<any>(() => supabaseDb
          .from("cleaning_subscriptions")
          .select("client_id")
          .in("package_id", planIdsForCount)
          .not("client_id", "is", null).order("id"));
        clientIds = Array.from(
          new Set(subs.map((s: any) => String(s.client_id)).filter(Boolean)),
        );
        // No customers yet → nothing to assign. Returning early also avoids
        // `.in("id", [])`, which PostgREST rejects.
        if (clientIds.length === 0) return [];
      }

      let q = supabaseDb
        .from("cleaning_clients")
        .select("id, company_name, email")
        .is("deleted_at", null)
        .order("company_name");
      if (clientIds) q = q.in("id", clientIds);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["admin-plan-assignments", providerId ?? "all", planIdsForCount.join(",")],
    enabled: !providerId || planIdsForCount.length > 0,
    queryFn: async () => {
      let q = supabaseDb
        .from("cleaning_plan_client_assignments")
        .select("*")
        .order("created_at", { ascending: false });
      // Scope: only assignments for THIS provider's plans when embedded.
      if (providerId) q = q.in("plan_id", planIdsForCount);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const savePlanMutation = useMutation({
    mutationFn: async (plan: Partial<Plan> & { id?: string }) => {
      const { id, created_at, updated_at, is_active: _ignored, __gallery, ...fields } = plan as any;
      // Derived, never typed. The form's Status select is the only control for
      // "is this plan live", but is_active was stripped from every payload —
      // so a plan switched off in the database could not be switched back on
      // from the admin at all, and a plan set to Draft stayed is_active=true.
      // Only when status is actually being written: a payload without it is a
      // partial edit, and deriving from `undefined` would silently retire the
      // plan on a save that never mentioned its status.
      if (fields.status !== undefined) fields.is_active = fields.status === "active";
      // When embedded inside a provider workspace, force provider_id onto every
      // insert so a plan created there always belongs to the current provider.
      // Absent this, EMPTY_PLAN had no provider_id → new rows landed NULL and
      // were invisible in every provider-scoped catalog lookup.
      if (providerId && !id) fields.provider_id = providerId;
      if (id) {
        let q = supabaseDb.from("cleaning_packages").update(fields).eq("id", id);
        // Embedded: refuse to touch a row that isn't this provider's, even if
        // an id from elsewhere reaches this mutation. `.eq("id", …)` alone
        // trusted whatever id it was handed.
        if (providerId) q = q.eq("provider_id", providerId);
        const { error } = await q;
        if (error) throw error;
        // The photographs belong to the mirror, not to this table — the trigger
        // never overwrites them, so they survive every later edit here.
        if (__gallery) await savePlanGallery("cleaning", id, __gallery);
        await logAuditEvent(adminId, "edit", "plan", id, fields);
      } else {
        const { data, error } = await supabaseDb
          .from("cleaning_packages")
          .insert(fields)
          .select()
          .single();
        if (error) throw error;
        if (__gallery && data?.id) await savePlanGallery("cleaning", data.id, __gallery);
        await logAuditEvent(adminId, "create", "plan", data?.id, fields);
      }
    },
    onSuccess: () => {
      toast.success(editingPlan ? "Plan updated" : "Plan created");
      queryClient.invalidateQueries({ queryKey: ["admin-cleaning-plans"] });
      queryClient.invalidateQueries({ queryKey: ["cleaning-packages"] });
      setFormOpen(false);
      setEditingPlan(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      const { id, created_at, updated_at, is_active: _ignored, ...fields } = plan as any;
      // A duplicate is a draft, so it must not be live. Copying the source
      // plan's is_active published "(Copy)" to the storefront on the spot.
      const insertFields: Record<string, unknown> = {
        ...fields, name: `${plan.name} (Copy)`, status: "draft", is_active: false,
        sort_order: plans.length,
      };
      // Preserve provider ownership on duplicate. If somehow the source plan
      // has no provider_id (legacy row) and we're embedded, stamp it too.
      if (providerId) insertFields.provider_id = providerId;
      const { data, error } = await supabaseDb
        .from("cleaning_packages")
        .insert(insertFields)
        .select()
        .single();
      if (error) throw error;
      await logAuditEvent(adminId, "create", "plan", data?.id, { duplicated_from: plan.id });
    },
    onSuccess: () => {
      toast.success("Plan duplicated as draft");
      queryClient.invalidateQueries({ queryKey: ["admin-cleaning-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archivePlanMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabaseDb
        .from("cleaning_packages")
        // is_active is the legacy twin of status and every read site still
        // checks it. Writing status alone left an archived plan is_active=true,
        // so "Archive" removed the badge and nothing else — the plan kept
        // selling. The two move together now; status is the one an admin sets.
        .update({ status, is_active: status === "active" })
        .eq("id", id);
      if (error) throw error;
      await logAuditEvent(adminId, status === "archived" ? "archive" : "restore", "plan", id, { status });
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "archived" ? "Plan archived" : "Plan reactivated");
      queryClient.invalidateQueries({ queryKey: ["admin-cleaning-plans"] });
      queryClient.invalidateQueries({ queryKey: ["cleaning-packages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignClientMutation = useMutation({
    mutationFn: async (data: { plan_id: string; client_id: string; notes?: string }) => {
      const { error } = await supabaseDb
        .from("cleaning_plan_client_assignments")
        .insert(data);
      if (error) throw error;
      await logAuditEvent(adminId, "assign_plan", "assignment", data.plan_id, data);
    },
    onSuccess: () => {
      toast.success("Client assigned to plan");
      queryClient.invalidateQueries({ queryKey: ["admin-plan-assignments"] });
      setAssignOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] = useState<{ id: string; label: string } | null>(null);

  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { id: string; notes?: string | null; status?: string }) => {
      const { id, ...fields } = data;
      const { error } = await supabaseDb
        .from("cleaning_plan_client_assignments")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await logAuditEvent(adminId, "update_assignment", "assignment", id, fields);
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["admin-plan-assignments"] });
      setEditingAssignment(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb
        .from("cleaning_plan_client_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await logAuditEvent(adminId, "delete_assignment", "assignment", id, {});
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      queryClient.invalidateQueries({ queryKey: ["admin-plan-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Derived ──────────────────────────────────────────────────────────────

  const filteredPlans = useMemo(() => {
    if (filter === "all") return plans;
    if (filter === "public") return plans.filter((p) => p.visibility === "public" && p.status === "active");
    if (filter === "private") return plans.filter((p) => p.visibility === "private");
    if (filter === "draft") return plans.filter((p) => p.status === "draft");
    if (filter === "archived") return plans.filter((p) => p.status === "archived");
    return plans;
  }, [plans, filter]);

  const plansPager = usePagination(filteredPlans, 20);

  const stats = useMemo(() => ({
    total: plans.length,
    public: plans.filter((p) => p.visibility === "public" && p.status === "active").length,
    private: plans.filter((p) => p.visibility === "private").length,
    draft: plans.filter((p) => p.status === "draft").length,
  }), [plans]);

  const FILTERS: { label: string; value: PlanFilter; count: number }[] = [
    { label: "All", value: "all", count: stats.total },
    { label: "Public", value: "public", count: stats.public },
    { label: "Private", value: "private", count: stats.private },
    { label: "Draft", value: "draft", count: stats.draft },
    { label: "Archived", value: "archived", count: plans.filter((p) => p.status === "archived").length },
  ];

  const visibleAssignments = useMemo(
    () =>
      assignments
        .map((assignment: any) => ({
          ...assignment,
          plan: plans.find((plan) => plan.id === assignment.plan_id),
          client: clients.find((client: any) => client.id === assignment.client_id),
        }))
        .filter((assignment: any) => assignment.plan && assignment.client),
    [assignments, clients, plans],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openCreate = () => { setEditingPlan(null); setFormOpen(true); };
  const openEdit = (plan: Plan) => { setEditingPlan(plan); setFormOpen(true); };

  // ── Render ───────────────────────────────────────────────────────────────

  const body = (
    <div className="space-y-4">
      {/* Stats — flat cards, primary-tint plaque, matches ProviderAnalyticsWidget */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total Plans", value: stats.total,   icon: Package,      tint: "bg-primary/15 text-primary" },
          { label: "Public",      value: stats.public,  icon: SparklesIcon, tint: "bg-primary/15 text-primary" },
          { label: "Private",     value: stats.private, icon: Package,      tint: "bg-muted text-muted-foreground" },
          { label: "Draft",       value: stats.draft,   icon: Package,      tint: "bg-muted text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-radius-md bg-card p-4">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md", s.tint)}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 text-lg font-black leading-tight tabular-nums text-foreground">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips + primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  on
                    ? "bg-primary/15 text-primary ring-1 ring-primary"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}{f.count > 0 && <span className="ml-1 opacity-70">· {f.count}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAssignOpen(true)}>Assign to client</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />New plan</Button>
        </div>
      </div>

      {/* Plans list — single card list on every viewport (kills the desktop
          Table so mobile-first stays consistent). Each row: plan name +
          visibility/status chips + freq/price/subs meta + ⋯ menu. */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading plans…</div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-radius-lg bg-card py-12 text-center text-sm text-muted-foreground">No plans match this filter</div>
      ) : (
        <div className="space-y-2">
          {plansPager.paged.map((plan) => (
            <div key={plan.id} className="flex items-center gap-3 rounded-radius-md bg-card p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md bg-primary/15 text-primary">
                <SparklesIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{plan.name}</p>
                  <StatusPill status={plan.visibility} />
                  <StatusPill status={plan.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatMonthly(plan)} · {formatFrequencyLabel(plan)} · {subscriberCounts[plan.id] || 0} subs
                </p>
              </div>
              <MobileActionSheet
                title={plan.name}
                actions={[
                  { label: "Edit", icon: <Edit3 className="h-4 w-4" />, onClick: () => openEdit(plan) },
                  { label: "Duplicate", icon: <Copy className="h-4 w-4" />, onClick: () => duplicatePlanMutation.mutate(plan) },
                  {
                    label: plan.status !== "archived" ? "Archive" : "Reactivate",
                    icon: plan.status !== "archived" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />,
                    onClick: () => setArchiveTarget({ id: plan.id, name: plan.name, status: plan.status === "archived" ? "active" : "archived" }),
                    danger: plan.status !== "archived",
                  },
                ]}
              />
            </div>
          ))}
          <TablePagination {...plansPager} onPage={plansPager.setPage} />
        </div>
      )}

      {/* Client Assignments — matching row style */}
      {visibleAssignments.length > 0 && (
        <section className="space-y-2">
          <div className="px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Client assignments · <span className="tabular-nums">{visibleAssignments.length}</span>
            </p>
          </div>
          <div className="space-y-2">
            {visibleAssignments.map((assignment: any) => (
              <div key={assignment.id} className="flex items-center gap-3 rounded-radius-md bg-card p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-foreground">{assignment.client.company_name}</p>
                    <StatusPill status={assignment.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {assignment.plan.name}
                    
                  </p>
                  {assignment.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{assignment.notes}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditingAssignment({ ...assignment })}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setAssignmentToDelete({ id: assignment.id, label: assignment.plan?.name || "assignment" })}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Plan Form Sheet */}
      <PlanFormSheet
        open={formOpen}
        plan={editingPlan}
        onClose={() => { setFormOpen(false); setEditingPlan(null); }}
        onSave={(data) => savePlanMutation.mutate(data)}
        saving={savePlanMutation.isPending}
      />

      {/* Assign Client Sheet */}
      <AssignClientSheet
        open={assignOpen}
        plans={plans.filter((p) => p.visibility === "private" && p.status === "active")}
        allPlans={plans.filter((p) => p.status === "active")}
        clients={clients}
        onClose={() => setAssignOpen(false)}
        onAssign={(data) => assignClientMutation.mutate(data)}
        saving={assignClientMutation.isPending}
      />

      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{archiveTarget?.status === "archived" ? "Archive plan?" : "Reactivate plan?"}</DialogTitle>
            <DialogDescription>
              {archiveTarget?.status === "archived"
                ? "Archived plans are removed from active selling surfaces but stay available for audit history."
                : "This plan will become active again and available to admins."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button
              variant={archiveTarget?.status === "archived" ? "destructive" : "default"}
              loading={archivePlanMutation.isPending}
              onClick={() => {
                if (!archiveTarget) return;
                archivePlanMutation.mutate(
                  { id: archiveTarget.id, status: archiveTarget.status },
                  { onSuccess: () => setArchiveTarget(null) },
                );
              }}
            >
              {archiveTarget?.status === "archived" ? "Archive" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Assignment Dialog */}
      {/* Confirm before deleting a plan assignment. Replaces `window.confirm`
          — every other admin page uses AlertDialog, and native prompts are
          too easy to muscle-memory through. */}
      <AlertDialog
        open={assignmentToDelete !== null}
        onOpenChange={(open) => !open && setAssignmentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {assignmentToDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This unassigns the plan from this residence. Customers already subscribed keep their subscription; only new sign-ups are affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (assignmentToDelete) deleteAssignmentMutation.mutate(assignmentToDelete.id);
                setAssignmentToDelete(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(editingAssignment)} onOpenChange={(open) => !open && setEditingAssignment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>
              {editingAssignment?.client?.company_name} → {editingAssignment?.plan?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Notes</Label>
              <Textarea
                value={editingAssignment?.notes ?? ""}
                onChange={(e) => setEditingAssignment((a: any) => ({ ...a, notes: e.target.value }))}
                placeholder="Assignment notes"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editingAssignment?.status || "active"} onValueChange={(v) => setEditingAssignment((a: any) => ({ ...a, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingAssignment(null)}>Cancel</Button>
            <Button
              loading={updateAssignmentMutation.isPending}
              onClick={() => {
                if (!editingAssignment) return;
                updateAssignmentMutation.mutate({
                  id: editingAssignment.id,
                  notes: editingAssignment.notes || null,
                  status: editingAssignment.status,
                });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) return body;
  return <SuperAdminLayout title="Cleaning Plans">{body}</SuperAdminLayout>;
};

// Tone helpers — pill background/text per visibility & status. Keeps the
// unified admin-plans list on the same palette as the rest of the app.
// statusTone / visibilityTone lived here and disagreed with the rest of the
// platform: `cancelled` rendered neutral grey where every other list showed it
// in the destructive tone, and `draft` was amber against neutral elsewhere.
// StatusPill owns both — public/private are in its table too, as listing
// visibility.

// Cleaning is the only service with somewhere to prepare a plan and somewhere
// to retire it to. Draft and Archived are both "not for sale" — the storefront
// filters on status = active — they differ in whether the plan was ever live.
const CLEANING_STATUSES = [
  { value: "draft", label: "Draft — not for sale yet" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived — retired" },
] as const;

// ─── Plan Form Sheet ─────────────────────────────────────────────────────────

function PlanFormSheet({
  open, plan, onClose, onSave, saving,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>({ ...EMPTY_PLAN });
  const [featuresText, setFeaturesText] = useState("");
  const [notIncludedText, setNotIncludedText] = useState("");
  /**
   * The plan's photographs. They live on the universal mirror rather than on
   * `cleaning_packages`, so they are loaded and saved beside the row instead of
   * with it — see lib/plans/planGallery.
   */
  const [gallery, setGallery] = useState<string[]>([]);
  /** Which courts/rooms this plan opens. Empty = all of them. */
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  /** Lines beyond the first — the first is this form's quantity/unit. */
  const [extraEntitlements, setExtraEntitlements] = useState<Entitlement[]>([]);

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setForm({
        ...plan,
        frequency_unit: normalizeFrequencyUnit(plan.frequency_unit),
        frequency_count: plan.frequency_count ?? plan.cleanings_per_month ?? 4,
        pricing_mode: normalizePricingMode(plan.pricing_mode),
        monthly_price_cents: plan.monthly_price_cents ?? resolveMonthlyPriceCents(plan),
      });
      setFeaturesText((plan.features || []).join("\n"));
      setNotIncludedText((plan.not_included || []).join("\n"));
      void fetchPlanGallery("cleaning", plan.id).then(setGallery);
      return;
    }
    setForm({ ...EMPTY_PLAN });
    setGallery([]);
    setFeaturesText("");
    setNotIncludedText("");
  }, [open, plan]);

  const handleSave = () => {
    const features = featuresText.split("\n").map((s) => s.trim()).filter(Boolean);
    const not_included = notIncludedText.split("\n").map((s) => s.trim()).filter(Boolean);
    const normalized = {
      ...form,
      pricing_mode: normalizePricingMode(form.pricing_mode),
      frequency_unit: normalizeFrequencyUnit(form.frequency_unit),
      frequency_count: form.frequency_unit === "custom" ? null : Number(form.frequency_count) || 0,
      custom_frequency_label: form.frequency_unit === "custom" ? String(form.custom_frequency_label || "").trim() : null,
      monthly_price_cents: form.monthly_price_cents === "" || form.monthly_price_cents == null
        ? null
        : Math.round(Number(form.monthly_price_cents) || 0),
      price_per_cleaning_cents: form.price_per_cleaning_cents === "" || form.price_per_cleaning_cents == null
        ? null
        : Math.round(Number(form.price_per_cleaning_cents) || 0),
    };
    normalized.service_frequency = formatFrequencyLabel(normalized);
    const validationError = validateCleaningPlanPricing(normalized);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    onSave({
      ...normalized,
      features,
      not_included,
      __gallery: gallery,
      cleanings_per_month: monthlyCleaningEstimate(normalized) || Number(form.cleanings_per_month) || 0,
      sort_order: Number(form.sort_order) || 0,
    });
  };

  const set = (field: string, value: any) => setForm((f: any) => ({ ...f, [field]: value }));

  // ── Bridge to the shared PlanForm ────────────────────────────────────────
  // cleaning_packages keeps its own columns; this only presents them in the
  // common vocabulary. The quantity shown is the MONTHLY one, because that is
  // what the monthly price is set against — a plan at "6 per week" reads to the
  // customer as 26 cleanings a month, which is also its cleanings_per_month.
  const planFormValues: PlanFormValues = {
    name: form.name ?? "",
    description: form.description ?? "",
    priceCents: Number(form.monthly_price_cents) || 0,
    quantity: monthlyCleaningEstimate(form) || null,
    period: "monthly",
    unit: "cleaning",
    features: featuresText.split("\n"),
    gallery,
    resourceIds,
    extraEntitlements,
    status: form.status ?? "active",
    // The column cleaning has had all along, now edited through the shared
    // control instead of a switch of its own.
    visibility: form.visibility === "private" ? "private" : "public",
    sortOrder: Number(form.sort_order) || 0,
  };

  const applyPlanFormPatch = (patch: Partial<PlanFormValues>) => {
    if (patch.gallery !== undefined) setGallery(patch.gallery);
    if (patch.resourceIds !== undefined) setResourceIds(patch.resourceIds);
    if (patch.extraEntitlements !== undefined) setExtraEntitlements(patch.extraEntitlements);
    if (patch.features !== undefined) setFeaturesText(patch.features.join("\n"));
    setForm((f: any) => ({
      ...f,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.priceCents !== undefined && { monthly_price_cents: patch.priceCents }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.visibility !== undefined && { visibility: patch.visibility }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
    }));
    // quantity / period / unit are not editable here — the schedule is set by
    // frequency count + unit in `extras`, which cleaning needs because it also
    // sells per day and per week.
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{plan ? "Edit Plan" : "New Cleaning Plan"}</SheetTitle>
          <SheetDescription>{plan ? "Update plan details" : "Create a new cleaning plan"}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* The shared plan form. cleaning_packages keeps every one of its
              columns and both pricing modes; only the layout is common now, so
              a provider who also runs a restaurant meets the same fields in the
              same order. Everything cleaning-specific goes through `extras`.

              Short Description is gone from the form: it was written here and
              read by nothing on the platform. The column and its values survive
              untouched — the save spreads the loaded row — so nothing is lost
              if something starts using it. */}
          <PlanForm
            values={planFormValues}
            onChange={applyPlanFormPatch}
            priceLabel="Monthly price"
            priceHint={
              normalizePricingMode(form.pricing_mode) === "price_per_cleaning"
                ? `Derived from the per-cleaning price below: ${formatUSD(resolveMonthlyPriceCents(form))}/month`
                : `What the customer is billed each month. Resolved: ${formatUSD(resolveMonthlyPriceCents(form))}/month`
            }
            fixedUnit="cleaning"
            // The real controls are frequency count + unit in `extras`, because
            // cleaning schedules per day and per week as well as per month. The
            // preview above still reads in the customer's terms — "26 cleanings
            // a month" — which is the figure the monthly price is set against.
            hideQuantity
            statuses={CLEANING_STATUSES}
            featuresLabel="What's included"
            featuresPlaceholder={"Full apartment cleaning\nKitchen: counters, sink & stovetop\nBathroom: toilet, sink & shower\nFloors – mopping & sweeping\nDusting all surfaces\nTrash removal"}
            extras={
              <>
                {/* ── How often ──────────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>How many</Label>
                    <Input
                      type="number"
                      value={form.frequency_count ?? ""}
                      onChange={(e) => set("frequency_count", e.target.value)}
                      min={1}
                      disabled={form.frequency_unit === "custom"}
                    />
                  </div>
                  <div>
                    <Label>How often</Label>
                    <Select value={form.frequency_unit} onValueChange={(v) => set("frequency_unit", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Per day</SelectItem>
                        <SelectItem value="week">Per week</SelectItem>
                        <SelectItem value="month">Per month</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.frequency_unit === "custom" && (
                  <div>
                    <Label>Custom schedule label</Label>
                    <Input
                      value={form.custom_frequency_label || ""}
                      onChange={(e) => set("custom_frequency_label", e.target.value)}
                      placeholder="e.g. Alternate Tuesdays"
                    />
                  </div>
                )}

                <p className="-mt-1 text-xs text-muted-foreground">
                  Service frequency: <span className="font-medium text-foreground">{formatFrequencyLabel(form)}</span>
                </p>

                {/* ── The second price, and which of the two rules ────────── */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Price per cleaning ($)</Label>
                    <Input
                      type="number" min={0} step={0.01} inputMode="decimal"
                      value={centsInputValue(form.price_per_cleaning_cents)}
                      onChange={(e) => set("price_per_cleaning_cents", dollarsToCents(e.target.value))}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      = {formatUSD(Number(form.price_per_cleaning_cents) || 0)} each
                    </p>
                  </div>
                  <div>
                    <Label>Which price rules</Label>
                    <Select value={form.pricing_mode} onValueChange={(v) => set("pricing_mode", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_monthly_price">The monthly price</SelectItem>
                        <SelectItem value="price_per_cleaning">Price per cleaning × count</SelectItem>
                        <SelectItem value="calculated_estimate">Calculated estimate</SelectItem>
                        <SelectItem value="custom_manual">Custom manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Apartment type</Label>
                  <Select value={form.apartment_type} onValueChange={(v) => set("apartment_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="studio">Studio</SelectItem>
                      <SelectItem value="1br">1 Bedroom</SelectItem>
                      <SelectItem value="2br">2 Bedroom</SelectItem>
                      <SelectItem value="3br+">3+ Bedroom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            }
            footer={
              <>
                <div>
                  <Label>Not included by default (one per line)</Label>
                  <Textarea
                    value={notIncludedText}
                    onChange={(e) => setNotIncludedText(e.target.value)}
                    placeholder={"Laundry or folding clothes\nInside oven or refrigerator\nWindow cleaning\nSpecialized services unless requested"}
                    rows={4}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Each line becomes an ✗ item in the collapsible "Not included" section.</p>
                </div>

              </>
            }
          />

          {plan?.id && (
            <div className="border-t border-border pt-4">
              <ServiceLocationsEditor
                table="cleaning_package_residences" itemColumn="package_id" itemId={plan.id}
                title="Available in locations"
                description="Pick where this plan is offered. Leave empty to offer it everywhere."
              />
            </div>
          )}

          {/* Per-plan booking calendar override — shared primitive. NULL means
              the plan inherits the provider's calendar; flipping the switch
              on gives this plan its own schedule (great for premium/deep
              plans with different working windows). */}
          <BookingCalendarOverride
            value={form.booking_settings ?? null}
            onChange={(next) => set("booking_settings", next)}
            entityLabel="This plan"
          />

          <Button className="w-full" size="xl" onClick={handleSave} loading={saving} disabled={!form.name?.trim()}>
            {plan ? "Save Changes" : "Create Plan"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Dollars in the box, cents in the column. Same conversion the shared PlanForm
// uses, so the two forms behave identically when a provider moves between them.
function centsInputValue(cents: unknown): string {
  const n = Number(cents);
  return cents === null || cents === undefined || cents === "" || !Number.isFinite(n) || n === 0
    ? ""
    : (n / 100).toString();
}

function dollarsToCents(input: string): number | null {
  if (input.trim() === "") return null;
  const n = Number.parseFloat(input);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// ─── Assign Client Sheet ─────────────────────────────────────────────────────

function AssignClientSheet({
  open, plans, allPlans, clients, onClose, onAssign, saving,
}: {
  open: boolean;
  plans: Plan[];
  allPlans: Plan[];
  clients: any[];
  onClose: () => void;
  onAssign: (data: any) => void;
  saving: boolean;
}) {
  const [planId, setPlanId] = useState("");
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");

  const activePlans = allPlans.length > 0 ? allPlans : plans;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>Assign Plan to Client</SheetTitle>
          <SheetDescription>Link a cleaning plan to a specific client with optional custom pricing</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div>
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
              <SelectContent>
                {activePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.visibility})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name} {c.email ? `(${c.email})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes about this assignment" />
          </div>

          <Button
            className="w-full"
            size="xl"
            onClick={() => onAssign({
              plan_id: planId,
              client_id: clientId,
              notes: notes || null,
            })}
            loading={saving}
            disabled={!planId || !clientId}
          >
            Assign Client
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CleaningPlans;
