import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { StatusPill } from "@/components/patterns/StatusPill";
import { formatUSD } from "@/lib/pricing";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { PlanForm, EMPTY_PLAN, cleanFeatures, type PlanFormValues } from "@/components/provider/plans/PlanForm";
import { includedLabel, normPeriod } from "@/lib/services/planPeriod";

const AUDIT = "provider_plan";

interface Plan {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  period: string;
  status: string;
  sort_order: number;
  /** How many of the thing are included per period. Null = unmetered access. */
  included_quantity: number | null;
  /** Singular noun for what is counted — "massage", "wash", "class". */
  included_unit: string | null;
  features: unknown;
}

/** CRUD for `provider_plans` filtered by provider. Works for any capability that lists plans. */
export function UniversalPlansTab({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [form, setForm] = useState<PlanFormValues>({ ...EMPTY_PLAN });
  // Deletion confirm — a one-click Trash icon used to nuke a $199/mo plan +
  // dangle every provider_plans-referencing subscription. Force a two-step.
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

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

  const openNew = () => { setEditing("new"); setForm({ ...EMPTY_PLAN, sortOrder: plans.length * 10 }); };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      priceCents: p.price_cents,
      quantity: p.included_quantity,
      period: normPeriod(p.period),
      unit: p.included_unit ?? "",
      features: Array.isArray(p.features)
        ? (p.features as unknown[]).filter((f): f is string => typeof f === "string")
        : [],
      status: p.status,
      sortOrder: p.sort_order,
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const features = cleanFeatures(form.features);
      const payload = {
        provider_id: providerId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_cents: form.priceCents,
        currency: "USD",
        period: form.period,
        features,
        status: form.status,
        sort_order: form.sortOrder,
        // A blank box means "unmetered", not zero — the DB rejects <= 0.
        included_quantity: form.quantity && form.quantity > 0 ? form.quantity : null,
        included_unit: form.unit.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) throw new Error("Name is required");
      if (payload.price_cents < 0) throw new Error("Price must be non-negative");
      if (form.quantity !== null && form.quantity <= 0) {
        throw new Error("How many must be at least 1 — leave it empty for unlimited");
      }

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
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: KEY }); setDeleteTarget(null); },
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
            <div key={p.id} className="flex items-center gap-4 rounded-2xl bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-foreground">{p.name}</span>
                  <StatusPill status={p.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatUSD(p.price_cents)} · {p.period.replace("_", " ")}{includedLabel(p.included_quantity, p.included_unit, p.period) ? ` · ${includedLabel(p.included_quantity, p.included_unit, p.period)}` : ""}
                  </span>
                </div>
                {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}>
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
          <PlanForm
            values={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            priceLabel="Price (USD)"
            featuresPlaceholder="One per line — e.g. Same therapist each time"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
              {save.isPending && <Spinner size="sm" className="mr-2" />}{editing === "new" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name && (
                <>
                  This deletes <strong className="text-foreground">{deleteTarget.name}</strong>.
                  Any customer subscription linked to this plan will lose its plan reference.
                  This can't be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && del.mutate(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
