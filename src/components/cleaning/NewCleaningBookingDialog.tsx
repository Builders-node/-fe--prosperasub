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
import { todayHN } from "@/lib/timezone";

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
}

export function NewCleaningBookingDialog({ providerId, trigger }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [subId, setSubId] = useState<string>("");
  const [date, setDate] = useState<string>(todayHN());
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [notes, setNotes] = useState<string>("");

  const { data: subs = [], isLoading: subsLoading } = useQuery<SubOption[]>({
    queryKey: ["admin-new-booking-subs", providerId],
    enabled: open && !!providerId,
    queryFn: async () => {
      // Only paid+active subs are bookable — the point of the dialog is to add
      // a real visit for a live customer, not to schedule for a cancelled row.
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages").select("id,name").eq("provider_id", providerId);
      const pkgIds = (pkgs ?? []).map((p: any) => p.id);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p.name as string]));
      if (!pkgIds.length) return [];

      const { data: subRows } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id,user_id,client_id,package_id,apartment_note,subscription_status,payment_status")
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
        return {
          id: r.id,
          user_id: r.user_id ?? null,
          client_id: r.client_id ?? null,
          package_id: r.package_id ?? null,
          apartment_note: r.apartment_note ?? null,
          package_name: (r.package_id && pkgMap.get(r.package_id)) || "Cleaning plan",
          customer_name: customer,
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

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedSub) throw new Error("Pick a subscription");
      if (!date) throw new Error("Pick a date");
      if (!startTime) throw new Error("Pick a start time");

      const slot = await ensureCleaningSlot(date, startTime, endTime || startTime);
      const { data: bRow, error: bErr } = await supabaseDb.from("cleaning_bookings").insert({
        user_id: selectedSub.user_id,
        client_id: selectedSub.client_id,
        slot_id: slot.id,
        cleaning_subscription_id: selectedSub.id,
        subscription_id: selectedSub.id,
        status: "booked",
        reservation_type: "booking_reserved",
        source: "admin_manual",
        notes: notes.trim() || null,
        google_calendar_sync_status: "pending",
      }).select("id").single();
      if (bErr) throw bErr;

      // Bump slot capacity — same pattern as the one-time subscription path in
      // Subscriptions.tsx so a hand-added booking counts toward the day's cap.
      await supabaseDb.from("cleaning_available_slots")
        .update({
          current_bookings: (Number(slot.current_bookings) || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", slot.id);

      // Push to Google Calendar right away (best-effort — cron picks it up later).
      if (bRow?.id) {
        await adminApi(`/admin/cleaning/bookings/${bRow.id}/sync-calendar`, { method: "POST" })
          .catch(() => {});
      }

      if (userData?.id) {
        await logAuditEvent(userData.id, "create", "booking", bRow?.id ?? null, {
          subscription_id: selectedSub.id, date, start_time: startTime, end_time: endTime,
        });
      }
    },
    onSuccess: () => {
      toast.success("Booking created");
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
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!subId || !date || !startTime || create.isPending}
            >
              {create.isPending && <Spinner size="sm" className="mr-2" />}
              Create booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
