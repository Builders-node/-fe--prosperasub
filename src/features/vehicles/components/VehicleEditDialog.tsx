import { useEffect, useState } from "react";
import { fleetWrite } from "../lib/fleetWrite";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { centsToInput } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { GalleryField } from "@/components/patterns/GalleryField";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { VEHICLES_UNIT } from "@/lib/services/vehiclesUnit";
import { useVehicleTypes } from "../hooks/useVehicleTypes";
import type { RentalVehicle } from "../types/carRental";

/**
 * Add or edit one car.
 *
 * The fleet used to be editable only from a second admin inside the car
 * storefront, so a booking was managed in /admin and the car it was for was
 * managed somewhere else. This is that editor, moved to where the rest of the
 * platform is administered — the storefront's own admin is gone.
 *
 * It writes `rental_vehicles` directly with the anon key, as the storefront's
 * editor did; the table is permissive like the other service tables.
 */

/** A new row's starting point — every column the form writes, so none arrives undefined. */
const EMPTY: Partial<RentalVehicle> = {
  name: "", brand: "", model: "", year: new Date().getFullYear(), seats: 5,
  transmission: "automatic", fuel_type: "gasoline", air_conditioning: true, luggage_capacity: 2,
  description: "", daily_price_cents: 0, weekly_price_cents: 0, monthly_price_cents: 0,
  image_url: "", gallery_urls: [], status: "public", sort_order: 0, provider_id: null,
  category_key: null,
};

const dollars = centsToInput;
const cents = (s: string) => Math.round(parseFloat(s || "0") * 100);

interface Props {
  /** The car to edit, `"new"` to add one, or null when the dialog is closed. */
  vehicle: RentalVehicle | "new" | null;
  onClose: () => void;
  /** Called after a successful write, so the caller refreshes its own list. */
  onSaved: () => void;
  /**
   * Force the owning business and hide the picker.
   *
   * A business editing its own fleet is not choosing whose car this is — it is
   * theirs. Offering the choice there would let one workspace hand a car to a
   * competitor, and the platform admin is the only place that decision belongs.
   */
  lockedProviderId?: string;
}

