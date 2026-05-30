import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Package, Plus, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { supabaseDb } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanFilter = "all" | "public" | "private" | "draft" | "archived";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  price_per_cleaning_cents: number;
  cleanings_per_month: number;
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
  cleanings_per_month: 4,
  features: [],
  apartment_type: "any",
  visibility: "public",
  status: "active",
  service_frequency: "weekly",
  sort_order: 0,
};

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatMonthly = (plan: Plan) => formatCents(plan.price_per_cleaning_cents * plan.cleanings_per_month);

const visibilityColor = (v: string) => v === "public" ? "default" : "secondary";
const statusColor = (s: string) => {
  if (s === "active") return "default";
  if (s === "draft") return "outline";
  return "secondary";
};

// ─── Page ────────────────────────────────────────────────────────────────────

const CleaningPlans = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

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
      } else {
        const { error } = await supabaseDb
          .from("cleaning_packages")
          .insert(fields);
        if (error) throw error;
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
      const { error } = await supabaseDb
        .from("cleaning_packages")
        .insert({ ...fields, name: `${plan.name} (Copy)`, status: "draft", sort_order: plans.length });
      if (error) throw error;
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
    },
    onSuccess: () => {
      toast.success("Client assigned to plan");
      queryClient.invalidateQueries({ queryKey: ["admin-plan-assignments"] });
      setAssignOpen(false);
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

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openCreate = () => { setEditingPlan(null); setFormOpen(true); };
  const openEdit = (plan: Plan) => { setEditingPlan(plan); setFormOpen(true); };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SuperAdminLayout title="Cleaning Plans">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-space-3 md:grid-cols-4">
        {[
          { label: "Total Plans", value: stats.total, icon: Package },
          { label: "Public", value: stats.public, icon: SparklesIcon },
          { label: "Private", value: stats.private, icon: Package },
          { label: "Draft", value: stats.draft, icon: Package },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-space-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <s.icon className="h-4 w-4" />{s.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions bar */}
      <div className="mt-space-5 flex flex-wrap items-center justify-between gap-3">
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
      <Card className="mt-space-4">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading plans...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No plans match this filter</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Price / mo</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscribers</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-foreground">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">{plan.apartment_type === "any" ? "All types" : plan.apartment_type}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{formatMonthly(plan)}</TableCell>
                      <TableCell className="text-sm capitalize">{plan.service_frequency}</TableCell>
                      <TableCell><Badge variant={visibilityColor(plan.visibility)}>{plan.visibility}</Badge></TableCell>
                      <TableCell><Badge variant={statusColor(plan.status)}>{plan.status}</Badge></TableCell>
                      <TableCell className="text-center">{subscriberCounts[plan.id] || 0}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="tertiary" size="sm" onClick={() => openEdit(plan)}>Edit</Button>
                          <Button variant="tertiary" size="sm" onClick={() => duplicatePlanMutation.mutate(plan)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {plan.status !== "archived" ? (
                            <Button variant="tertiary" size="sm" onClick={() => archivePlanMutation.mutate({ id: plan.id, status: "archived" })}>
                              Archive
                            </Button>
                          ) : (
                            <Button variant="tertiary" size="sm" onClick={() => archivePlanMutation.mutate({ id: plan.id, status: "active" })}>
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
          )}
        </CardContent>
      </Card>

      {/* Client Assignments */}
      {assignments.length > 0 && (
        <Card className="mt-space-5">
          <CardContent className="p-space-4">
            <h3 className="mb-3 text-lg font-bold">Client Assignments</h3>
            <div className="divide-y divide-border">
              {assignments.map((a: any) => {
                const plan = plans.find((p) => p.id === a.plan_id);
                const client = clients.find((c: any) => c.id === a.client_id);
                return (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-semibold">{client?.company_name || "Unknown Client"}</p>
                      <p className="text-sm text-muted-foreground">
                        {plan?.name || "Unknown Plan"}
                        {a.custom_price_cents ? ` · Custom: ${formatCents(a.custom_price_cents)}/mo` : ""}
                      </p>
                    </div>
                    <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                  </div>
                );
              })}
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

  // Reset form when plan changes
  const key = plan?.id || "new";
  useState(() => {
    if (plan) {
      setForm({ ...plan });
      setFeaturesText((plan.features || []).join("\n"));
    } else {
      setForm({ ...EMPTY_PLAN });
      setFeaturesText("");
    }
  });

  // Sync when opening
  if (open && plan && form.id !== plan.id) {
    setForm({ ...plan });
    setFeaturesText((plan.features || []).join("\n"));
  } else if (open && !plan && form.id) {
    setForm({ ...EMPTY_PLAN });
    setFeaturesText("");
  }

  const handleSave = () => {
    const features = featuresText.split("\n").map((s) => s.trim()).filter(Boolean);
    onSave({
      ...form,
      features,
      price_per_cleaning_cents: Math.round(Number(form.price_per_cleaning_cents) || 0),
      cleanings_per_month: Number(form.cleanings_per_month) || 4,
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
              <Label>Price per Cleaning (cents)</Label>
              <Input type="number" value={form.price_per_cleaning_cents} onChange={(e) => set("price_per_cleaning_cents", e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                = {formatCents(Number(form.price_per_cleaning_cents) || 0)} per session
              </p>
            </div>
            <div>
              <Label>Cleanings per Month</Label>
              <Input type="number" value={form.cleanings_per_month} onChange={(e) => set("cleanings_per_month", e.target.value)} min={1} />
              <p className="mt-1 text-xs text-muted-foreground">
                Monthly: {formatCents((Number(form.price_per_cleaning_cents) || 0) * (Number(form.cleanings_per_month) || 0))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Frequency</Label>
              <Select value={form.service_frequency} onValueChange={(v) => set("service_frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
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
          </div>

          <div>
            <Label>Features (one per line)</Label>
            <Textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              placeholder={"Professional cleaning\nKitchen & bathroom\nFloors & dusting"}
              rows={4}
            />
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
