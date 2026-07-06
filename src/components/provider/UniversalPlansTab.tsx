import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const AUDIT = "provider_plan";
const PERIODS = ["one_time", "weekly", "monthly", "quarterly", "yearly"] as const;
type Period = typeof PERIODS[number];

interface Plan {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  period: Period;
  status: string;
  sort_order: number;
}
const EMPTY: Omit<Plan, "id" | "provider_id"> = {
  name: "", description: "", price_cents: 0, currency: "USD",
  period: "monthly", status: "active", sort_order: 0,
};

/** CRUD for `provider_plans` filtered by provider. Works for any capability that lists plans. */
export function UniversalPlansTab({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const KEY = ["universal-provider-plans", providerId] as const;

  const { data: plans = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans").select("*")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY, sort_order: plans.length * 10 }); };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? "", price_cents: p.price_cents,
      currency: p.currency, period: p.period, status: p.status, sort_order: p.sort_order,
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        provider_id: providerId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_cents: form.price_cents,
        currency: form.currency.trim() || "USD",
        period: form.period,
        status: form.status,
        sort_order: form.sort_order,
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) throw new Error("Name is required");
      if (payload.price_cents < 0) throw new Error("Price must be non-negative");

      if (editing === "new") {
        const { data, error } = await supabaseDb.from("provider_plans").insert(payload).select("id").single();
        if (error) throw error;
        if (userData?.id) await logAuditEvent(userData.id, "create", AUDIT, data.id, payload);
      } else if (editing && editing !== "new") {
        const { error } = await supabaseDb.from("provider_plans").update(payload).eq("id", editing.id);
        if (error) throw error;
        if (userData?.id) await logAuditEvent(userData.id, "edit", AUDIT, editing.id, payload);
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: KEY }); setEditing(null); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const del = useMutation({
    mutationFn: async (p: Plan) => {
      const { error } = await supabaseDb.from("provider_plans").delete().eq("id", p.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "delete", AUDIT, p.id, { name: p.name });
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">Plans</h2>
          <p className="mt-1 text-sm text-muted-foreground">Recurring subscriptions offered to customers</p>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-full"><Plus className="h-4 w-4" /> New plan</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No plans yet — add your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-foreground">{p.name}</span>
                  <Badge className={`rounded-full text-xs ${p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>{p.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {(p.price_cents / 100).toLocaleString("en-US", { style: "currency", currency: p.currency })} · {p.period.replace("_", " ")}
                  </span>
                </div>
                {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => del.mutate(p)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing === "new" ? "New plan" : "Edit plan"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price (cents)</Label>
                <Input type="number" min={0} value={form.price_cents} onChange={(e) => setForm((f) => ({ ...f, price_cents: parseInt(e.target.value || "0") }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as Period }))}>
                  {PERIODS.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Sort order</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-2" />}{editing === "new" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
