import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Car } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useVehicles } from "@/hooks/useVehicles";
import { formatUSD } from "@/lib/pricing";
import type { RentalVehicle } from "@/types/carRental";

const EMPTY: Partial<RentalVehicle> = {
  name: "", brand: "", model: "", year: new Date().getFullYear(), seats: 5,
  transmission: "automatic", fuel_type: "gasoline", air_conditioning: true, luggage_capacity: 2,
  description: "", daily_price_cents: 0, weekly_price_cents: 0, monthly_price_cents: 0,
  image_url: "", gallery_urls: [], status: "public", sort_order: 0,
};

const dollars = (c?: number) => ((c ?? 0) / 100).toFixed(2);
const cents = (s: string) => Math.round(parseFloat(s || "0") * 100);

export default function AdminVehicles() {
  const { data: vehicles = [], isLoading } = useVehicles({ includeHidden: true });
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<RentalVehicle> | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<RentalVehicle>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    try {
      const row = {
        name: editing.name, brand: editing.brand ?? "", model: editing.model ?? "", year: editing.year ?? 2024,
        seats: editing.seats ?? 5, transmission: editing.transmission ?? "automatic", fuel_type: editing.fuel_type ?? "gasoline",
        air_conditioning: editing.air_conditioning ?? true, luggage_capacity: editing.luggage_capacity ?? 2,
        description: editing.description ?? null, daily_price_cents: editing.daily_price_cents ?? 0,
        weekly_price_cents: editing.weekly_price_cents ?? 0, monthly_price_cents: editing.monthly_price_cents ?? 0,
        image_url: editing.image_url || null, gallery_urls: editing.gallery_urls ?? [],
        status: editing.status ?? "public", sort_order: editing.sort_order ?? 0,
      };
      const res = editing.id
        ? await supabaseDb.from("rental_vehicles").update(row).eq("id", editing.id)
        : await supabaseDb.from("rental_vehicles").insert(row);
      if (res.error) throw res.error;
      toast.success(editing.id ? "Vehicle updated" : "Vehicle added");
      qc.invalidateQueries({ queryKey: ["rental-vehicles"] });
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppContainer className="py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[22px] font-black tracking-tight text-foreground">Fleet</h1>
        <Button className="gap-2 rounded-full" onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4" /> Add vehicle</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-4 rounded-radius-md bg-card p-3 shadow-figma">
              <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-radius-sm bg-muted">
                {v.image_url ? <img src={v.image_url} alt="" className="h-full w-full object-cover" /> : <Car className="h-6 w-6 text-muted-foreground/40" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-foreground">{v.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[v.brand, v.model, v.year].filter(Boolean).join(" · ")} · {formatUSD(v.daily_price_cents)}/day</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{v.status}</p>
              </div>
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setEditing({ ...v })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit vehicle" : "Add vehicle"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={editing.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Toyota Hilux 2024" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Brand</Label><Input value={editing.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} /></div>
                <div><Label>Model</Label><Input value={editing.model ?? ""} onChange={(e) => set({ model: e.target.value })} /></div>
                <div><Label>Year</Label><Input type="number" value={editing.year ?? 2024} onChange={(e) => set({ year: parseInt(e.target.value || "2024", 10) })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Seats</Label><Input type="number" value={editing.seats ?? 5} onChange={(e) => set({ seats: parseInt(e.target.value || "5", 10) })} /></div>
                <div><Label>Bags</Label><Input type="number" value={editing.luggage_capacity ?? 2} onChange={(e) => set({ luggage_capacity: parseInt(e.target.value || "2", 10) })} /></div>
                <div>
                  <Label>Transmission</Label>
                  <Select value={editing.transmission} onValueChange={(v) => set({ transmission: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="automatic">Automatic</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fuel</Label>
                  <Select value={editing.fuel_type} onValueChange={(v) => set({ fuel_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasoline">Gasoline</SelectItem><SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status} onValueChange={(v) => set({ status: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem><SelectItem value="private">Private (hidden)</SelectItem><SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Daily $</Label><Input type="number" step="0.01" value={dollars(editing.daily_price_cents)} onChange={(e) => set({ daily_price_cents: cents(e.target.value) })} /></div>
                <div><Label>Weekly $</Label><Input type="number" step="0.01" value={dollars(editing.weekly_price_cents)} onChange={(e) => set({ weekly_price_cents: cents(e.target.value) })} /></div>
                <div><Label>Monthly $</Label><Input type="number" step="0.01" value={dollars(editing.monthly_price_cents)} onChange={(e) => set({ monthly_price_cents: cents(e.target.value) })} /></div>
              </div>
              <p className="-mt-1 text-[11px] text-muted-foreground">Weekly/monthly are caps: leave 0 to charge the daily rate. The total never exceeds the monthly price.</p>
              <div><Label>Image URL</Label><Input value={editing.image_url ?? ""} onChange={(e) => set({ image_url: e.target.value })} placeholder="https://…" /></div>
              <div><Label>Gallery URLs (one per line)</Label><Textarea rows={2} value={(editing.gallery_urls ?? []).join("\n")} onChange={(e) => set({ gallery_urls: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div><Label>Description</Label><Textarea rows={3} value={editing.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={editing.air_conditioning ?? true} onChange={(e) => set({ air_conditioning: e.target.checked })} /> Air conditioning
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Spinner size="sm" className="mr-2" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppContainer>
  );
}
