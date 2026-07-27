import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb, supabase, ensureCleaningSlot } from "@/integrations/supabase/client";
import { todayHN } from "@/lib/timezone";

/**
 * Reschedule an existing cleaning booking to another day / time.
 *
 * Two paths on the same dialog:
 *   • Pick an existing active slot on the chosen date, OR
 *   • Type a custom start+end time — we call `ensureCleaningSlot` to seed one.
 *
 * Mirrors the flow already used by /admin/cleaning (Operations page): direct
 * table update on `cleaning_bookings.slot_id`, `decrement_slot_bookings` RPC
 * on the old slot, +1 on the new slot, then re-sync the Google Calendar event
 * to the new time (best-effort — a failed sync doesn't roll back the move).
 */

interface Booking {
  id: string;
  customerName: string | null;
  planName: string | null;
  currentSlotId: string | null;
  currentDate: string | null;
  currentStartTime: string | null;
  currentEndTime: string | null;
  location: string | null;
  notes: string | null;
  googleCalendarEventId: string | null;
  status: string;
}

interface Props {
  booking: Booking | null;
  onClose: () => void;
}

const to12h = (t: string | null | undefined) => {
  if (!t) return "";
  const [hh, mm] = String(t).slice(0, 5).split(":").map((n) => parseInt(n, 10));
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${period}`;
};

const clip5 = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : "");

export function RescheduleCleaningDialog({ booking, onClose }: Props) {
  const qc = useQueryClient();
  const open = booking !== null;

  const [date, setDate] = useState<string>("");
  const [slotId, setSlotId] = useState<string>("");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);

  // Preselect the booking's current date + slot every time a new booking opens
  // the dialog. Custom-time mode always starts unchecked — most reschedules
  // just move to another prepared slot.
  useEffect(() => {
    if (!booking) return;
    setDate(booking.currentDate || todayHN());
    setSlotId(booking.currentSlotId || "");
    setCustomStart(clip5(booking.currentStartTime));
    setCustomEnd(clip5(booking.currentEndTime));
    setUseCustom(false);
  }, [booking]);

  // Active slots on the chosen date — global (no provider scoping needed since
  // cleaning_available_slots is a shared pool the admin manages centrally).
  const { data: slots = [], isLoading: slotsLoading } = useQuery<any[]>({
    queryKey: ["reschedule-cleaning-slots", date],
    enabled: open && !!date && !useCustom,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_available_slots")
        .select("id,date,start_time,end_time,max_bookings,current_bookings,is_active")
        .eq("date", date)
        .eq("is_active", true)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const availableSlots = useMemo(
    () => slots.filter((s) => (s.current_bookings ?? 0) < (s.max_bookings ?? 0) || s.id === booking?.currentSlotId),
    [slots, booking],
  );

  const reschedule = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error("No booking");
      if (!date) throw new Error("Pick a date");

      // Resolve the target slot — either the picked one or a seeded custom slot.
      let targetSlotId = slotId;
      let targetSlot: any = null;
      if (useCustom) {
        if (!customStart) throw new Error("Pick a start time");
        const end = customEnd || customStart;
        // ensureCleaningSlot is idempotent — it returns the existing slot if
        // date+start+end already exists, or seeds a new one.
        const seeded = await ensureCleaningSlot(date, customStart, end);
        targetSlotId = seeded.id;
        targetSlot = seeded;
      } else {
        if (!targetSlotId) throw new Error("Pick a time slot");
        const { data, error } = await supabaseDb
          .from("cleaning_available_slots")
          .select("*").eq("id", targetSlotId).single();
        if (error || !data) throw new Error("Slot not found");
        if (!data.is_active) throw new Error("That slot is not available");
        targetSlot = data;
      }

      const oldSlotId = booking.currentSlotId;
      if (targetSlotId === oldSlotId) throw new Error("Pick a different slot");

      // Only enforce capacity when moving to a NEW slot (we already own our
      // seat on the current one). Ensure custom-seeded slots that already had
      // other bookings don't overflow.
      if ((targetSlot.current_bookings ?? 0) >= (targetSlot.max_bookings ?? 0)) {
        throw new Error("That slot is full");
      }

      // Move the booking. Direct table write — the admin PATCH DTO is
      // whitelisted and rejects slot_id / calendar columns.
      const { error: upErr } = await supabaseDb
        .from("cleaning_bookings")
        .update({ slot_id: targetSlotId, google_calendar_sync_status: "pending" })
        .eq("id", booking.id);
      if (upErr) throw upErr;

      // Free up the old slot's capacity, then take one on the new slot.
      if (oldSlotId) {
        const { error: decErr } = await supabaseDb.rpc(
          "decrement_slot_bookings", { p_slot_id: oldSlotId },
        );
        if (decErr) {
          // Fallback if the RPC isn't reachable — manual decrement, floored at 0.
          const { data: os } = await supabaseDb
            .from("cleaning_available_slots")
            .select("current_bookings").eq("id", oldSlotId).single();
          if (os) {
            await supabaseDb
              .from("cleaning_available_slots")
              .update({ current_bookings: Math.max(0, (os.current_bookings ?? 0) - 1) })
              .eq("id", oldSlotId);
          }
        }
      }
      await supabaseDb
        .from("cleaning_available_slots")
        .update({ current_bookings: (targetSlot.current_bookings ?? 0) + 1 })
        .eq("id", targetSlotId);

      // Re-sync Google Calendar to the new time. Best-effort — a failed sync
      // shouldn't roll back the reschedule (the admin can Sync manually later).
      try {
        const { data } = await supabase.admin.syncCleaningBookingDirect(booking.id, {
          date: targetSlot.date,
          startTime: clip5(targetSlot.start_time),
          endTime: clip5(targetSlot.end_time),
          clientName: booking.customerName || undefined,
          planName: booking.planName || undefined,
          location: booking.location || undefined,
          status: booking.status || "booked",
          notes: booking.notes || undefined,
          googleCalendarEventId: booking.googleCalendarEventId || undefined,
        });
        if (data?.ok && data?.googleCalendarEventId) {
          await supabaseDb
            .from("cleaning_bookings")
            .update({
              google_calendar_event_id: data.googleCalendarEventId,
              google_calendar_event_link: data.googleCalendarEventLink ?? null,
              google_calendar_sync_status: "synced",
            })
            .eq("id", booking.id);
        }
      } catch { /* best-effort */ }
    },
    onSuccess: () => {
      toast.success("Cleaning rescheduled");
      // Every surface that reads cleaning bookings — invalidate broadly so the
      // calendar, By-customer list, and admin Operations page all refresh.
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-cleaning-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-cleaning-slots"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not reschedule"),
  });

  const currentLabel = booking?.currentDate && booking.currentStartTime
    ? `${format(new Date(`${booking.currentDate}T00:00:00`), "MMM d")} · ${to12h(booking.currentStartTime)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" /> Reschedule cleaning
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {booking && (
            <p className="text-xs text-muted-foreground">
              {booking.customerName ?? "Customer"}
              {currentLabel && <> · currently <b>{currentLabel}</b></>}
            </p>
          )}

          <div>
            <Label>New date *</Label>
            <Input
              type="date"
              value={date}
              min={todayHN()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-muted/30 p-3">
            <div>
              <p className="text-sm font-semibold">Custom time</p>
              <p className="text-xs text-muted-foreground">
                Off — pick from prepared slots. On — type any start/end time.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useCustom}
              onClick={() => setUseCustom((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${useCustom ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background transition-transform ${useCustom ? "translate-x-5" : ""}`}
              />
            </button>
          </div>

          {useCustom ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start time *</Label>
                <Input
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div>
                <Label>End time</Label>
                <Input
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <Label>Time slot *</Label>
              <Select value={slotId} onValueChange={setSlotId}>
                <SelectTrigger>
                  <SelectValue placeholder={slotsLoading ? "Loading…" : "Pick a slot"} />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {slotsLoading
                        ? "Loading slots…"
                        : "No active slots on this day. Toggle Custom time above to seed one."}
                    </div>
                  )}
                  {availableSlots.map((s) => {
                    const isCurrent = s.id === booking?.currentSlotId;
                    const cap = `${s.current_bookings ?? 0}/${s.max_bookings ?? 0}`;
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {to12h(s.start_time)} – {to12h(s.end_time)} · {cap}
                        {isCurrent ? " · current" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => reschedule.mutate()}
            disabled={
              !date ||
              (useCustom ? !customStart : !slotId) ||
              reschedule.isPending
            }
          >
            {reschedule.isPending && <Spinner size="sm" className="mr-2" />}
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
