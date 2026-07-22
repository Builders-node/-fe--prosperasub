import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminApi, ensureCleaningSlot, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { todayHN, addDaysISO } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * Admin/owner one-off booking creator for a cleaning provider — mounted on the
 * Bookings tab. The public schedule page books recurring visits via
 * `schedule_cleaning_subscription`; this dialog handles the "I need to
 * squeeze one more visit in for this customer" case that used to require
 * jumping through the full admin subscription-create wizard.
 *
 * Flow: pick an existing paid subscription for this provider → pick date +
 * time window → optional notes → ensureCleaningSlot + insert cleaning_bookings
 * + bump slot capacity + trigger calendar sync. Same shape as
 * `createSubMutation` one-time branch in Subscriptions.tsx so behavior stays
 * identical to what admins already know.
 */

interface Props {
  /** Legacy cleaning_providers.id — used to scope the subscription picker. */
  providerId: string;
  /** Optional trigger to open the dialog. Defaults to a "+ New booking" button. */
  trigger?: React.ReactNode;
}

interface SubOption {
  id: string;
  user_id: string | null;
  client_id: string | null;
  package_id: string | null;
  apartment_note: string | null;
  package_name: string;
  customer_name: string;
  /** cleanings_per_month × billing_period_months — a sensible default for bulk. */
  suggested_count: number;
}

type Cadence = "once" | "weekly" | "biweekly" | "monthly";

const CADENCE_DAYS: Record<Exclude<Cadence, "once">, number> = {
  weekly:   7,
  biweekly: 14,
  monthly:  30,
};

const CADENCE_LABEL: Record<Cadence, string> = {
  once:     "Just this date",
  weekly:   "Weekly",
  biweekly: "Every 2 weeks",
  monthly:  "Monthly",
};

