import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, MapPin } from "lucide-react";
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
import type { RentalDeliverySettings, RentalDeliveryZone } from "@/types/carRental";

const EMPTY_ZONE = { name: "", areas: "", fee_dollars: 0, sort_order: 0, is_active: true };

const CarRentalsDelivery = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();

  // ── General settings ──────────────────────────────────────────────────────
  const [form, setForm] = useState<Pick<RentalDeliverySettings, "delivery_available" | "pickup_instructions" | "terms_and_conditions">>({
    delivery_available: true,
    pickup_instructions: "",
    terms_and_conditions: "",
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-rental-delivery-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("rental_delivery_settings").select("*").limit(1).single();
      if (error) return null;
      return data as RentalDeliverySettings;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        delivery_available: settings.delivery_available,
        pickup_instructions: settings.pickup_instructions ?? "",
        terms_and_conditions: settings.terms_and_conditions ?? "",
      });
    }
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        delivery_available: form.delivery_available,
        pickup_instructions: form.pickup_instructions.trim() || null,
        terms_and_conditions: form.terms_and_conditions.trim() || null,
      };
      if (settings?.id) {
        const { error } = await supabaseDb.from("rental_delivery_settings").update(payload).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from("rental_delivery_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-delivery-settings"] });
      qc.invalidateQueries({ queryKey: ["rental-delivery-settings"] });
      toast.success("Delivery settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Delivery zones ────────────────────────────────────────────────────────
  const [editZone, setEditZone] = useState<RentalDeliveryZone | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [zoneForm, setZoneForm] = useState({ ...EMPTY_ZONE });
  const [deleteTarget, setDeleteTarget] = useState<RentalDeliveryZone | null>(null);

  const { data: zones = [], isLoading: zonesLoading } = useQuery({
    queryKey: ["admin-rental-delivery-zones"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_delivery_zones")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalDeliveryZone[];
    },
  });

  const saveZoneMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: zoneForm.name.trim(),
        areas: zoneForm.areas.trim() || null,
        fee_cents: Math.round(Number(zoneForm.fee_dollars) * 100),
        sort_order: Number(zoneForm.sort_order) || 0,
        is_active: zoneForm.is_active,
      };
      let id = editZone?.id ?? "";
      if (isNew) {
        const { data, error } = await supabaseDb.from("rental_delivery_zones").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await supabaseDb.from("rental_delivery_zones").update(payload).eq("id", id);
        if (error) throw error;
      }
      if (userData?.id) {
        await logAuditEvent(userData.id, isNew ? "create" : "edit", "plan", id, { entity: "delivery_zone", name: zoneForm.name });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-delivery-zones"] });
      qc.invalidateQueries({ queryKey: ["rental-delivery-zones"] });
      toast.success(isNew ? "Zone created" : "Zone updated");
      closeZoneDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleZoneMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabaseDb.from("rental_delivery_zones").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-delivery-zones"] });
      qc.invalidateQueries({ queryKey: ["rental-delivery-zones"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("rental_delivery_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-delivery-zones"] });
      qc.invalidateQueries({ queryKey: ["rental-delivery-zones"] });
      toast.success("Zone deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNewZone = () => {
    setIsNew(true);
    setEditZone(null);
    setZoneForm({ ...EMPTY_ZONE, sort_order: zones.length + 1 });
  };
  const openEditZone = (z: RentalDeliveryZone) => {
    setIsNew(false);
    setEditZone(z);
    setZoneForm({ name: z.name, areas: z.areas ?? "", fee_dollars: z.fee_cents / 100, sort_order: z.sort_order, is_active: z.is_active });
  };
  const closeZoneDialog = () => { setEditZone(null); setIsNew(false); };

  const feeColor = (cents: number) => cents === 0 ? "text-green-400" : cents >= 4000 ? "text-red-400" : "text-yellow-400";

  return (
    <SuperAdminLayout title="Car Rental — Delivery Settings">
      <div className="max-w-3xl space-y-space-6">

        {/* ── Delivery Zones ─────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground">Delivery Zones & Prices</h2>
              <p className="text-sm text-muted-foreground">Each zone shows on the vehicle page with its fee. Lowest sort first.</p>
            </div>
            <Button onClick={openNewZone}>
              <Plus className="mr-2 h-4 w-4" /> Add Zone
            </Button>
          </div>

          {zonesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
            </div>
          ) : zones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
              No delivery zones yet. Add one to show pricing on the booking page.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {zones.map((z) => (
                <div key={z.id} className={`flex flex-col rounded-2xl border bg-card p-4 ${z.is_active ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <MapPin className="h-4 w-4 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">{z.name}</p>
                        <p className={`text-xs font-semibold ${feeColor(z.fee_cents)}`}>
                          {z.fee_cents === 0 ? "FREE" : formatUSD(z.fee_cents)}
                        </p>
                      </div>
                    </div>
                    {!z.is_active && <Badge className="bg-muted text-muted-foreground text-xs">Hidden</Badge>}
                  </div>
                  {z.areas && <p className="mt-2 text-xs text-muted-foreground leading-snug line-clamp-3">{z.areas}</p>}
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                    <div className="flex items-center gap-2">
                      <Switch checked={z.is_active} onCheckedChange={(c) => toggleZoneMutation.mutate({ id: z.id, is_active: c })} />
                      <span className="text-xs text-muted-foreground">Visible</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditZone(z)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(z)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── General delivery settings ─────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-lg font-black text-foreground">General Settings</h2>
          {settingsLoading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          ) : (
            <div className="rounded-2xl bg-card p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Switch checked={form.delivery_available} onCheckedChange={(c) => setForm((f) => ({ ...f, delivery_available: c }))} />
                <Label className="text-base font-semibold">Delivery available</Label>
              </div>

              <div className="space-y-1.5">
                <Label>Pickup instructions</Label>
                <Textarea
                  value={form.pickup_instructions}
                  onChange={(e) => setForm((f) => ({ ...f, pickup_instructions: e.target.value }))}
                  placeholder="Instructions for customers picking up the vehicle…"
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Terms and conditions</Label>
                <Textarea
                  value={form.terms_and_conditions}
                  onChange={(e) => setForm((f) => ({ ...f, terms_and_conditions: e.target.value }))}
                  placeholder="Rental terms, damage policy, fuel policy…"
                  rows={5}
                />
              </div>

              <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                {saveSettingsMutation.isPending ? "Saving…" : "Save Settings"}
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Zone edit/create dialog */}
      <Dialog open={isNew || !!editZone} onOpenChange={(o) => !o && closeZoneDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Delivery Zone" : "Edit Delivery Zone"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Zone name *</Label>
              <Input value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. West Side (Hotels Zone)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Delivery fee (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="number" min={0} step="1" className="pl-6" value={zoneForm.fee_dollars}
                    onChange={(e) => setZoneForm((f) => ({ ...f, fee_dollars: Number(e.target.value) }))} />
                </div>
                <p className="text-[11px] text-muted-foreground">{zoneForm.fee_dollars === 0 ? 'Shows as "FREE"' : `Shows as $${zoneForm.fee_dollars}`}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input type="number" min={0} value={zoneForm.sort_order} onChange={(e) => setZoneForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Areas covered</Label>
              <Textarea value={zoneForm.areas} onChange={(e) => setZoneForm((f) => ({ ...f, areas: e.target.value }))}
                placeholder="West Bay, Sandy Bay, …" rows={3} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={zoneForm.is_active} onCheckedChange={(c) => setZoneForm((f) => ({ ...f, is_active: c }))} />
              <Label>Visible on booking page</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeZoneDialog}>Cancel</Button>
            <Button onClick={() => saveZoneMutation.mutate()} disabled={saveZoneMutation.isPending || !zoneForm.name.trim()}>
              {saveZoneMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zone delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete delivery zone?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be removed from the booking page. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteZoneMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteZoneMutation.isPending}
              onClick={() => deleteTarget && deleteZoneMutation.mutate(deleteTarget.id)}
            >
              {deleteZoneMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

export default CarRentalsDelivery;
