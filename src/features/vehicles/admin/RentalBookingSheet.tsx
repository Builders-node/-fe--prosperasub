import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Car, Fuel, Gauge, KeyRound, MessageCircle, RotateCcw, Undo2 } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { Photo } from "@/components/patterns/Photo";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { FLEET_KEY, FUEL_LABELS, type FleetBooking, type FleetVehicle } from "./fleetData";

/**
 * One rental, in full, and everything the fleet does with it — in order of
 * its life: take the money, hand the car over (odometer, fuel, notes), take
 * it back (the same, plus damage), or call it off. Dates move here too; the
 * database refuses a move onto someone else's days, the api onto a block.
 */

const day = (iso?: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), "EEE, MMM d") : "—");
const stamp = (iso?: string | null) => (iso ? format(new Date(iso), "MMM d, HH:mm") : null);
const wa = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

const REFUSALS: Record<string, string> = {
  dates_taken: "Those days are taken — by another booking or a block.",
  invalid_dates: "Those dates don't work.",
};

async function patch(id: string, body: unknown) {
  const { data, error } = await adminApi(`/admin/rentals/bookings/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  if (error) throw new Error(REFUSALS[error.message] ?? error.message);
  return data as { refundNeeded?: boolean } | null;
}

export function RentalBookingSheet({ booking, vehicle, onClose }: {
  booking: FleetBooking | null;
  vehicle: FleetVehicle | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [dates, setDates] = useState({ start: "", end: "" });
  const [notes, setNotes] = useState("");
  const [form, setForm] = useState<null | "paid" | "handover" | "return">(null);
  const [paidHow, setPaidHow] = useState({ method: "cash", note: "" });
  const [check, setCheck] = useState({ km: "", fuel: 8, notes: "", damage: "" });

  useEffect(() => {
    if (!booking) return;
    setDates({ start: booking.start_date, end: booking.end_date });
    setNotes(booking.admin_notes ?? "");
    setForm(null);
    setCheck({ km: "", fuel: 8, notes: "", damage: "" });
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useMutation({
    mutationFn: ({ body }: { body: unknown; done: string }) => patch(booking!.id, body),
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: [FLEET_KEY] });
      void qc.invalidateQueries({ queryKey: ["admin-rental-bookings"] });
      if (r?.refundNeeded) toast.warning("Cancelled — it was paid, so refund the customer from Orders.");
      else toast.success(v.done);
      setForm(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not update the booking"),
  });

  const b = booking;
  if (!b) return <ResponsiveDialog open={false} onOpenChange={() => onClose()} title="Booking"><div /></ResponsiveDialog>;

  const paid = b.payment_status === "paid";
  const cancelled = b.status === "cancelled";
  const canHandOver = !cancelled && (b.status === "confirmed" || b.status === "pending" || b.status === "paid");
  const canReturn = b.status === "active";
  const datesChanged = dates.start !== b.start_date || dates.end !== b.end_date;
  const km = check.km.trim() === "" ? null : Number(check.km);

  return (
    <ResponsiveDialog
      open={!!booking}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={vehicle?.name ?? "Booking"}
      description={`${day(b.start_date)} → ${day(b.end_date)} · ${b.rental_days} day${b.rental_days === 1 ? "" : "s"}`}
      className="sm:max-w-[640px]"
    >
      {/* Who and how much */}
      <DialogBlock>
        <div className="flex items-start gap-3">
          <span className="h-14 w-20 shrink-0 overflow-hidden rounded-radius-md bg-inset"><Photo src={vehicle?.image_url} icon={Car} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-title font-semibold text-foreground">{b.customer}</p>
            <p className="truncate text-meta text-muted-foreground">{[b.email, b.customer_whatsapp].filter(Boolean).join(" · ") || "No contact"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusPill status={b.status} />
              <StatusPill status={paid ? "paid" : cancelled ? "cancelled" : "unpaid"} />
            </div>
          </div>
          {b.customer_whatsapp && (
            <a href={wa(b.customer_whatsapp)} target="_blank" rel="noreferrer" aria-label="WhatsApp the customer"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-inset text-foreground hover:bg-muted">
              <MessageCircle className="h-5 w-5" />
            </a>
          )}
        </div>
      </DialogBlock>

      <DialogBlock title="Price">
        <div className="space-y-1 text-body">
          <Line label={`Car · ${b.rental_days}d`} value={formatUSD(b.subtotal_cents ?? 0)} />
          {b.discount_cents > 0 && <Line label="Longer-rental discount" value={`−${formatUSD(b.discount_cents)}`} />}
          {(b.insurance_cents ?? 0) > 0 && <Line label="Insurance" value={formatUSD(b.insurance_cents!)} />}
          {(b.extras ?? []).map((e, i) => <Line key={i} label={e.name ?? "Extra"} value={formatUSD(Number(e.cents) || 0)} />)}
          {(b.delivery_fee_cents ?? 0) > 0 && <Line label="Delivery" value={formatUSD(b.delivery_fee_cents!)} />}
          {(b.surcharge_cents ?? 0) > 0 && <Line label="Payment fee" value={formatUSD(b.surcharge_cents!)} />}
          <div className="flex justify-between pt-1 text-title font-semibold text-foreground">
            <span>Total</span><span className="tabular-nums">{formatUSD(b.total_cents + (b.surcharge_cents ?? 0))}</span>
          </div>
          <p className="text-meta text-muted-foreground">
            {paid ? `Paid · ${b.payment_method ?? "—"}${b.payment_reference ? ` · ${b.payment_reference.slice(0, 18)}…` : ""}` : "Not paid yet"}
          </p>
        </div>
      </DialogBlock>

      {(b.delivery_address || b.delivery_notes) && (
        <DialogBlock title="Delivery">
          <p className="text-body text-foreground">{b.delivery_address ?? "—"}</p>
          {b.delivery_notes && <p className="text-meta text-muted-foreground">{b.delivery_notes}</p>}
        </DialogBlock>
      )}

      {/* The handover and the return, once they happened. */}
      {(b.pickup_at || b.return_at) && (
        <DialogBlock title="Handover & return">
          <div className="grid gap-2 sm:grid-cols-2">
            {b.pickup_at && <CheckCard title="Picked up" at={stamp(b.pickup_at)} km={b.pickup_odometer_km} fuel={b.pickup_fuel_eighths} notes={b.pickup_notes} />}
            {b.return_at && <CheckCard title="Returned" at={stamp(b.return_at)} km={b.return_odometer_km} fuel={b.return_fuel_eighths} notes={b.return_notes} damage={b.damage_notes} />}
          </div>
          {b.pickup_odometer_km != null && b.return_odometer_km != null && (
            <p className="mt-2 text-meta text-muted-foreground">Driven {Math.max(0, b.return_odometer_km - b.pickup_odometer_km).toLocaleString()} km</p>
          )}
        </DialogBlock>
      )}

      {/* What to do next */}
      {!cancelled && b.status !== "completed" && (
        <DialogBlock title="Next step">
          {form === null ? (
            <div className="flex flex-wrap gap-2">
              {!paid && <Button size="sm" onClick={() => setForm("paid")}>Mark paid…</Button>}
              {canHandOver && <Button size="sm" variant={paid ? "primary" : "secondary"} className="gap-1.5" onClick={() => setForm("handover")}><KeyRound className="h-4 w-4" /> Hand over the car</Button>}
              {canReturn && <Button size="sm" className="gap-1.5" onClick={() => setForm("return")}><Undo2 className="h-4 w-4" /> Take the car back</Button>}
            </div>
          ) : form === "paid" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {["cash", "bank transfer", "card on site"].map((m) => (
                  <button key={m} type="button" onClick={() => setPaidHow((p) => ({ ...p, method: m }))}
                    className={cn("h-9 rounded-full px-4 text-[14px] font-semibold capitalize", paidHow.method === m ? "bg-foreground text-background" : "bg-inset text-muted-foreground")}>
                    {m}
                  </button>
                ))}
              </div>
              <Input value={paidHow.note} onChange={(e) => setPaidHow((p) => ({ ...p, note: e.target.value }))} placeholder="Receipt no., who took it…" />
              <div className="flex gap-2">
                <Button size="sm" loading={act.isPending}
                  onClick={() => act.mutate({ body: { markPaid: { method: paidHow.method, note: paidHow.note.trim() || paidHow.method } }, done: "Marked paid" })}>
                  Confirm payment
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Back</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="odo">Odometer, km</Label>
                  <Input id="odo" inputMode="numeric" value={check.km} onChange={(e) => setCheck((c) => ({ ...c, km: e.target.value.replace(/[^\d]/g, "") }))}
                    placeholder={form === "return" && b.pickup_odometer_km != null ? `Out at ${b.pickup_odometer_km}` : "e.g. 48210"} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fuel · {FUEL_LABELS[check.fuel]}</Label>
                  <input type="range" min={0} max={8} step={1} value={check.fuel} aria-label="Fuel level"
                    onChange={(e) => setCheck((c) => ({ ...c, fuel: Number(e.target.value) }))}
                    className="mt-3 w-full accent-[hsl(var(--primary))]" />
                </div>
              </div>
              <Textarea rows={2} value={check.notes} onChange={(e) => setCheck((c) => ({ ...c, notes: e.target.value }))}
                placeholder={form === "handover" ? "Existing scratches, documents checked, deposit taken…" : "Clean, on time, keys returned…"} />
              {form === "return" && (
                <Textarea rows={2} value={check.damage} onChange={(e) => setCheck((c) => ({ ...c, damage: e.target.value }))}
                  placeholder="New damage, if any — leave empty if none" />
              )}
              {form === "return" && km !== null && b.pickup_odometer_km != null && km < b.pickup_odometer_km && (
                <p className="text-meta text-negative">That's less than when it left ({b.pickup_odometer_km} km).</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" loading={act.isPending} onClick={() => act.mutate({
                  body: form === "handover"
                    ? { handover: { odometerKm: km, fuelEighths: check.fuel, notes: check.notes } }
                    : { return: { odometerKm: km, fuelEighths: check.fuel, notes: check.notes, damage: check.damage } },
                  done: form === "handover" ? "Handed over — the rental is running" : "Returned — the rental is complete",
                })}>
                  {form === "handover" ? "Car handed over" : "Car returned"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Back</Button>
              </div>
            </div>
          )}
        </DialogBlock>
      )}

      {/* Dates and notes */}
      {!cancelled && b.status !== "completed" && (
        <DialogBlock title="Dates">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5"><Label htmlFor="ds">From</Label><Input id="ds" type="date" value={dates.start} onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="de">To</Label><Input id="de" type="date" value={dates.end} min={dates.start} onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))} /></div>
            <Button size="sm" variant="secondary" disabled={!datesChanged || act.isPending}
              onClick={() => act.mutate({ body: { fields: { start_date: dates.start, end_date: dates.end } }, done: "Dates moved" })}>
              Move dates
            </Button>
          </div>
          <p className="mt-1 text-meta text-muted-foreground">The price stays as booked — change it with the customer if the length changed.</p>
        </DialogBlock>
      )}

      <DialogBlock title="Notes for the team">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only the fleet sees this" />
        <div className="mt-2 flex flex-wrap justify-between gap-2">
          <Button size="sm" variant="secondary" disabled={notes === (b.admin_notes ?? "") || act.isPending}
            onClick={() => act.mutate({ body: { fields: { admin_notes: notes.trim() || null } }, done: "Notes saved" })}>
            Save notes
          </Button>
          {!cancelled && b.status !== "completed" && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-negative" disabled={act.isPending}
              onClick={() => { if (window.confirm(paid ? "Cancel this PAID booking? You'll need to refund it." : "Cancel this booking? The car is freed for those days.")) act.mutate({ body: { fields: { status: "cancelled" } }, done: "Booking cancelled" }); }}>
              <RotateCcw className="h-4 w-4" /> Cancel booking
            </Button>
          )}
        </div>
      </DialogBlock>
    </ResponsiveDialog>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}

function CheckCard({ title, at, km, fuel, notes, damage }: {
  title: string; at: string | null; km?: number | null; fuel?: number | null; notes?: string | null; damage?: string | null;
}) {
  return (
    <div className="space-y-1 rounded-radius-md bg-inset p-3 text-body">
      <p className="font-semibold text-foreground">{title}{at ? ` · ${at}` : ""}</p>
      <p className="flex flex-wrap gap-x-3 text-meta text-muted-foreground">
        {km != null && <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {km.toLocaleString()} km</span>}
        {fuel != null && <span className="inline-flex items-center gap-1"><Fuel className="h-3.5 w-3.5" /> {FUEL_LABELS[fuel]}</span>}
      </p>
      {notes && <p className="text-meta text-foreground">{notes}</p>}
      {damage && <p className="text-meta font-semibold text-negative">Damage: {damage}</p>}
    </div>
  );
}