export function NewCleaningBookingDialog({ providerId, trigger }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [subId, setSubId] = useState<string>("");
  const [date, setDate] = useState<string>(todayHN());
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [notes, setNotes] = useState<string>("");
  const [cadence, setCadence] = useState<Cadence>("once");
  const [count, setCount] = useState<number>(1);

  const { data: subs = [], isLoading: subsLoading } = useQuery<SubOption[]>({
    queryKey: ["admin-new-booking-subs", providerId],
    enabled: open && !!providerId,
    queryFn: async () => {
      // Only paid+active subs are bookable — the point of the dialog is to add
      // a real visit for a live customer, not to schedule for a cancelled row.
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages")
        .select("id,name,cleanings_per_month")
        .eq("provider_id", providerId);
      const pkgIds = (pkgs ?? []).map((p: any) => p.id);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, { name: p.name as string, per_month: Number(p.cleanings_per_month) || 0 }]));
      if (!pkgIds.length) return [];

      const { data: subRows } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id,user_id,client_id,package_id,apartment_note,subscription_status,payment_status,billing_period_months")
        .in("package_id", pkgIds)
        .eq("payment_status", "paid")
        .in("subscription_status", ["active", "pending_schedule"])
        .order("created_at", { ascending: false });
      const rows = subRows ?? [];
      if (!rows.length) return [];

      // Resolve customer display names in one batch (users + cleaning_clients).
      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean))) as string[];
      const clientIds = Array.from(new Set(rows.map((r: any) => r.client_id).filter(Boolean))) as string[];
      const [usersRes, clientsRes] = await Promise.all([
        userIds.length
          ? supabaseDb.from("users").select("id,name,display_name,email").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        clientIds.length
          ? supabaseDb.from("cleaning_clients").select("id,company_name,contact_name").in("id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const userMap = new Map((usersRes.data ?? []).map((u: any) => [String(u.id), u]));
      const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [String(c.id), c]));

      return rows.map((r: any): SubOption => {
        const user = r.user_id ? userMap.get(String(r.user_id)) : null;
        const client = r.client_id ? clientMap.get(String(r.client_id)) : null;
        const customer =
          user?.display_name ?? user?.name ?? user?.email ??
          client?.contact_name ?? client?.company_name ?? "Customer";
        const pkg = r.package_id ? pkgMap.get(r.package_id) : null;
        // Total visits across the paid period. Falls back to 1 (single visit)
        // when we can't figure it out — the admin can bump the count manually.
        const suggested = Math.max(
          1,
          (pkg?.per_month || 0) * (Number(r.billing_period_months) || 1) || 1,
        );
        return {
          id: r.id,
          user_id: r.user_id ?? null,
          client_id: r.client_id ?? null,
          package_id: r.package_id ?? null,
          apartment_note: r.apartment_note ?? null,
          package_name: pkg?.name || "Cleaning plan",
          customer_name: customer,
          suggested_count: suggested,
        };
      });
    },
  });

  const selectedSub = useMemo(() => subs.find((s) => s.id === subId) ?? null, [subs, subId]);

  // Auto-fill notes from the subscription's apartment_note on selection so the
  // admin doesn't have to retype every visit.
  useEffect(() => {
    if (selectedSub?.apartment_note && !notes) setNotes(selectedSub.apartment_note);
  }, [selectedSub, notes]);

  // Bulk mode: default the visit count to the subscription's paid period
  // (cleanings_per_month × billing_period_months). Once → 1. Admin can override.
  useEffect(() => {
    if (cadence === "once") setCount(1);
    else if (selectedSub) setCount(selectedSub.suggested_count);
  }, [cadence, selectedSub]);

  // Build the list of dates to book — anchored on `date`, stepped by the
  // cadence, N entries total. `once` = just the anchor.
  const dates = useMemo(() => {
    const n = cadence === "once" ? 1 : Math.max(1, Math.min(count, 60));
    if (cadence === "once") return [date];
    const step = CADENCE_DAYS[cadence];
    return Array.from({ length: n }, (_, i) => (i === 0 ? date : addDaysISO(date, i * step)));
  }, [cadence, count, date]);

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedSub) throw new Error("Pick a subscription");
      if (!date) throw new Error("Pick a date");
      if (!startTime) throw new Error("Pick a start time");
      if (!dates.length) throw new Error("No dates to book");

      // Loop sequentially — ensureCleaningSlot may seed a new slot per date, and
      // running these in parallel could double-seed for the same day+time.
      let created = 0;
      const createdIds: string[] = [];
      for (const d of dates) {
        const slot = await ensureCleaningSlot(d, startTime, endTime || startTime);
        const { data: bRow, error: bErr } = await supabaseDb.from("cleaning_bookings").insert({
          user_id: selectedSub.user_id,
          client_id: selectedSub.client_id,
          slot_id: slot.id,
          cleaning_subscription_id: selectedSub.id,
          subscription_id: selectedSub.id,
          status: "booked",
          reservation_type: "booking_reserved",
          source: cadence === "once" ? "admin_manual" : "admin_bulk",
          notes: notes.trim() || null,
          google_calendar_sync_status: "pending",
        }).select("id").single();
        if (bErr) {
          // Surface which date failed so the admin knows what to retry.
          throw new Error(`Booking for ${d} failed: ${bErr.message}${created ? ` (${created} already created)` : ""}`);
        }
        // Bump slot capacity so a hand-added booking counts toward the day's cap.
        await supabaseDb.from("cleaning_available_slots")
          .update({
            current_bookings: (Number(slot.current_bookings) || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", slot.id);
        if (bRow?.id) createdIds.push(bRow.id);
        created++;
      }

      // Push all new bookings to Google Calendar — fire-and-forget in parallel
      // so the mutation returns fast even for large bulk runs.
      await Promise.allSettled(
        createdIds.map((id) =>
          adminApi(`/admin/cleaning/bookings/${id}/sync-calendar`, { method: "POST" })
        ),
      );

      if (userData?.id) {
        await logAuditEvent(userData.id, "create", "booking", createdIds[0] ?? null, {
          subscription_id: selectedSub.id, dates, start_time: startTime, end_time: endTime,
          count: created, cadence,
        });
      }
      return { created };
    },
    onSuccess: ({ created }) => {
      toast.success(created > 1 ? `${created} bookings created` : "Booking created");
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-cleaning-bookings"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
      resetAndClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not create booking"),
  });

  const resetAndClose = () => {
    setOpen(false);
    setSubId("");
    setDate(todayHN());
    setStartTime("09:00");
    setEndTime("11:00");
    setNotes("");
    setCadence("once");
    setCount(1);
  };

  const defaultTrigger = (
    <Button onClick={() => setOpen(true)} className="gap-2 rounded-full">
      <Plus className="h-4 w-4" /> New booking
    </Button>
  );

  return (
    <>
      {trigger ? <span onClick={() => setOpen(true)}>{trigger}</span> : defaultTrigger}

      <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" /> New cleaning booking
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Customer subscription *</Label>
              <Select value={subId} onValueChange={setSubId}>
                <SelectTrigger>
                  <SelectValue placeholder={subsLoading ? "Loading…" : "Pick a subscription"} />
                </SelectTrigger>
                <SelectContent>
                  {subs.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {subsLoading ? "Loading subscriptions…" : "No paid subscriptions for this provider yet."}
                    </div>
                  )}
                  {subs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.customer_name} · {s.package_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={date}
                min={todayHN()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start time *</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Notes for the cleaner</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Apartment, access instructions, quirks…"
              />
              {selectedSub?.apartment_note && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Pre-filled from the subscription's apartment note — edit if needed.
                </p>
              )}
            </div>

            {/* Repeat — bulk-book N visits at the same time slot. Anchored on
                the Date field above; steps out by cadence. */}
            <div className="space-y-2 rounded-2xl bg-muted/30 p-3">
              <Label>Repeat</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCadence(c)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      cadence === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {CADENCE_LABEL[c]}
                  </button>
                ))}
              </div>
              {cadence !== "once" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs shrink-0">Number of visits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(60, parseInt(e.target.value || "1", 10))))}
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedSub && count === selectedSub.suggested_count
                      ? "(matches subscription period)"
                      : `first ${dates[0]} → last ${dates[dates.length - 1]}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!subId || !date || !startTime || create.isPending}
            >
              {create.isPending && <Spinner size="sm" className="mr-2" />}
              {dates.length > 1 ? `Create ${dates.length} bookings` : "Create booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
