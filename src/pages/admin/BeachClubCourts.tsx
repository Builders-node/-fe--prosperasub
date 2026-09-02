import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import {
  Waves, ChevronLeft, ChevronRight, Clock, X, Plus, CalendarDays, CircleDot,
  Settings, Trash2, Eye, EyeOff, Pencil, Copy, Link as LinkIcon, ExternalLink, RefreshCw,
} from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { BookingCalendarOverride } from "@/components/provider/BookingCalendarOverride";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb, adminApi, accountApi } from "@/integrations/supabase/client";
import { todayHN, nowHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Court {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  sort_order: number;
  open_hour: number;
  close_hour: number;
  slot_minutes: number;
  description: string | null;
  ical_feed_token: string;
  google_calendar_id: string | null;
  /** Everything else the calendar row carries — merged back on save. */
  metadata?: Record<string, unknown>;
}

const SUPABASE_URL = "https://igbytraidldkhhamsfdo.supabase.co";
const feedUrlFor = (token: string) =>
  `${SUPABASE_URL}/functions/v1/beach-court-ics?token=${token}`;
/** Booking as returned by the new engine (`/booking/bookings`). */
interface EngineBooking {
  id: string; resource_id: string; subject_ref: string | null;
  start_at: string; end_at: string; slot_key: string; status: string;
  label: string | null; notes: string | null;
  google_calendar_event_id: string | null; google_calendar_sync_status: string | null;
}

const hourLabel = (h: number) => {
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
};
const slotLabel = (h: number) => `${hourLabel(h)} - ${hourLabel(h + 1)}`;

/**
 * The kinds a calendar can be, read from `resource_types` like every other
 * screen that offers them.
 *
 * This page carried its own list — tennis, pickleball, paddle, basketball,
 * volleyball, other — which meant the platform had two vocabularies for one
 * column and picking "paddle" here produced a kind no booking model knew.
 * There is one kind for all of them now, called Court.
 */
function useResourceKinds() {
  return useQuery({
    queryKey: ["resource-types-active"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("resource_types")
        .select("key, label, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string }>;
    },
  });
}

const EMPTY_FORM = {
  name: "",
  type: "court",
  is_active: true,
  open_hour: 8,
  close_hour: 19,
  slot_minutes: 60,
  description: "",
  sort_order: 0,
  // Per-court booking calendar override. NULL = inherit from provider.
  booking_settings: null as unknown | null,
};

export default function BeachClubCourts({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const [courtId, setCourtId] = useState<string>("");
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [date, setDate] = useState<string>(todayHN());
  const [bookSlot, setBookSlot] = useState<number | null>(null);
  const [memberName, setMemberName] = useState("");
  const [notes, setNotes] = useState("");

  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<Court | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<Court | null>(null);

  /**
   * The courts, read as what they are: rows in `bookable_resources`.
   *
   * This page used to read `beach_club_courts` and then bridge each id to the
   * calendar the engine actually books against — two ids for one thing, and a
   * legacy table in the middle of a screen whose bookings had already moved.
   * The id here IS the calendar's, so the bridge is gone; the legacy row is
   * still written by the mirror for whatever has not moved yet.
   */
  const { data: kinds = [] } = useResourceKinds();

  const { data: courts = [], isLoading: courtsLoading } = useQuery({
    queryKey: ["admin-bc-courts"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, type, status, sort_order, hours, metadata, provider_id")
        .eq("source_service_key", "beach")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r): Court => ({
        id: r.id,
        name: r.name,
        type: r.type,
        is_active: r.status === "active",
        sort_order: r.sort_order ?? 0,
        open_hour: r.hours?.open_hour ?? 8,
        close_hour: r.hours?.close_hour ?? 19,
        slot_minutes: r.hours?.slot_minutes ?? 60,
        description: r.metadata?.description ?? null,
        ical_feed_token: r.metadata?.ical_feed_token ?? null,
        google_calendar_id: r.metadata?.google_calendar_id ?? null,
        metadata: r.metadata ?? {},
      } as Court));
    },
  });

  const activeCourts = useMemo(() => courts.filter((c) => c.is_active), [courts]);
  const activeCourtId = courtId || activeCourts[0]?.id || courts[0]?.id || "";
  const activeCourt = courts.find((c) => c.id === activeCourtId);

  // Hours grid respects the selected court's opening hours.
  const HOURS = useMemo(() => {
    const start = activeCourt?.open_hour ?? 8;
    const end = activeCourt?.close_hour ?? 19;
    const n = Math.max(0, end - start);
    return Array.from({ length: n }, (_, i) => start + i);
  }, [activeCourt]);

  // No bridge any more: the court IS the calendar the engine books against.
  const resourceId = activeCourtId;

  const bookingsQueryKey = ["admin-bc-engine-bookings", resourceId, date] as const;
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: bookingsQueryKey,
    enabled: !!resourceId,
    queryFn: async () => {
      const { data, error } = await accountApi(`/booking/bookings?resourceId=${encodeURIComponent(resourceId)}&date=${date}`);
      if (error) throw error;
      return (data ?? []) as EngineBooking[];
    },
  });

  const bookingByHour = useMemo(() => {
    const m = new Map<number, EngineBooking>();
    for (const b of bookings) {
      const h = new Date(b.start_at).getHours();
      m.set(h, b);
    }
    return m;
  }, [bookings]);

  // Past-slot guard (Honduras time). A slot is "past" once its END hour has passed.
  const isPastSlot = (h: number): boolean => {
    if (date > todayHN()) return false;
    if (date < todayHN()) return true;
    return nowHN().getHours() >= h + 1;
  };

  // ── Booking mutations (engine as source of truth) ───────────────────────────
  const createBooking = useMutation({
    mutationFn: async () => {
      if (bookSlot === null) return null;
      if (isPastSlot(bookSlot)) throw new Error("That time has already passed — pick a future slot.");
      if (!resourceId) throw new Error("Court not yet bridged to the resource registry.");

      const from = `${String(bookSlot).padStart(2, "0")}:00`;
      const hold = await accountApi("/booking/hold", {
        method: "POST",
        body: JSON.stringify({
          resource_id: resourceId, date, from,
          label: memberName.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (hold.error) throw new Error(hold.error.message || "Could not hold slot");
      const held = hold.data as { held?: boolean; bookingId?: string; reason?: string } | null;
      if (!held?.held || !held.bookingId) {
        throw new Error(held?.reason === "slot_taken" ? "That slot is already booked." : "Slot unavailable");
      }
      const confirm = await accountApi(`/booking/holds/${held.bookingId}/confirm`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (confirm.error) throw new Error(confirm.error.message || "Could not confirm");
      // Best-effort push to Google Calendar if this court has one configured.
      if (activeCourt?.google_calendar_id) {
        adminApi(`/admin/beach-club/court-bookings/${held.bookingId}/sync-google`, { method: "POST" })
          .catch(() => { /* non-fatal */ });
      }
      return { id: held.bookingId };
    },
    onSuccess: () => {
      toast.success(activeCourt?.google_calendar_id ? "Court booked — syncing to Google Calendar…" : "Court booked");
      qc.invalidateQueries({ queryKey: bookingsQueryKey });
      setBookSlot(null); setMemberName(""); setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelBooking = useMutation({
    mutationFn: async (booking: EngineBooking) => {
      const { error } = await accountApi(`/booking/bookings/${booking.id}/cancel`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (error) throw new Error(error.message || "Could not cancel");
      // Remove the paired Google Calendar event, if any. The admin endpoint takes
      // the LEGACY court id (for its Google mapping) and the event id we recorded
      // on the engine booking during syncCreated.
      if (booking.google_calendar_event_id && activeCourt?.google_calendar_id) {
        adminApi(`/admin/beach-club/court-bookings/${booking.id}/unsync-google`, {
          method: "POST",
          body: JSON.stringify({ courtId: activeCourtId, eventId: booking.google_calendar_event_id }),
        }).catch(() => { /* non-fatal */ });
      }
    },
    onSuccess: () => {
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: bookingsQueryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Court CRUD ─────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing("new");
    setForm({ ...EMPTY_FORM, sort_order: courts.length });
  };
  const openEdit = (c: Court) => {
    setEditing(c);
    setForm({
      name: c.name,
      type: c.type,
      is_active: c.is_active,
      open_hour: c.open_hour,
      close_hour: c.close_hour,
      slot_minutes: c.slot_minutes,
      description: c.description ?? "",
      sort_order: c.sort_order,
      booking_settings: (c as any).booking_settings ?? null,
    });
  };

  const saveCourt = useMutation({
    mutationFn: async () => {
      const trimmed = form.name.trim();
      if (!trimmed) throw new Error("Name is required.");
      if (form.open_hour >= form.close_hour) throw new Error("Close hour must be after open hour.");
      // Written where a calendar lives. The legacy court row follows by
      // trigger, for the readers that have not moved yet.
      const existingMeta = (editing !== "new" && editing ? (editing as any).metadata : null) ?? {};
      const payload = {
        name: trimmed,
        type: form.type,
        status: form.is_active ? "active" : "paused",
        hours: {
          open_hour: form.open_hour,
          close_hour: form.close_hour,
          slot_minutes: form.slot_minutes,
        },
        sort_order: form.sort_order,
        // Merge: the iCal token and the Google calendar id live in here.
        metadata: { ...existingMeta, description: form.description.trim() || null },
      };
      if (editing === "new") {
        const club = await supabaseDb.from("providers")
          .select("id").eq("source_service_key", "beach").limit(1).maybeSingle();
        if (!club.data?.id) throw new Error("The beach club provider is missing.");
        const { error } = await supabaseDb.from("bookable_resources")
          .insert({ ...payload, provider_id: club.data.id, source_service_key: "beach" });
        if (error) throw error;
      } else if (editing) {
        const { error } = await supabaseDb.from("bookable_resources").update(payload).eq("id", editing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing === "new" ? "Court created" : "Court updated");
      qc.invalidateQueries({ queryKey: ["admin-bc-courts"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  const toggleActive = useMutation({
    mutationFn: async (c: Court) => {
      const { error } = await supabaseDb.from("bookable_resources")
        .update({ status: c.is_active ? "paused" : "active" })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-bc-courts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const pullFromGoogle = useMutation({
    mutationFn: async (courtId: string) => {
      const { data, error } = await adminApi(`/admin/beach-club/courts/${courtId}/pull-google`, { method: "POST" });
      if (error) throw error;
      return data as { ok: boolean; created?: number; deleted?: number; conflicts?: number; skipped?: number; reason?: string; error?: string };
    },
    onSuccess: (r) => {
      if (r?.reason === "not_configured") { toast.error("Google Calendar sync is not configured on the server."); return; }
      if (r?.reason === "no_calendar") { toast.error("Attach a Google Calendar ID to this court first."); return; }
      if (r?.error) { toast.error(r.error); return; }
      const parts = [
        r?.created ? `+${r.created} new` : "",
        r?.deleted ? `−${r.deleted} removed` : "",
        r?.conflicts ? `${r.conflicts} conflict(s)` : "",
      ].filter(Boolean).join(", ");
      toast.success(parts ? `Synced from Google: ${parts}` : "Up to date");
      // Was ["admin-bc-court-bookings"] — a key no query uses, so "Sync from
      // Google" reported success while the grid kept showing stale slots.
      qc.invalidateQueries({ queryKey: ["admin-bc-engine-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-bc-courts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Sync failed"),
  });

  const deleteCourt = useMutation({
    mutationFn: async (c: Court) => {
      const { error } = await supabaseDb.from("bookable_resources").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Court removed");
      qc.invalidateQueries({ queryKey: ["admin-bc-courts"] });
      setDeleteTarget(null);
      if (deleteTarget && courtId === deleteTarget.id) setCourtId("");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete"),
  });

  useEffect(() => {
    if (activeCourtId && !courts.find((c) => c.id === activeCourtId)) setCourtId("");
  }, [activeCourtId, courts]);

  const shiftDay = (n: number) => setDate(format(addDays(new Date(`${date}T00:00:00`), n), "yyyy-MM-dd"));
  const bookedCount = bookings.length;

  if (courtsLoading) {
    if (embedded) return <PageLoader />;
    return <SuperAdminLayout title="Beach Club Courts"><PageLoader /></SuperAdminLayout>;
  }

  const bodyContent = (
    <>
      {/* Header: tabs + manage */}
      <div className="mb-space-4 flex flex-wrap items-center gap-2">
        {activeCourts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCourtId(c.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              c.id === activeCourtId ? "bg-primary text-black" : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
          >
            <CircleDot className="h-4 w-4" />
            {c.name}
            <span className="text-[10px] font-bold uppercase opacity-70">{c.type}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="gap-1.5 rounded-full" onClick={() => setManageOpen(true)}>
            <Settings className="h-4 w-4" /> Manage courts
          </Button>
          <Button className="gap-1.5 rounded-full" onClick={openNew}>
            <Plus className="h-4 w-4" /> New court
          </Button>
        </div>
      </div>

      {courts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-radius-md border border-[hsl(var(--app-divider))] bg-card py-16 text-center">
          <Waves className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No courts yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first court to start taking hourly bookings.
          </p>
          <Button className="mt-4 rounded-full" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New court
          </Button>
        </div>
      ) : activeCourts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-radius-md border border-[hsl(var(--app-divider))] bg-card py-14 text-center">
          <EyeOff className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">All courts are hidden</p>
          <p className="mt-1 text-sm text-muted-foreground">Activate a court from "Manage courts" to start booking.</p>
        </div>
      ) : (
        <>
          {/* Date controls */}
          <div className="mb-space-4 flex flex-wrap items-center justify-between gap-3 rounded-radius-md bg-card p-space-4">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="iconSm" className="rounded-full" onClick={() => shiftDay(-1)} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="relative flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayHN())} className="h-9 w-full sm:w-[170px]" />
              </div>
              <Button variant="secondary" size="iconSm" className="rounded-full" onClick={() => shiftDay(1)} aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => setDate(todayHN())}>
                Today
              </Button>
              {activeCourt?.google_calendar_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full"
                  onClick={() => pullFromGoogle.mutate(activeCourt.id)}
                  disabled={pullFromGoogle.isPending}
                  title="Pull external bookings from this court's Google Calendar"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", pullFromGoogle.isPending && "animate-spin")} />
                  Sync from Google
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{activeCourt?.name}</span>
              {activeCourt && (
                <> · {hourLabel(activeCourt.open_hour)}–{hourLabel(activeCourt.close_hour)} · {bookedCount} / {HOURS.length} booked</>
              )}
            </p>
          </div>

          {/* Hourly slot grid */}
          <div className="rounded-radius-md border border-[hsl(var(--app-divider))] bg-card p-space-4">
            <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3", bookingsLoading && "opacity-50")}>
              {HOURS.length === 0 ? (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  This court has no open hours configured.
                </p>
              ) : HOURS.map((h) => {
                const b = bookingByHour.get(h);
                const past = isPastSlot(h);
                return (
                  <div
                    key={h}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-radius-md border px-4 py-3 transition-colors",
                      b ? "border-primary/40 bg-primary/5"
                        : past ? "border-[hsl(var(--app-divider))] bg-muted/20 opacity-60"
                        : "border-[hsl(var(--app-divider))] bg-background/40",
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn(
                        "flex items-center gap-1.5 text-sm font-bold",
                        past && !b ? "text-muted-foreground line-through" : "text-foreground",
                      )}>
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {slotLabel(h)}
                      </p>
                      {b ? (
                        <p className="mt-0.5 truncate text-xs text-primary">{b.label || "Booked"}</p>
                      ) : past ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">Past</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">Available</p>
                      )}
                    </div>
                    {b ? (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(b)}
                        disabled={cancelBooking.isPending}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Cancel booking"
                        title="Cancel booking"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : past ? (
                      <Button size="sm" variant="ghost" disabled className="shrink-0 gap-1 rounded-full opacity-70">
                        Past
                      </Button>
                    ) : (
                      <Button size="sm" className="shrink-0 gap-1 rounded-full" onClick={() => { setBookSlot(h); setMemberName(""); setNotes(""); }}>
                        <Plus className="h-3.5 w-3.5" /> Book
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Book slot dialog */}
      <Dialog open={bookSlot !== null} onOpenChange={(o) => { if (!o) setBookSlot(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-primary" /> Book {activeCourt?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-radius-md bg-muted/40 px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">{format(new Date(`${date}T00:00:00`), "EEEE, MMM d, yyyy")}</p>
              <p className="text-muted-foreground">{bookSlot !== null ? slotLabel(bookSlot) : ""}</p>
            </div>
            <div>
              <Label>Member name</Label>
              <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Who is this booking for?" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything to note…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBookSlot(null)}>Cancel</Button>
            <Button onClick={() => createBooking.mutate()} disabled={createBooking.isPending}>
              {createBooking.isPending && <Spinner size="sm" className="mr-2" />}
              Confirm booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage courts dialog — list, toggle, edit, delete */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage courts</DialogTitle>
            <DialogDescription>Create, edit, hide or remove courts. Hidden courts don't accept new bookings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {courts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-radius-md border border-[hsl(var(--app-divider))] p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-primary/10 text-primary">
                  <CircleDot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground">{c.name}</span>
                    <Badge variant="secondary" className="text-[10px] capitalize">{c.type}</Badge>
                    <Badge className={c.is_active ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}>
                      {c.is_active ? "Active" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hourLabel(c.open_hour)}–{hourLabel(c.close_hour)} · {c.slot_minutes}‑min slots
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="iconSm" variant="ghost" title={c.is_active ? "Hide" : "Show"} onClick={() => toggleActive.mutate(c)}>
                    {c.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="iconSm" variant="ghost" title="Edit" onClick={() => { setManageOpen(false); openEdit(c); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="iconSm" variant="ghost" title="Delete" className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {courts.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No courts yet.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManageOpen(false)}>Close</Button>
            <Button onClick={() => { setManageOpen(false); openNew(); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> New court
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / edit court dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New court" : "Edit court"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Tennis Court 1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {kinds.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Slot length (min)</Label>
                <Select value={String(form.slot_minutes)} onValueChange={(v) => setForm((f) => ({ ...f, slot_minutes: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                    <SelectItem value="90">90 min</SelectItem>
                    <SelectItem value="120">120 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Opens at</Label>
                <Select value={String(form.open_hour)} onValueChange={(v) => setForm((f) => ({ ...f, open_hour: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Closes at</Label>
                <Select value={String(form.close_hour)} onValueChange={(v) => setForm((f) => ({ ...f, close_hour: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                      <SelectItem key={h} value={String(h)}>{h === 24 ? "12AM (next day)" : hourLabel(h)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Surface, size, house rules…" />
            </div>

            {/* Calendar sync */}
            {editing && editing !== "new" && (
              <div className="rounded-radius-md border border-[hsl(var(--app-divider))] bg-muted/20 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <LinkIcon className="h-3.5 w-3.5" /> Calendar sync
                </p>

                {/* Feed OUT — publish our bookings as iCal */}
                <div className="mb-3">
                  <Label className="text-xs">Court iCal feed (subscribe from Google/Apple/GHL)</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      readOnly
                      value={feedUrlFor(editing.ical_feed_token)}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button" variant="outline" size="iconSm"
                      title="Copy feed URL"
                      onClick={() => {
                        navigator.clipboard.writeText(feedUrlFor(editing.ical_feed_token));
                        toast.success("Feed URL copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button" variant="outline" size="iconSm" asChild
                      title="Open feed"
                    >
                      <a href={feedUrlFor(editing.ical_feed_token)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Anyone with this URL can see this court's bookings. Refreshes every 5 min.
                  </p>
                </div>

                {/* Push to Google Calendar (writable) — created by us, never typed.
                    Reads the id off the live list, not off the row captured when
                    the dialog opened, so it updates the moment we create one. */}
                <CourtCalendar
                  courtId={editing.id}
                  calendarId={courts.find((c) => c.id === editing.id)?.google_calendar_id ?? editing.google_calendar_id}
                />
              </div>
            )}
            {editing === "new" && (
              <p className="text-[11px] text-muted-foreground">
                After creating the court you'll get an iCal feed URL to subscribe to, and you can
                have the platform create its Google Calendar.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sort order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.is_active ? "active" : "hidden"} onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Per-court booking calendar override — same shared primitive
                that cleaning plans and rental vehicles use. NULL = inherit
                the beach club provider's default calendar. Flip on to give
                one court its own hours / blocks (e.g. tennis court open
                nights, paddle court closed Sundays). */}
            <BookingCalendarOverride
              value={form.booking_settings}
              onChange={(next) => setForm((f) => ({ ...f, booking_settings: next }))}
              entityLabel="This court"
              parentLabel="the beach club's calendar"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveCourt.mutate()} disabled={saveCourt.isPending || !form.name.trim()}>
              {saveCourt.isPending && <Spinner size="sm" className="mr-2" />}
              {editing === "new" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete court confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete court?
            </DialogTitle>
            <DialogDescription>
              This permanently removes <strong className="text-foreground">{deleteTarget?.name}</strong>. Its bookings will also be deleted. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteCourt.mutate(deleteTarget)}
              disabled={deleteCourt.isPending}
            >
              {deleteCourt.isPending && <Spinner size="sm" className="mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelling a court booking was a single unconfirmed X — easy to hit
          by accident on a dense hourly grid, and it destroys a member's
          reservation. */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.label ? `${cancelTarget.label} — ` : ""}
              the slot is released immediately and the member loses the
              reservation. The Google Calendar event is removed too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelTarget) cancelBooking.mutate(cancelTarget);
                setCancelTarget(null);
              }}
            >
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return bodyContent;
  return (
    <SuperAdminLayout
      title="Beach Club Courts"
      subtitle={`Book courts by the hour — ${activeCourts.length} active court${activeCourts.length === 1 ? "" : "s"}`}
    >
      {bodyContent}
    </SuperAdminLayout>
  );
}

/**
 * A court's booking calendar.
 *
 * It used to be a text field: paste a Google Calendar id here, then go and
 * grant our service account edit access over there. Two manual steps, both
 * invisible when wrong — a court with a mistyped id accepts bookings and syncs
 * them nowhere. The platform creates the calendar itself now, the same way it
 * does for a provider, and shares it with the club. The call is idempotent, so
 * a court that already has one is left alone.
 */
function CourtCalendar({ courtId, calendarId }: { courtId: string; calendarId: string | null }) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/beach-club/courts/${courtId}/calendar/provision`, { method: "POST" });
      if (error) throw new Error(String(error));
      if (!data?.calendarId) throw new Error("Google Calendar is not configured on the server yet");
      return data;
    },
    onSuccess: () => {
      toast.success("Calendar created — bookings will sync to it");
      qc.invalidateQueries({ queryKey: ["admin-bc-courts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the calendar"),
  });

  return (
    <div>
      <Label className="text-xs">Google Calendar</Label>
      {calendarId ? (
        <>
          <p className="mt-1 truncate font-mono text-xs text-foreground">{calendarId}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Created and owned by the platform. Bookings on this court are pushed to it in real time.
          </p>
        </>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-full"
            onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create calendar"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            We create it and share it with the club — nothing to paste.
          </span>
        </div>
      )}
    </div>
  );
}
