import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, PlusCircle } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { RentalExtra } from "@/types/carRental";

const EMPTY = { name: "", price_dollars: 0, price_type: "per_day" as "per_day" | "flat", sort_order: 0, is_active: true };

const priceLabel = (e: { price_cents: number; price_type: string }) =>
  e.price_cents === 0 ? "Free" : `${formatUSD(e.price_cents)}${e.price_type === "per_day" ? " / day" : ""}`;

interface Props {
  providerId: string;
}

export function ProviderExtrasTab({ providerId }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editItem, setEditItem] = useState<RentalExtra | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteTarget, setDeleteTarget] = useState<RentalExtra | null>(null);

  const { data: extras = [], isLoading } = useQuery({
    queryKey: ["admin-rental-extras", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_extras")
        .select("*")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalExtra[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        price_cents: Math.round(Number(form.price_dollars) * 100),
        price_type: form.price_type,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
        provider_id: providerId,
      };
      let id = editItem?.id ?? "";
      if (isNew) {
        const { data, error } = await supabaseDb.from("rental_extras").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabaseDb.from("rental_extras").update(payload).eq("id", id);
        if (error) throw error;
      }
      if (userData?.id) await logAuditEvent(userData.id, isNew ? "create" : "edit", "plan", id, { entity: "rental_extra", name: form.name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-extras", providerId] });
      toast.success(isNew ? "Extra created" : "Extra updated");
      close();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabaseDb.from("rental_extras").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-rental-extras", providerId] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("rental_extras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-extras", providerId] });
      toast.success("Extra deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNew = () => { setIsNew(true); setEditItem(null); setForm({ ...EMPTY, sort_order: extras.length + 1 }); };
  const openEdit = (e: RentalExtra) => {
    setIsNew(false); setEditItem(e);
    setForm({ name: e.name, price_dollars: e.price_cents / 100, price_type: e.price_type, sort_order: e.sort_order, is_active: e.is_active });
  };
  const close = () => { setEditItem(null); setIsNew(false); };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Optional add-ons for this provider. Per-day extras multiply by rental days.</p>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Extra</Button>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : extras.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No extras yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {extras.map((e) => (
              <div key={e.id} className={`flex items-center gap-3 rounded-2xl border bg-card p-4 ${e.is_active ? "border-border" : "border-border/40 opacity-60"}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <PlusCircle className="h-4 w-4 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground truncate">{e.name}</p>
                  <p className={`text-xs font-semibold ${e.price_cents === 0 ? "text-green-400" : "text-primary"}`}>{priceLabel(e)}</p>
                </div>
                {!e.is_active && <Badge className="bg-muted text-muted-foreground text-xs">Hidden</Badge>}
                <div className="flex items-center gap-0.5">
                  <Switch checked={e.is_active} onCheckedChange={(c) => toggleMutation.mutate({ id: e.id, is_active: c })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(e)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isNew || !!editItem} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{isNew ? "Add Extra" : "Edit Extra"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Baby Seat" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="number" min={0} step="1" className="pl-6" value={form.price_dollars} onChange={(e) => setForm((f) => ({ ...f, price_dollars: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Charge type</Label>
                <Select value={form.price_type} onValueChange={(v) => setForm((f) => ({ ...f, price_type: v as "per_day" | "flat" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_day">Per day</SelectItem>
                    <SelectItem value="flat">One-time (flat)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch checked={form.is_active} onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: c }))} />
                <Label>Visible</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete extra?</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteTarget?.name}</strong> will be removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
