import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, X, GripVertical, ShieldCheck } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type { RentalInsuranceTier } from "@/types/carRental";

const EMPTY_FORM = {
  name: "",
  price_per_day_dollars: 0,
  items: "",
  sort_order: 0,
  is_active: true,
};

const CarRentalsInsurance = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editTier, setEditTier] = useState<RentalInsuranceTier | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<RentalInsuranceTier | null>(null);

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["admin-rental-insurance-tiers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_insurance_tiers")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalInsuranceTier[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = form.items.split("\n").map((s) => s.trim()).filter(Boolean);
      const payload = {
        name: form.name.trim(),
        price_per_day_cents: Math.round(Number(form.price_per_day_dollars) * 100),
        items,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      };
      let id = editTier?.id ?? "";
      if (isNew) {
        const { data, error } = await supabaseDb.from("rental_insurance_tiers").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabaseDb.from("rental_insurance_tiers").update(payload).eq("id", id);
        if (error) throw error;
      }
      if (userData?.id) {
        await logAuditEvent(userData.id, isNew ? "create" : "edit", "plan", id, { entity: "insurance_tier", name: form.name });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-insurance-tiers"] });
      qc.invalidateQueries({ queryKey: ["rental-insurance-tiers"] });
      toast.success(isNew ? "Insurance tier created" : "Insurance tier updated");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabaseDb.from("rental_insurance_tiers").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-insurance-tiers"] });
      qc.invalidateQueries({ queryKey: ["rental-insurance-tiers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("rental_insurance_tiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-insurance-tiers"] });
      qc.invalidateQueries({ queryKey: ["rental-insurance-tiers"] });
      toast.success("Insurance tier deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNew = () => {
    setIsNew(true);
    setEditTier(null);
    setForm({ ...EMPTY_FORM, sort_order: tiers.length + 1 });
  };

  const openEdit = (t: RentalInsuranceTier) => {
    setIsNew(false);
    setEditTier(t);
    setForm({
      name: t.name,
      price_per_day_dollars: t.price_per_day_cents / 100,
      items: (t.items ?? []).join("\n"),
      sort_order: t.sort_order,
      is_active: t.is_active,
    });
  };

  const closeDialog = () => {
    setEditTier(null);
    setIsNew(false);
  };

  return (
    <SuperAdminLayout title="Car Rental — Insurance Coverage">
      <div className="space-y-space-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            These tiers appear on the booking page. The first tier (lowest sort order) is selected by default.
          </p>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Add Tier
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : tiers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No insurance tiers yet. Add one to show coverage options at checkout.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col rounded-2xl border bg-card p-5 ${t.is_active ? "border-border" : "border-border/40 opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </span>
                    <div>
                      <p className="font-black text-foreground">{t.name}</p>
                      <p className={`text-xs font-semibold ${t.price_per_day_cents === 0 ? "text-green-400" : "text-primary"}`}>
                        {t.price_per_day_cents === 0 ? "Included" : `+${formatUSD(t.price_per_day_cents)} / day`}
                      </p>
                    </div>
                  </div>
                  {!t.is_active && <Badge className="bg-muted text-muted-foreground text-xs">Hidden</Badge>}
                </div>

                <ul className="mt-4 flex-1 space-y-1.5">
                  {(t.items ?? []).map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground leading-snug">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={t.is_active}
                      onCheckedChange={(c) => toggleActiveMutation.mutate({ id: t.id, is_active: c })}
                    />
                    <span className="text-xs text-muted-foreground">Visible</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(t)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Create dialog */}
      <Dialog open={isNew || !!editTier} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Insurance Tier" : "Edit Insurance Tier"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Plus" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price / day (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    className="pl-6"
                    value={form.price_per_day_dollars}
                    onChange={(e) => setForm((f) => ({ ...f, price_per_day_dollars: Number(e.target.value) }))}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {form.price_per_day_dollars === 0 ? 'Shows as "Included"' : `Shows as "+$${form.price_per_day_dollars} / day"`}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                />
                <p className="text-[11px] text-muted-foreground">Lowest = default selected</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Coverage items (one per line)</Label>
              <Textarea
                value={form.items}
                onChange={(e) => setForm((f) => ({ ...f, items: e.target.value }))}
                placeholder={"Collision, rollover, self-ignition\nLegal assistance\nTheft protection"}
                rows={6}
              />
              <p className="text-[11px] text-muted-foreground">First 4 show on the card; the rest collapse under "+N more".</p>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: c }))} />
              <Label>Visible on booking page</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete insurance tier?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be removed from the booking page. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

export default CarRentalsInsurance;