export function VehicleEditDialog({ vehicle, onClose, onSaved, lockedProviderId }: Props) {
  const [editing, setEditing] = useState<Partial<RentalVehicle> | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Which business this car belongs to.
   *
   * Every other vertical hangs its work off a `providers` row — that is what a
   * payout is computed for and what a workspace belongs to. A car with no
   * provider is a car nobody can be paid for, so the field is required rather
   * than optional, and a fleet of one company still has to say which one.
   */
  const {
    data: providers = [],
    isError: providersError,
    refetch: refetchProviders,
  } = useQuery({
    queryKey: ["vehicle-providers"],
    enabled: !!vehicle && !lockedProviderId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name")
        .eq("unit", VEHICLES_UNIT)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // A new car in a one-company fleet should not need the picker touched.
  useEffect(() => {
    if (vehicle === "new" && providers.length === 1) {
      setEditing((e) => (e && !e.provider_id ? { ...e, provider_id: providers[0].id } : e));
    }
  }, [vehicle, providers]);

  // Vehicle types — transport's own rows, the same the storefront's chips and
  // the admin's Types tab read. The type belongs to the PRODUCT: one business
  // can rent cars and motorbikes.
  const { data: types = [] } = useVehicleTypes({ enabled: !!vehicle });

  // With one type on the platform there is nothing to choose — fill it in.
  useEffect(() => {
    if (vehicle === "new" && types.length === 1) {
      setEditing((e) => (e && !e.category_key ? { ...e, category_key: types[0].key } : e));
    }
  }, [vehicle, types]);

  // The form is seeded from the prop rather than mirroring it, so typing does
  // not fight the parent's list refetching underneath.
  useEffect(() => {
    if (!vehicle) { setEditing(null); return; }
    const base = vehicle === "new" ? { ...EMPTY } : { ...vehicle };
    setEditing(lockedProviderId ? { ...base, provider_id: lockedProviderId } : base);
  }, [vehicle, lockedProviderId]);

  const set = (patch: Partial<RentalVehicle>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error("Name is required."); return; }
    if (!editing.provider_id) { toast.error("Pick the business this car belongs to."); return; }
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
        provider_id: editing.provider_id,
        category_key: editing.category_key ?? null,
      };
      const res = editing.id
        ? await fleetWrite("rental_vehicles", "update", { id: editing.id, row })
        : await fleetWrite("rental_vehicles", "insert", { row });
      if (res.error) throw res.error;
      toast.success(editing.id ? "Vehicle updated" : "Vehicle added");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!vehicle} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" blocks={false}>
        <DialogHeader><DialogTitle>{editing?.id ? "Edit vehicle" : "Add vehicle"}</DialogTitle></DialogHeader>
        {editing && (
          <>
            {/* Who rents it out, and what kind of thing it is. */}
            <DialogBlock title="The car">
              {!lockedProviderId && (
                <div className="space-y-1.5">
                  <Label>Business</Label>
                  <Select value={editing.provider_id ?? undefined} onValueChange={(v) => set({ provider_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Who rents this car out?" /></SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {providersError ? (
                    <button type="button" onClick={() => void refetchProviders()} className="text-meta font-semibold text-negative underline">
                      Couldn't load the businesses — retry
                    </button>
                  ) : (
                    <p className="text-meta text-muted-foreground">Its earnings and payouts are counted for this business.</p>
                  )}
                </div>
              )}
              <Input label="Name" value={editing.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Toyota Hilux 2024" />
              {types.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={editing.category_key ?? undefined} onValueChange={(v) => set({ category_key: v })}>
                    <SelectTrigger><SelectValue placeholder="Car, motorbike…" /></SelectTrigger>
                    <SelectContent>
                      {types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Input label="Brand" value={editing.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} />
                <Input label="Model" value={editing.model ?? ""} onChange={(e) => set({ model: e.target.value })} />
                <Input label="Year" type="number" value={editing.year ?? 2024} onChange={(e) => set({ year: parseInt(e.target.value || "2024", 10) })} />
              </div>
            </DialogBlock>

            <DialogBlock title="What it has">
              <div className="grid grid-cols-2 gap-2">
                <Input label="Seats" type="number" value={editing.seats ?? 5} onChange={(e) => set({ seats: parseInt(e.target.value || "5", 10) })} />
                <Input label="Bags" type="number" value={editing.luggage_capacity ?? 2} onChange={(e) => set({ luggage_capacity: parseInt(e.target.value || "2", 10) })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Gearbox</Label>
                  <Select value={editing.transmission} onValueChange={(v) => set({ transmission: v as RentalVehicle["transmission"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="automatic">Automatic</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fuel</Label>
                  <Select value={editing.fuel_type} onValueChange={(v) => set({ fuel_type: v as RentalVehicle["fuel_type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasoline">Gasoline</SelectItem><SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-body text-foreground">Air conditioning</span>
                <Switch checked={editing.air_conditioning ?? true} onCheckedChange={(on) => set({ air_conditioning: on })} />
              </label>
            </DialogBlock>

            {/* A week or a month is a cap, never a surcharge. */}
            <DialogBlock title="Prices">
              <div className="grid grid-cols-3 gap-2">
                <Input label="Per day" type="number" step="0.01" inputMode="decimal" leftIcon={<span className="text-body text-muted-foreground">$</span>}
                  value={dollars(editing.daily_price_cents)} onChange={(e) => set({ daily_price_cents: cents(e.target.value) })} />
                <Input label="Per week" type="number" step="0.01" inputMode="decimal" leftIcon={<span className="text-body text-muted-foreground">$</span>}
                  value={dollars(editing.weekly_price_cents)} onChange={(e) => set({ weekly_price_cents: cents(e.target.value) })} />
                <Input label="Per month" type="number" step="0.01" inputMode="decimal" leftIcon={<span className="text-body text-muted-foreground">$</span>}
                  value={dollars(editing.monthly_price_cents)} onChange={(e) => set({ monthly_price_cents: cents(e.target.value) })} />
              </div>
              <p className="text-meta text-muted-foreground">
                Week and month are caps: leave 0 to charge the daily rate. A week is never charged more than 7 days.
              </p>
            </DialogBlock>

            <DialogBlock title="Photos">
              {/* The first photo is the one on every card. */}
              <GalleryField
                label="Photos"
                pathPrefix="vehicles"
                value={[editing.image_url, ...(editing.gallery_urls ?? [])].filter(Boolean) as string[]}
                onChange={(urls: string[]) => set({ image_url: urls[0] ?? null, gallery_urls: urls.slice(1) })}
              />
              <Textarea label="Description" rows={3} value={editing.description ?? ""} onChange={(e) => set({ description: e.target.value })}
                placeholder="What it's good for, what's included…" />
            </DialogBlock>

            <DialogBlock title="Availability">
              <div className="flex rounded-full bg-inset p-1">
                {([["public", "In the storefront"], ["private", "Hidden"], ["archived", "Retired"]] as const).map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => set({ status: val as RentalVehicle["status"] })}
                    className={cn("h-9 flex-1 rounded-full text-body font-semibold transition-colors",
                      editing.status === val ? "bg-foreground text-background" : "text-muted-foreground")}>
                    {lbl}
                  </button>
                ))}
              </div>
            </DialogBlock>
          </>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
