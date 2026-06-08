import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Copy, Edit3, Package, Plus, RotateCcw, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { MobileActionSheet } from "@/components/admin/MobileActionSheet";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { supabaseDb } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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
};

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatMonthly = (plan: Plan) => formatCents(resolveMonthlyPriceCents(plan));

const visibilityColor = (v: string) => v === "public" ? "default" : "secondary";
const statusColor = (s: string) => {
  if (s === "active") return "default";
  if (s === "draft") return "outline";
  return "secondary";
};

// ─── Page ────────────────────────────────────────────────────────────────────

const CleaningPlans = () => {
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
    queryKey: ["admin-cleaning-plans"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_packages")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const { data: subscriberCounts = {} } = useQuery({
    queryKey: ["admin-plan-subscriber-counts"],
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("package_id")
        .eq("payment_status", "paid");
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        counts[row.package_id] = (counts[row.package_id] || 0) + 1;
      }
      return counts;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-cleaning-clients-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_clients")
        .select("id, company_name, email")
        .order("company_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["admin-plan-assignments"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_plan_client_assignments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const savePlanMutation = useMutation({
    mutationFn: async (plan: Partial<Plan> & { id?: string }) => {
      const { id, created_at, updated_at, is_active, ...fields } = plan as any;
      if (id) {
        const { error } = await supabaseDb
          .from("cleaning_packages")
          .update(fields)
          .eq("id", id);
        if (error) throw error;
        await logAuditEvent(adminId, "edit", "plan", id, fields);
      } else {
        const { data, error } = await supabaseDb
          .from("cleaning_packages")
          .insert(fields)
          .select()
          .single();
        if (error) throw error;
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
      const { id, created_at, updated_at, is_active, ...fields } = plan as any;
      const { data, error } = await supabaseDb
        .from("cleaning_packages")
        .insert({ ...fields, name: `${plan.name} (Copy)`, status: "draft", sort_order: plans.length })
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
        .update({ status })
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
    mutationFn: async (data: { plan_id: string; client_id: string; custom_price_cents?: number; notes?: string }) => {
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

  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: { id: string; custom_price_cents?: number | null; notes?: string | null; status?: string }) => {
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

  return (
    <SuperAdminLayout title="Cleaning Plans">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-space-2 md:grid-cols-4 md:gap-space-3">
        {[
          { label: "Total Plans", value: stats.total, icon: Package },
          { label: "Public", value: stats.public, icon: SparklesIcon },
          { label: "Private", value: stats.private, icon: Package },
          { label: "Draft", value: stats.draft, icon: Package },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="px-space-4 py-space-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <s.icon className="h-4 w-4" />{s.label}
              </p>
              <p className="mt-0.5 text-2xl font-extrabold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions bar */}
      <div className="mt-space-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-space-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {f.label} {f.count > 0 && <span className="ml-1 opacity-60">{f.count}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-space-2">
          <Button variant="secondary" onClick={() => setAssignOpen(true)}>Assign to Client</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4" />New Plan</Button>
        </div>
      </div>

      {/* Plans table */}
      <Card className="mt-space-3">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading plans...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No plans match this filter</div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {filteredPlans.map((plan) => (
                  <div key={plan.id} className="flex items-center gap-3 px-space-4 py-space-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="font-semibold text-foreground truncate">{plan.name}</p>
                        <p className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">{formatMonthly(plan)}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant={visibilityColor(plan.visibility)} className="text-[10px] px-1.5 py-0">{plan.visibility}</Badge>
                        <Badge variant={statusColor(plan.status)} className="text-[10px] px-1.5 py-0">{plan.status}</Badge>
                        <span className="text-[11px] text-muted-foreground">{formatFrequencyLabel(plan)} · {subscriberCounts[plan.id] || 0} subs</span>
                      </div>
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
              </div>

              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-10 px-space-3">Plan</TableHead>
                      <TableHead className="h-10 px-space-3">Price / mo</TableHead>
                      <TableHead className="h-10 px-space-3">Frequency</TableHead>
                      <TableHead className="h-10 px-space-3">Visibility</TableHead>
                      <TableHead className="h-10 px-space-3">Status</TableHead>
                      <TableHead className="h-10 px-space-3">Subscribers</TableHead>
                      <TableHead className="h-10 px-space-3 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="px-space-3 py-space-3">
                          <div>
                            <p className="font-semibold text-foreground">{plan.name}</p>
                            <p className="text-xs text-muted-foreground">{plan.apartment_type === "any" ? "All types" : plan.apartment_type}</p>
                          </div>
                        </TableCell>
                        <TableCell className="px-space-3 py-space-3">
                          <p className="font-mono font-semibold">{formatMonthly(plan)}</p>
                          <p className="text-xs text-muted-foreground">{formatPricingLabel(plan)}</p>
                        </TableCell>
                        <TableCell className="px-space-3 py-space-3 text-sm">{formatFrequencyLabel(plan)}</TableCell>
                        <TableCell className="px-space-3 py-space-3"><Badge variant={visibilityColor(plan.visibility)}>{plan.visibility}</Badge></TableCell>
                        <TableCell className="px-space-3 py-space-3"><Badge variant={statusColor(plan.status)}>{plan.status}</Badge></TableCell>
                        <TableCell className="px-space-3 py-space-3 text-center">{subscriberCounts[plan.id] || 0}</TableCell>
                        <TableCell className="px-space-3 py-space-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="tertiary" size="sm" onClick={() => openEdit(plan)}>Edit</Button>
                            <Button variant="tertiary" size="sm" onClick={() => duplicatePlanMutation.mutate(plan)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            {plan.status !== "archived" ? (
                              <Button variant="tertiary" size="sm" onClick={() => setArchiveTarget({ id: plan.id, name: plan.name, status: "archived" })}>
                                Archive
                              </Button>
                            ) : (
                              <Button variant="tertiary" size="sm" onClick={() => setArchiveTarget({ id: plan.id, name: plan.name, status: "active" })}>
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Client Assignments */}
      {visibleAssignments.length > 0 && (
        <Card className="mt-space-4">
          <CardContent className="px-space-4 py-space-3">
            <h3 className="mb-space-2 text-lg font-bold">Client Assignments</h3>
            <div className="divide-y divide-border">
              {visibleAssignments.map((assignment: any) => (
                <div key={assignment.id} className="flex items-center justify-between gap-3 py-space-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{assignment.client.company_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {assignment.plan.name}
                      {assignment.custom_price_cents ? ` · Custom: ${formatCents(assignment.custom_price_cents)}/mo` : ""}
                    </p>
                    {assignment.notes && <p className="text-xs text-muted-foreground">{assignment.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={assignment.status === "active" ? "default" : "secondary"}>{assignment.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setEditingAssignment({ ...assignment })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remove this assignment?")) deleteAssignmentMutation.mutate(assignment.id); }}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
              <Label>Custom Price (cents/month)</Label>
              <Input
                type="number"
                value={editingAssignment?.custom_price_cents ?? ""}
                onChange={(e) => setEditingAssignment((a: any) => ({ ...a, custom_price_cents: e.target.value === "" ? null : Number(e.target.value) }))}
                placeholder="Leave empty to use plan default"
              />
            </div>
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
                  custom_price_cents: editingAssignment.custom_price_cents || null,
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
    </SuperAdminLayout>
  );
};

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
      return;
    }
    setForm({ ...EMPTY_PLAN });
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
      cleanings_per_month: monthlyCleaningEstimate(normalized) || Number(form.cleanings_per_month) || 0,
      sort_order: Number(form.sort_order) || 0,
    });
  };

  const set = (field: string, value: any) => setForm((f: any) => ({ ...f, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{plan ? "Edit Plan" : "New Cleaning Plan"}</SheetTitle>
          <SheetDescription>{plan ? "Update plan details" : "Create a new cleaning plan"}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div>
            <Label>Plan Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Standard Weekly" />
          </div>

          <div>
            <Label>Short Description</Label>
            <Input value={form.short_description || ""} onChange={(e) => set("short_description", e.target.value)} placeholder="Brief one-liner" />
          </div>

          <div>
            <Label>Full Description</Label>
            <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="Detailed plan description" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Monthly Price (cents)</Label>
              <Input type="number" value={form.monthly_price_cents ?? ""} onChange={(e) => set("monthly_price_cents", e.target.value)} min={0} />
              <p className="mt-1 text-xs text-muted-foreground">
                = {formatCents(Number(form.monthly_price_cents) || 0)}/month
              </p>
            </div>
            <div>
              <Label>Price per Cleaning (cents)</Label>
              <Input type="number" value={form.price_per_cleaning_cents ?? ""} onChange={(e) => set("price_per_cleaning_cents", e.target.value)} min={0} />
              <p className="mt-1 text-xs text-muted-foreground">
                = {formatCents(Number(form.price_per_cleaning_cents) || 0)} per cleaning
              </p>
            </div>
          </div>

          <div>
            <Label>Pricing Mode</Label>
            <Select value={form.pricing_mode} onValueChange={(v) => set("pricing_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_monthly_price">Fixed monthly price</SelectItem>
                <SelectItem value="price_per_cleaning">Price per cleaning</SelectItem>
                <SelectItem value="calculated_estimate">Calculated estimate</SelectItem>
                <SelectItem value="custom_manual">Custom manual</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Final monthly estimate: {formatCents(resolveMonthlyPriceCents(form))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Frequency Count</Label>
              <Input
                type="number"
                value={form.frequency_count ?? ""}
                onChange={(e) => set("frequency_count", e.target.value)}
                min={1}
                disabled={form.frequency_unit === "custom"}
              />
            </div>
            <div>
              <Label>Frequency Unit</Label>
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

          <div>
            <Label>Optional Custom Frequency Label</Label>
            <Input
              value={form.custom_frequency_label || ""}
              onChange={(e) => set("custom_frequency_label", e.target.value)}
              placeholder="Custom schedule"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Service Frequency: {formatFrequencyLabel(form)}
            </p>
          </div>

          <div>
            <Label>Apartment Type</Label>
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

          <div>
            <Label>What's Included (one per line)</Label>
            <Textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              placeholder={"Full apartment cleaning\nKitchen: counters, sink & stovetop\nBathroom: toilet, sink & shower\nFloors – mopping & sweeping\nDusting all surfaces\nTrash removal"}
              rows={6}
            />
            <p className="mt-1 text-xs text-muted-foreground">Each line becomes a ✓ checklist item on the public page.</p>
          </div>

          <div>
            <Label>Not Included by Default (one per line)</Label>
            <Textarea
              value={notIncludedText}
              onChange={(e) => setNotIncludedText(e.target.value)}
              placeholder={"Laundry or folding clothes\nInside oven or refrigerator\nWindow cleaning\nSpecialized services unless requested"}
              rows={4}
            />
            <p className="mt-1 text-xs text-muted-foreground">Each line becomes an ✗ item shown in the collapsible "Not included" section.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Visibility</Label>
              <Select value={form.visibility} onValueChange={(v) => set("visibility", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Sort Order</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} min={0} />
          </div>

          <Button className="w-full" size="xl" onClick={handleSave} loading={saving} disabled={!form.name?.trim()}>
            {plan ? "Save Changes" : "Create Plan"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
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
  const [customPrice, setCustomPrice] = useState("");
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
            <Label>Custom Price Override (cents, optional)</Label>
            <Input type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Leave empty for default" />
            {customPrice && <p className="mt-1 text-xs text-muted-foreground">= {formatCents(Number(customPrice))}</p>}
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
              custom_price_cents: customPrice ? Number(customPrice) : null,
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
