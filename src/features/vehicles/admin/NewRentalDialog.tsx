import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useAddons } from "../hooks/useAddons";
import { calcRentalPrice, extraCost, rentalDaysBetween } from "../types/carRental";
import { FLEET_KEY, addDaysISO, todayHN, type FleetVehicle } from "./fleetData";

/**
 * A booking the fleet takes itself (walk-in, phone, a regular), or days the
 * car is out of service. Same dialog, two modes — both start from a car and a
 * day, which is how the calendar opens it.
 */

export interface NewRentalSeed { vehicleId?: string; date?: string; mode?: "booking" | "block" }

export function NewRentalDialog({ open, seed, vehicles, onClose }: {
  open: boolean;
  seed: NewRentalSeed | null;
  vehicles: FleetVehicle[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"booking" | "block">("booking");
  const [vehicleId, setVehicleId] = useState("");
  const [start, setStart] = useState(todayHN());
  const [end, setEnd] = useState(addDaysISO(todayHN(), 2));
  const [who, setWho] = useState({ name: "", whatsapp: "", email: "" });
  const [insuranceId, setInsuranceId] = useState("");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState("cash");
  const [override, setOverride] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    const d = seed?.date ?? todayHN();
    setMode(seed?.mode ?? "booking");
    setVehicleId(seed?.vehicleId ?? vehicles[0]?.id ?? "");
    setStart(d); setEnd(addDaysISO(d, 2));
    setWho({ name: "", whatsapp: "", email: "" });
    setInsuranceId(""); setExtraIds([]); setZoneId(""); setAddress(""); setNotes("");
    setPaid(false); setMethod("cash"); setOverride(""); setReason("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const { data: addons } = useAddons(vehicle?.provider_id);
  const days = start && end && end >= start ? rentalDaysBetween(start, end) : 0;

  const computed = useMemo(() => {
    if (!vehicle || !days) return 0;
    const car = calcRentalPrice(vehicle, days).totalCents;
    const ins = addons?.insurance.find((t) => t.id === insuranceId);
    const extras = (addons?.extras ?? []).filter((e) => extraIds.includes(e.id)).reduce((s, e) => s + extraCost(e, days), 0);
    const zone = addons?.zones.find((z) => z.id === zoneId);
    return car + (ins ? ins.price_per_day_cents * days : 0) + extras + (zone?.fee_cents ?? 0);
  }, [vehicle, days, addons, insuranceId, extraIds, zoneId]);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "block") {
        const { error } = await adminApi("/admin/rentals/blocks", {
          method: "POST", body: JSON.stringify({ vehicleId, startDate: start, endDate: end, reason }),
        });
        if (error) throw error;
        return "Days blocked";
      }
      const { error } = await adminApi("/admin/rentals/bookings", {
        method: "POST",
        body: JSON.stringify({
          vehicleId, startDate: start, endDate: end,
          customerName: who.name, customerWhatsapp: who.whatsapp, customerEmail: who.email,
          insuranceTierId: insuranceId || undefined, extraIds, deliveryZoneId: zoneId || undefined,
          deliveryAddress: address, notes,
          totalCentsOverride: override.trim() === "" ? null : Math.round(Number(override) * 100),
          paid, paymentMethod: method,
        }),
      });
      if (error) throw error;
      return paid ? "Booked and paid" : "Booked — waiting for payment";
    },
    onSuccess: (msg) => {
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: [FLEET_KEY] });
      void qc.invalidateQueries({ queryKey: ["vehicle-booked-ranges"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save it"),
  });

  const ready = !!vehicleId && days > 0 && (mode === "block" || !!who.name.trim());

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={mode === "booking" ? "New booking" : "Block days"}
      className="sm:max-w-[640px]"
      footer={
        <Button size="lg" className="w-full" disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>
          {mode === "block"
            ? `Block ${days || 0} day${days === 1 ? "" : "s"}`
            : `Book ${days || 0} day${days === 1 ? "" : "s"} · ${formatUSD(override.trim() ? Math.round(Number(override) * 100) || 0 : computed)}`}
        </Button>
      }
    >
      <DialogBlock>
        <div className="flex rounded-full bg-inset p-0.5">
          {([["booking", "Booking"], ["block", "Out of service"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMode(v)}
              className={cn("h-9 flex-1 rounded-full text-[14px] font-semibold", mode === v ? "bg-segment text-foreground" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="nv">Vehicle</Label>
          <select id="nv" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
            className="h-11 w-full rounded-radius-md bg-inset px-3 text-body text-foreground">
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.provider?.name ? ` · ${v.provider.name}` : ""}</option>)}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="ns">From</Label><Input id="ns" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ne">To</Label><Input id="ne" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
      </DialogBlock>

      {mode === "block" ? (
        <DialogBlock title="Why">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Service, repair, owner using it…" />
          <p className="mt-1 text-meta text-muted-foreground">Customers can't book these days; the calendar shows them greyed out.</p>
        </DialogBlock>
      ) : (
        <>
          <DialogBlock title="Customer">
            <div className="space-y-2">
              <Input value={who.name} onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))} placeholder="Name *" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={who.whatsapp} onChange={(e) => setWho((w) => ({ ...w, whatsapp: e.target.value }))} placeholder="WhatsApp" />
                <Input value={who.email} onChange={(e) => setWho((w) => ({ ...w, email: e.target.value }))} placeholder="Email (links their account)" />
              </div>
            </div>
          </DialogBlock>

          {addons && (addons.insurance.length > 0 || addons.extras.length > 0 || addons.zones.length > 0) && (
            <DialogBlock title="Extras">
              <div className="space-y-3">
                {addons.insurance.length > 0 && (
                  <select value={insuranceId} onChange={(e) => setInsuranceId(e.target.value)} aria-label="Insurance"
                    className="h-11 w-full rounded-radius-md bg-inset px-3 text-body text-foreground">
                    <option value="">No insurance upgrade</option>
                    {addons.insurance.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.price_per_day_cents ? `${formatUSD(t.price_per_day_cents)}/day` : "included"}</option>)}
                  </select>
                )}
                {addons.extras.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {addons.extras.map((e) => {
                      const on = extraIds.includes(e.id);
                      return (
                        <button key={e.id} type="button" onClick={() => setExtraIds((cur) => on ? cur.filter((x) => x !== e.id) : [...cur, e.id])}
                          className={cn("h-9 rounded-full px-3 text-[13px] font-semibold", on ? "bg-foreground text-background" : "bg-inset text-muted-foreground")}>
                          {e.name} · {formatUSD(e.price_cents)}{e.price_type === "per_day" ? "/day" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
                {addons.zones.length > 0 && (
                  <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-label="Delivery"
                    className="h-11 w-full rounded-radius-md bg-inset px-3 text-body text-foreground">
                    <option value="">Pick up at the office</option>
                    {addons.zones.map((z) => <option key={z.id} value={z.id}>Deliver · {z.name} · {z.fee_cents ? formatUSD(z.fee_cents) : "free"}</option>)}
                  </select>
                )}
                {zoneId && <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where to bring it" />}
              </div>
            </DialogBlock>
          )}

          <DialogBlock title="Payment">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-body text-foreground">
                <span>Price {override.trim() ? "(set by hand)" : `· ${formatUSD(computed)} by the price list`}</span>
                <div className="relative w-32">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input inputMode="decimal" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={(computed / 100).toFixed(2)} className="pl-7" aria-label="Price override" />
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-body text-foreground">
                Already paid
                <Switch checked={paid} onCheckedChange={setPaid} />
              </label>
              {paid && (
                <div className="flex flex-wrap gap-2">
                  {["cash", "bank transfer", "card on site"].map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)}
                      className={cn("h-9 rounded-full px-4 text-[14px] font-semibold capitalize", method === m ? "bg-foreground text-background" : "bg-inset text-muted-foreground")}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (flight number, child seat, anything)" />
            </div>
          </DialogBlock>
        </>
      )}
    </ResponsiveDialog>
  );
}
