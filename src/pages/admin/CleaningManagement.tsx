import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  ListChecks,
  MoreHorizontal,
  RotateCcw,
  SparklesIcon,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { TabEmptyState, SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { supabase, supabaseDb, adminApi } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { todayHN } from "@/lib/timezone";
import { cancelCleaningBookings } from "@/lib/cleaning/cancelBooking";
import { SaleOriginBadge } from "@/components/patterns/SaleOrigin";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { to12h as format12h } from "@/lib/booking/bookingSettings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTabParam } from "@/hooks/useTabParam";

const dailyChecklist = [
  "Take out trash",
  "Wipe down surfaces",
  "Organize chairs, tables, monitors, cables, and general workspace setup",
  "General visual tidying and upkeep",
  "Refill / set up water jug and cups",
  "Report if anything is missing, broken, damaged, or unusual",
];

// statusColor lived here and disagreed with every other list: it greyed out
// `completed` and `pending`, so the same booking read emerald in the customer's
// My Subscriptions and neutral here, and "awaiting payment" looked settled.
// StatusPill owns the tones now; only the calendar-sync WORDING stays local,
// because "Pending" there means the sync hasn't run, not that money is owed.

const calendarStatusLabel = (status?: string | null) => {
  if (status === "synced") return "Synced";
  if (status === "failed") return "Failed";
  return "Pending";
};

const calendarSyncSkipMessage = (reason?: string) => {
  switch (reason) {
    case "missing_database_url":
      return "Backend database is not configured, so saved bookings cannot sync.";
    case "database_connect_skipped":
      return "Backend database sync is disabled in this environment.";
    case "database_unavailable":
      return "Backend database is unreachable from production. Connect a hosted Postgres DATABASE_URL, then sync again.";
    case "test_environment":
      return "Calendar sync is skipped in the test environment.";
    default:
      return "Google Calendar is not configured.";
  }
};

const to12h = (time?: string | null) => (time ? format12h(time) : "—");

const getUserName = (user: any) => {
  if (!user) return "Unknown";
  return user.display_name || user.name || user.email || "Unknown";
};

const getBookingClientName = (booking: any) =>
  booking.cleaning_clients?.company_name || getUserName(booking.users);

const getBookingDate = (booking: any) => booking.cleaning_available_slots?.date ?? "";

/**
 * Names the Google Calendar these bookings actually sync to.
 *
 * There was no way to find this out from the product. The binding is
 * `providers.google_calendar_id`, which is editable on
 * /admin/marketplace/providers/:id — a page with no sidebar entry — and it is
 * null for every provider, so everything falls through to the calendar named
 * by the GOOGLE_CLEANING_CALENDAR_ID environment variable. That value never
 * reaches the browser, which is why this looked hard-coded: in effect it was.
 */
function CalendarTargetLine({ providerId }: { providerId: string | null }) {
  const { data } = useQuery({
    queryKey: ["cleaning-calendar-target", providerId ?? "platform"],
    queryFn: async () => {
      const qs = providerId ? `?providerId=${encodeURIComponent(providerId)}` : "";
      const { data, error } = await adminApi(`/admin/cleaning/calendar/target${qs}`);
      if (error) throw error;
      return data as {
        calendarId: string | null;
        source: "provider" | "platform";
        configured: boolean;
        link: string | null;
      };
    },
  });

  if (!data) return null;

  if (!data.configured) {
    return (
      <p className="mt-space-2 text-xs font-semibold text-destructive">
        No Google Calendar is configured — nothing is being synced anywhere.
      </p>
    );
  }

  return (
    <p className="mt-space-2 flex flex-wrap items-center gap-space-2 text-xs text-muted-foreground">
      <span>Syncing to</span>
      <a
        href={data.link ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-foreground underline decoration-dotted underline-offset-2 hover:opacity-80"
      >
        {data.calendarId}
      </a>
      <StatusPill
        status={data.source === "provider" ? "active" : "pending"}
        label={data.source === "provider" ? "This provider's own" : "Platform default"}
      />
    </p>
  );
}

const CleaningManagement = ({
  embedded = false,
  providerId,
}: {
  embedded?: boolean;
  /** Scope bookings + reports to this provider's packages when embedded inside
   *  a cleaning workspace. Unscoped without it (platform-wide admin view). */
  providerId?: string;
} = {}) => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [completionBookingId, setCompletionBookingId] = useState<string>("");
  const [deleteBooking, setDeleteBooking] = useState<any | null>(null);
  // Completed visits are history, not work — they were shown by default and
  // buried everything still to be done.
  const [hideCompleted, setHideCompleted] = useState(true);
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">("upcoming");
  const [customer, setCustomer] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [bookingSearch, setBookingSearch] = useState<string>("");
  const [rescheduleBooking, setRescheduleBooking] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleSlotId, setRescheduleSlotId] = useState<string>("");
  const [completion, setCompletion] = useState({
    completed_by: "Admin",
    notes: "",
    photo_url: "",
    issue_report: "",
    checklist_completed: dailyChecklist,
  });

  const invalidateCleaning = () => {
    [
      "admin-cleaning-bookings",
      "admin-cleaning-slots",
      "admin-cleaning-reports",
      "cleaning-slots",
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  // First-hop scope: which subscription ids belong to this provider's packages?
  // Empty array when not embedded (skip scoping). Also empty when the provider
  // has zero packages, in which case the bookings query short-circuits below.
  const { data: scopeSubIds = null } = useQuery({
    queryKey: ["admin-cleaning-scope-subs", providerId ?? "all"],
    enabled: !!providerId,
    queryFn: async () => {
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages").select("id").eq("provider_id", providerId!);
      const pkgIds = (pkgs ?? []).map((p: any) => p.id);
      if (!pkgIds.length) return [] as string[];
      // supabaseDb, not the wrapper: the wrapper's OwnedQueryBuilder has no
      // .range(), so this read could never be paged and clipped silently at
      // 1000 subscriptions.
      const subs = await fetchAllRows<any>(() => supabaseDb
        .from("cleaning_subscriptions").select("id").in("package_id", pkgIds)
        .order("id", { ascending: true }));
      return subs.map((s: any) => s.id) as string[];
    },
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    // Include providerId + resolved sub-id list in the key so admin view and
    // per-provider embeds cache separately.
    queryKey: ["admin-cleaning-bookings", providerId ?? "all", (scopeSubIds ?? []).join(",")],
    // Wait for the sub-id lookup before firing when embedded — otherwise the
    // first render sees no filter and leaks every provider's bookings.
    enabled: !providerId || scopeSubIds !== null,
    queryFn: async () => {
      // Matched on the booking's own provider_id OR its subscription. An admin
      // can now book a visit for a customer with no subscription at all, and a
      // subscription-only filter made those rows invisible on the very page
      // they were created from. `.or()` is why this had to leave the wrapper —
      // OwnedQueryBuilder doesn't implement it.
      let bookingsQuery = supabaseDb
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(id, date, start_time, end_time), cleaning_completion_reports(*)")
        .order("created_at", { ascending: true });
      if (providerId) {
        const subIds = scopeSubIds ?? [];
        const clauses = [`provider_id.eq.${providerId}`];
        if (subIds.length) clauses.push(`subscription_id.in.(${subIds.join(",")})`);
        bookingsQuery = bookingsQuery.or(clauses.join(","));
      }
      // Load bookings without relying on FK joins (TEXT vs UUID type mismatch breaks them)
      const { data: rawBookings, error } = await bookingsQuery;
      if (error) throw error;
      if (!rawBookings?.length) return [];

      // Separately load clients and users to avoid PostgREST FK type-mismatch issues
      const clientIds = [...new Set(rawBookings.map((b: any) => b.client_id).filter(Boolean))];
      const userIds   = [...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean))];

      const [clientsRes, usersRes] = await Promise.all([
        clientIds.length
          ? supabaseDb.from("cleaning_clients").select("id, company_name, location, email, phone").in("id", clientIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? fetchUsersByIds(userIds).then((m) => ({ data: [...m.values()] }))
          : Promise.resolve({ data: [] }),
      ]);

      const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [c.id, c]));
      const userMap   = new Map((usersRes.data   ?? []).map((u: any) => [u.id, u]));

      return rawBookings.map((b: any) => ({
        ...b,
        cleaning_clients: b.client_id ? (clientMap.get(b.client_id) ?? null) : null,
        users: b.user_id ? (userMap.get(b.user_id) ?? null) : null,
      }));
    },
  });

  /**
   * The universal providers.id for this workspace.
   *
   * `providerId` here is the LEGACY cleaning provider id — it is matched
   * against cleaning_packages.provider_id above — while slot rows carry the
   * UNIVERSAL id. Filtering slots by the legacy id would silently match
   * nothing, which is the id-space split CLAUDE.md calls the top source of
   * bugs in this codebase.
   */
  const { data: universalProviderId = null } = useQuery({
    queryKey: ["admin-cleaning-universal-provider", providerId ?? "all"],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers").select("id")
        .eq("source_service_key", "cleaning")
        .eq("source_provider_id", providerId!)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });

  /**
   * Slots for THIS provider, matching what the customer is offered.
   *
   * This query had no provider filter at all, so a provider's Operations
   * calendar listed every slot on the platform. On the Car Wash workspace that
   * meant its own 60-minute grid AND the shared 105-minute one on the same
   * day — eight entries for a provider that publishes three — with no way to
   * tell which was which.
   *
   * The fallback mirrors CleaningBook exactly: own slots if there are any,
   * otherwise the shared grid. Admin and customer must not disagree about what
   * the schedule is.
   */
  const { data: slots = [] } = useQuery({
    queryKey: ["admin-cleaning-slots", providerId ?? "all", universalProviderId ?? "shared"],
    enabled: !providerId || universalProviderId !== undefined,
    queryFn: async () => {
      const base = () => supabaseDb
        .from("cleaning_available_slots")
        .select("*")
        .order("date", { ascending: true });

      // Platform-wide view (not embedded): everything, as before.
      if (!providerId) {
        const { data, error } = await base();
        if (error) throw error;
        return data ?? [];
      }
      if (universalProviderId) {
        const { data, error } = await base().eq("provider_id", universalProviderId);
        if (error) throw error;
        if ((data ?? []).length > 0) return data!;
      }
      const { data, error } = await base().is("provider_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bookingIdsInScope = useMemo(
    () => (bookings as any[]).map((b) => b.id).filter(Boolean) as string[],
    [bookings],
  );
  const { data: completionReports = [] } = useQuery({
    queryKey: ["admin-cleaning-reports", providerId ?? "all", bookingIdsInScope.join(",")],
    enabled: !providerId || bookingIdsInScope.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("cleaning_completion_reports")
        .select("*, cleaning_bookings(*)")
        .order("completed_at", { ascending: false });
      // Only reports whose booking is in this provider's scope when embedded.
      if (providerId) q = q.in("booking_id", bookingIdsInScope);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const completeBookingMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("complete_cleaning_booking", {
        p_booking_id: completionBookingId,
        p_checklist_completed: completion.checklist_completed,
        p_notes: completion.notes || null,
        p_photo_url: completion.photo_url || null,
        p_issue_report: completion.issue_report || null,
        p_completed_by: completion.completed_by || "Admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cleaning session marked completed");
      setCompletionBookingId("");
      setCompletion({ completed_by: "Admin", notes: "", photo_url: "", issue_report: "", checklist_completed: dailyChecklist });
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Could not complete booking"),
  });

  // Quick inline status change for a booking. Writes the status directly and
  // flags the calendar for re-sync so the Google event updates automatically.
  const setStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Cancelling isn't a status write: the visit is holding a slot seat and a
      // cleaning off the subscription, and both have to go back. Everything
      // else really is just a status.
      if (status === "cancelled") {
        const { cancelled } = await cancelCleaningBookings(supabaseDb, [id]);
        if (cancelled.length === 0) throw new Error("This booking is already cancelled or completed");
      } else {
        const { error } = await supabase
          .from("cleaning_bookings")
          .update({ status, google_calendar_sync_status: "pending", updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      }
      supabase._syncBookingToCalendar(id);
    },
    onSuccess: () => { toast.success("Status updated"); invalidateCleaning(); },
    onError: (error: Error) => toast.error(error.message || "Could not update status"),
  });

  const deleteBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.admin.deleteCleaningBooking(bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking deleted successfully");
      setDeleteBooking(null);
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete booking"),
  });

  const openReschedule = (booking: any) => {
    setRescheduleBooking(booking);
    setRescheduleDate(getBookingDate(booking) || "");
    setRescheduleSlotId("");
  };

  // Active slots for the date chosen in the reschedule dialog.
  const rescheduleSlots = useMemo(() => {
    if (!rescheduleDate) return [] as any[];
    return (slots as any[])
      .filter((s) => s.date === rescheduleDate && s.is_active)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }, [slots, rescheduleDate]);

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      const booking = rescheduleBooking;
      const oldSlotId = booking?.slot_id || booking?.cleaning_available_slots?.id;
      const newSlotId = rescheduleSlotId;
      if (!booking || !newSlotId) throw new Error("Pick a new slot");
      if (newSlotId === oldSlotId) throw new Error("Pick a different time slot");

      const { data: newSlot, error: nsErr } = await supabase
        .from("cleaning_available_slots").select("*").eq("id", newSlotId).single();
      if (nsErr || !newSlot) throw new Error("Slot not found");
      if (!newSlot.is_active) throw new Error("That slot is not available");
      if ((newSlot.current_bookings ?? 0) >= (newSlot.max_bookings ?? 0)) throw new Error("That slot is full");

      // Move the booking to the new slot (direct table write — the strict admin
      // PATCH DTO doesn't accept slot_id / calendar columns).
      const { error: upErr } = await supabase
        .from("cleaning_bookings")
        .update({ slot_id: newSlotId, google_calendar_sync_status: "pending" })
        .eq("id", booking.id);
      if (upErr) throw upErr;

      // Free up the old slot's capacity, then take one on the new slot.
      if (oldSlotId) {
        // supabaseDb, not the wrapper: the wrapper doesn't shim this function,
        // and until now it answered "success" for anything it didn't know — so
        // the fallback below never ran and every reschedule burned a seat.
        const { error: decErr } = await supabaseDb.rpc("decrement_slot_bookings", { p_slot_id: oldSlotId });
        if (decErr) {
          const { data: os } = await supabaseDb.from("cleaning_available_slots").select("current_bookings").eq("id", oldSlotId).single();
          if (os) await supabaseDb.from("cleaning_available_slots")
            .update({ current_bookings: Math.max(0, (os.current_bookings ?? 0) - 1) }).eq("id", oldSlotId);
        }
      }
      await supabase.from("cleaning_available_slots")
        .update({ current_bookings: (newSlot.current_bookings ?? 0) + 1 }).eq("id", newSlotId);

      // Re-sync the Google Calendar event to the new time (best effort).
      try {
        const { data } = await supabase.admin.syncCleaningBookingDirect(booking.id, {
          date: newSlot.date,
          startTime: String(newSlot.start_time).slice(0, 5),
          endTime: String(newSlot.end_time).slice(0, 5),
          clientName: getBookingClientName(booking),
          location: booking.location || booking.cleaning_clients?.location || undefined,
          status: booking.status || "booked",
          notes: booking.notes || undefined,
          googleCalendarEventId: booking.google_calendar_event_id || undefined,
        });
        if (data?.ok && data?.googleCalendarEventId) {
          await supabase
            .from("cleaning_bookings")
            .update({
              google_calendar_event_id: data.googleCalendarEventId,
              google_calendar_event_link: data.googleCalendarEventLink ?? null,
              google_calendar_sync_status: "synced",
            })
            .eq("id", booking.id);
        }
      } catch { /* calendar sync is best-effort */ }
    },
    onSuccess: () => {
      toast.success("Cleaning rescheduled");
      setRescheduleBooking(null);
      setRescheduleSlotId("");
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Could not reschedule"),
  });

  const syncCalendarMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const booking = bookings.find((candidate: any) => candidate.id === bookingId);
      const slot = booking?.cleaning_available_slots;

      if (booking && slot?.date && slot?.start_time && slot?.end_time) {
        const { data, error } = await supabase.admin.syncCleaningBookingDirect(bookingId, {
          date: slot.date,
          startTime: String(slot.start_time).slice(0, 5),
          endTime: String(slot.end_time).slice(0, 5),
          clientName: getBookingClientName(booking),
          location: booking.location || booking.cleaning_clients?.location || undefined,
          status: booking.status || "booked",
          notes: booking.notes || undefined,
          googleCalendarEventId: booking.google_calendar_event_id || undefined,
        });
        if (error) throw error;

        if (data?.ok && data?.googleCalendarEventId) {
          const { error: updateError } = await supabase.admin.updateCleaningBooking(bookingId, {
            google_calendar_event_id: data.googleCalendarEventId,
            google_calendar_event_link: data.googleCalendarEventLink ?? null,
            google_calendar_sync_status: "synced",
          });
          if (updateError) console.warn("Could not save calendar event ID to DB:", updateError);
        }

        return data;
      }

      const { data, error } = await supabase.admin.syncCleaningBookingCalendar(bookingId);
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      if (result?.ok === false) {
        toast.error(result.error || "Google Calendar sync failed");
      } else if (result?.skipped) {
        toast.warning(calendarSyncSkipMessage(result.skipReason));
      } else {
        toast.success("Booking synced to Google Calendar");
      }
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Google Calendar sync failed"),
  });

  const syncAllCalendarMutation = useMutation({
    mutationFn: async () => {
      const activeBookings = bookings.filter((booking: any) =>
        ["booked", "completed", "cancelled"].includes(booking.status)
      );
      const results: Array<{ ok: boolean; bookingId: string; error?: string }> = [];

      for (const booking of activeBookings) {
        const slot = booking.cleaning_available_slots;
        if (!slot?.date || !slot?.start_time || !slot?.end_time) {
          results.push({ ok: false, bookingId: booking.id, error: "Missing slot data" });
          continue;
        }

        const { data, error } = await supabase.admin.syncCleaningBookingDirect(booking.id, {
          date: slot.date,
          startTime: String(slot.start_time).slice(0, 5),
          endTime: String(slot.end_time).slice(0, 5),
          clientName: getBookingClientName(booking),
          location: booking.location || booking.cleaning_clients?.location || undefined,
          status: booking.status || "booked",
          notes: booking.notes || undefined,
          googleCalendarEventId: booking.google_calendar_event_id || undefined,
        });

        if (error) {
          results.push({ ok: false, bookingId: booking.id, error: error.message });
          continue;
        }

        if (data?.ok && data?.googleCalendarEventId) {
          await supabase
            .from("cleaning_bookings")
            .update({
              google_calendar_event_id: data.googleCalendarEventId,
              google_calendar_event_link: data.googleCalendarEventLink ?? null,
              google_calendar_sync_status: "synced",
            })
            .eq("id", booking.id);
        }

        results.push({ ok: data?.ok ?? false, bookingId: booking.id, ...(data?.ok ? {} : { error: data?.error }) });
      }

      const failed = results.filter((result) => !result.ok).length;
      return { ok: failed === 0, total: results.length, synced: results.length - failed, failed };
    },
    onSuccess: (result) => {
      if (!result.total) {
        toast.warning("No bookings to sync.");
      } else if (!result.ok) {
        toast.error(`Sync finished with ${result.failed} error${result.failed !== 1 ? "s" : ""}.`);
      } else {
        toast.success(`Calendar sync finished: ${result.synced}/${result.total} synced`);
      }
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Google Calendar bulk sync failed"),
  });

  // Reconcile: remove orphaned/stale Google events + push any unsynced bookings.
  const reconcileCalendarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi("/admin/cleaning/calendar/reconcile", { method: "POST" });
      if (error) throw error;
      return data as {
        ok: boolean; reason?: string;
        orphansDeleted?: number; duplicatesDeleted?: number; skipped?: number;
      };
    },
    onSuccess: (r) => {
      if (r?.reason === "not_configured") {
        toast.warning("Google Calendar is not configured.");
      } else {
        const removed = (r.orphansDeleted ?? 0) + (r.duplicatesDeleted ?? 0);
        toast.success(`Calendar reconciled — ${removed} stale event${removed !== 1 ? "s" : ""} removed.`);
      }
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Calendar reconcile failed"),
  });

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const bookedDates = useMemo(
    () =>
      bookings
        .filter((booking: any) => booking.status === "booked" && booking.cleaning_available_slots?.date)
        .map((booking: any) => new Date(`${booking.cleaning_available_slots.date}T00:00:00`)),
    [bookings],
  );
  const slotDates = useMemo(
    () => slots.map((slot: any) => new Date(`${slot.date}T00:00:00`)),
    [slots],
  );
  const isCancelled = (status: string) =>
    status?.toLowerCase() === "cancelled";

  // Calendar day view: exclude cancelled bookings so they don't clutter the schedule
  const bookingsForSelectedDate = useMemo(
    () => bookings.filter(
      (booking: any) =>
        booking.cleaning_available_slots?.date === selectedDateKey &&
        !isCancelled(booking.status),
    ),
    [bookings, selectedDateKey],
  );
  const slotsForSelectedDate = useMemo(
    () => slots.filter((slot: any) => slot.date === selectedDateKey),
    [slots, selectedDateKey],
  );

  /** Slot date of a booking, "" when it somehow has no slot. */
  const bookingDate = (b: any): string => b.cleaning_available_slots?.date ?? "";

  /**
   * Who each booking is for, as one searchable string. Built once so the
   * customer filter and the search box agree on what a name is.
   */
  const bookingCustomer = (b: any): string =>
    b.customer_name || b.users?.display_name || b.users?.name ||
    b.cleaning_clients?.company_name || b.users?.email || "—";

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    bookings.forEach((b: any) => { const n = bookingCustomer(b); if (n !== "—") names.add(n); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [bookings]);

  /**
   * The list opened on the oldest booking on record and counted forward, so an
   * admin looking for tomorrow's visit landed weeks in the past. Upcoming is
   * what this page is for; Past and All are one click away.
   */
  const filteredBookings = useMemo(() => {
    const today = todayHN();
    const q = bookingSearch.trim().toLowerCase();
    return bookings.filter((b: any) => {
      const d = bookingDate(b);
      if (period === "upcoming" && d && d < today) return false;
      if (period === "past" && (!d || d >= today)) return false;
      if (dateFrom && d && d < dateFrom) return false;
      if (dateTo   && d && d > dateTo)   return false;
      if (customer !== "all" && bookingCustomer(b) !== customer) return false;
      if (hideCompleted && b.status === "completed") return false;
      if (q) {
        const hay = `${bookingCustomer(b)} ${b.notes ?? ""} ${b.location ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, period, dateFrom, dateTo, customer, hideCompleted, bookingSearch]);

  const visibleBookings = useMemo(() => {
    // Past reads newest-first (what happened most recently); everything else
    // soonest-first (what's coming up).
    const dir = period === "past" ? -1 : 1;
    return [...filteredBookings].sort((a: any, b: any) => {
      const dateA = bookingDate(a), dateB = bookingDate(b);
      if (dateA !== dateB) return (dateA < dateB ? -1 : 1) * dir;
      const timeA = a.cleaning_available_slots?.start_time ?? "";
      const timeB = b.cleaning_available_slots?.start_time ?? "";
      return (timeA < timeB ? -1 : timeA > timeB ? 1 : 0) * dir;
    });
  }, [filteredBookings, period]);

  // Counts the toggle's label needs — of what the OTHER filters already left,
  // so "Show completed (59)" doesn't promise rows the date filter will hide.
  const completedCount = useMemo(
    () => bookings.filter((b: any) => {
      const d = bookingDate(b);
      const today = todayHN();
      if (period === "upcoming" && d && d < today) return false;
      if (period === "past" && (!d || d >= today)) return false;
      return b.status === "completed";
    }).length,
    [bookings, period],
  );

  const bookingsPager = usePagination(visibleBookings, 25);
  const pagedBookings = bookingsPager.paged;

  const stats = useMemo(
    () => ({
      upcoming: bookings.filter((booking: any) => booking.status === "booked").length,
      completed: bookings.filter((booking: any) => booking.status === "completed").length,
      total: bookings.length,
      reports: completionReports.length,
    }),
    [bookings, completionReports],
  );

  // (Auto-sync removed — use the Sync All button manually to avoid unintended side effects)

  const toggleChecklistItem = (item: string) => {
    setCompletion((current) => ({
      ...current,
      checklist_completed: current.checklist_completed.includes(item)
        ? current.checklist_completed.filter((candidate) => candidate !== item)
        : [...current.checklist_completed, item],
    }));
  };

  const handleCompletionPhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCompletion((current) => ({ ...current, photo_url: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  // Bookings · Calendar · Reports, remembered across a reload like every other
  // tab strip — see useTabParam.
  const [opsTab, setOpsTab] = useTabParam(["bookings", "calendar", "reports"] as const);

  const body = (
    <>
      {/* KPI tiles + sub-tabs are for the admin-standalone view only. Inside the
          provider workspace the analytics widget above the tabs already carries
          the same numbers, and there's only one sub-tab (Reports) — so both are
          pure noise there. */}
      {!embedded && (
        <div className="grid grid-cols-2 gap-space-2 md:grid-cols-4 md:gap-space-3">
          {[
            { label: "Upcoming", value: stats.upcoming, icon: CalendarDays },
            { label: "Completed", value: stats.completed, icon: CheckCircle2 },
            { label: "Total Bookings", value: stats.total, icon: ListChecks },
            { label: "Reports", value: stats.reports, icon: SparklesIcon },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="px-space-4 py-space-3">
                <p className="flex items-center gap-space-2 text-sm text-muted-foreground">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* The tab strip renders in BOTH modes.
          It used to be hidden when `embedded`, which — once the standalone
          /admin/cleaning route became a redirect — left the Bookings and
          Calendar tabs with no way to reach them in production. That stranded
          Sync-all, Calendar reconcile, Reschedule, per-booking delete and the
          day calendar: mounted, working, unreachable. */}
      <Tabs value={opsTab} onValueChange={setOpsTab} variant="pills" className={cn("w-full", !embedded && "mt-space-4")}>
        <TabsList className="mb-2">
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="reports">Completion Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Card>
            <CardHeader className="flex flex-col gap-space-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Cleaning Bookings</CardTitle>
                <p className="mt-space-1 text-sm text-muted-foreground">
                  Sync booked sessions to Google Calendar and mark completed services.
                </p>
                {/* Which calendar, said out loud. The screen promised a sync to
                    "Google Calendar" without ever naming one: the binding is
                    providers.google_calendar_id, editable on an admin page
                    reached only from the marketplace hub, and when it is empty
                    — as it is for every provider — events go to the calendar
                    named by a server env var the browser cannot read. */}
                <CalendarTargetLine providerId={universalProviderId} />
              </div>
              <div className="flex items-center gap-space-2">
                {completedCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setHideCompleted((v) => !v)}
                  >
                    {hideCompleted ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                    {hideCompleted ? `Show completed (${completedCount})` : "Hide completed"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  loading={reconcileCalendarMutation.isPending}
                  disabled={reconcileCalendarMutation.isPending}
                  onClick={() => reconcileCalendarMutation.mutate()}
                  title="Remove orphaned/stale Google Calendar events and sync any pending bookings"
                >
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  Reconcile
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={syncAllCalendarMutation.isPending}
                  disabled={bookings.length === 0 || syncAllCalendarMutation.isPending}
                  onClick={() => syncAllCalendarMutation.mutate()}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Sync all
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filter bar. The list used to open on every booking ever made,
                  oldest first, with completed ones mixed in — finding tomorrow
                  meant scrolling past a month of history. */}
              <div className="mb-space-4 flex flex-wrap items-center gap-space-2">
                <div className="flex gap-1">
                  {([
                    { key: "upcoming", label: "Upcoming" },
                    { key: "past",     label: "Past" },
                    { key: "all",      label: "All" },
                  ] as const).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => { setPeriod(p.key); }}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        period === p.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <Input
                  value={bookingSearch}
                  onChange={(e) => { setBookingSearch(e.target.value); }}
                  placeholder="Search customer, notes…"
                  className="h-9 w-48"
                />

                <Select value={customer} onValueChange={(v) => { setCustomer(v); }}>
                  <SelectTrigger className="h-9 w-48"><SelectValue placeholder="All customers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All customers</SelectItem>
                    {customerOptions.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                  <Input
                    type="date" value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); }}
                    className="h-9 w-36" aria-label="From date"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input
                    type="date" value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); }}
                    className="h-9 w-36" aria-label="To date"
                  />
                </div>

                {(period !== "upcoming" || customer !== "all" || dateFrom || dateTo || bookingSearch) && (
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => {
                      setPeriod("upcoming"); setCustomer("all");
                      setDateFrom(""); setDateTo(""); setBookingSearch("");
                                          }}
                  >
                    Reset
                  </Button>
                )}

                <span className="ml-auto text-xs text-muted-foreground">
                  {visibleBookings.length} of {bookings.length}
                </span>
              </div>

              {bookingsLoading ? (
                <p className="py-space-8 text-center text-muted-foreground">Loading bookings...</p>
              ) : bookings.length === 0 ? (
                <TabEmptyState icon={CalendarDays} title="No cleaning bookings" subtitle="Bookings created from subscriptions or assigned plans will appear here." />
              ) : visibleBookings.length === 0 ? (
                <TabEmptyState
                  icon={CalendarDays}
                  title="Nothing matches these filters"
                  subtitle={period === "upcoming"
                    ? "No upcoming visits. Switch to Past or All to see earlier ones."
                    : "Try widening the date range or clearing the customer filter."}
                />
              ) : (
                <>
                  <div className="space-y-space-3 md:hidden">
                    {pagedBookings.map((booking: any) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        syncing={syncCalendarMutation.isPending && syncCalendarMutation.variables === booking.id}
                        onSync={() => syncCalendarMutation.mutate(booking.id)}
                        onComplete={() => setCompletionBookingId(booking.id)}
                        onReschedule={() => openReschedule(booking)}
                        onDelete={() => setDeleteBooking(booking)}
                      />
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Calendar</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedBookings.map((booking: any) => (
                          <TableRow key={booking.id}>
                            <TableCell className="font-medium">{getBookingClientName(booking)}</TableCell>
                            <TableCell>
                              <span className="flex flex-wrap items-center gap-1.5">
                                {/* Visits the partner booked, not us. */}
                                <SaleOriginBadge source={booking.source} />
                              </span>
                            </TableCell>
                            <TableCell>
                              {getBookingDate(booking) ? format(new Date(`${getBookingDate(booking)}T00:00:00`), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell>
                              {to12h(booking.cleaning_available_slots?.start_time)} - {to12h(booking.cleaning_available_slots?.end_time)}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={["booked", "completed", "cancelled"].includes(booking.status) ? booking.status : "booked"}
                                onValueChange={(v) => { if (v !== booking.status) setStatusMutation.mutate({ id: booking.id, status: v }); }}
                              >
                                <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="booked">Booked</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-space-1">
                                <StatusPill
                                  className="w-fit"
                                  status={booking.google_calendar_sync_status ?? "pending"}
                                  label={calendarStatusLabel(booking.google_calendar_sync_status)}
                                />
                                {booking.google_calendar_sync_error ? (
                                  <p className="max-w-[240px] truncate text-xs text-destructive">{booking.google_calendar_sync_error}</p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <BookingActionsMenu
                                  booking={booking}
                                  syncing={syncCalendarMutation.isPending && syncCalendarMutation.variables === booking.id}
                                  onSync={() => syncCalendarMutation.mutate(booking.id)}
                                  onComplete={() => setCompletionBookingId(booking.id)}
                                  onReschedule={() => openReschedule(booking)}
                                  onDelete={() => setDeleteBooking(booking)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePagination {...bookingsPager} onPage={bookingsPager.setPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid gap-space-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-space-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Calendar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="w-full rounded-radius-lg bg-card"
                  modifiers={{ booked: bookedDates, slot: slotDates }}
                  modifiersClassNames={{
                    booked: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    slot: "ring-1 ring-primary/50",
                  }}
                />
                <div className="mt-space-4 grid gap-space-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-1">
                  <div className="flex items-center gap-space-2"><span className="h-3 w-3 rounded-radius-full bg-primary" />Booked cleaning</div>
                  <div className="flex items-center gap-space-2"><span className="h-3 w-3 rounded-radius-full border border-primary" />Available slot</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-space-5">
                <section>
                  <div className="mb-space-3 flex items-center gap-space-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h3 className="text-card-title">Bookings</h3>
                    <Badge variant="secondary">{bookingsForSelectedDate.length}</Badge>
                  </div>
                  {bookingsForSelectedDate.length === 0 ? (
                    <TabEmptyState icon={CalendarDays} title="No bookings for this day" subtitle="Booked cleanings will appear here." />
                  ) : (
                    <div className="space-y-space-3">
                      {bookingsForSelectedDate.map((booking: any) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          syncing={syncCalendarMutation.isPending && syncCalendarMutation.variables === booking.id}
                          onSync={() => syncCalendarMutation.mutate(booking.id)}
                          onComplete={() => setCompletionBookingId(booking.id)}
                          onReschedule={() => openReschedule(booking)}
                          onDelete={() => setDeleteBooking(booking)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-space-3 flex items-center gap-space-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="text-card-title">Slots</h3>
                    <Badge variant="secondary">{slotsForSelectedDate.length}</Badge>
                  </div>
                  {slotsForSelectedDate.length === 0 ? (
                    <TabEmptyState icon={Clock} title="No available slots" subtitle="Available cleaning slots for this day will appear here." />
                  ) : (
                    <div className="grid gap-space-3 sm:grid-cols-2">
                      {slotsForSelectedDate.map((slot: any) => {
                        const remaining = Math.max(0, Number(slot.max_bookings || 0) - Number(slot.current_bookings || 0));
                        return (
                          <div key={slot.id} className="rounded-radius-lg bg-card p-space-4">
                            <p className="text-card-title">{to12h(slot.start_time)} - {to12h(slot.end_time)}</p>
                            <p className="mt-space-1 text-sm text-muted-foreground">{slot.current_bookings} booked of {slot.max_bookings}</p>
                            <Badge className="mt-space-3" variant={remaining > 0 ? "default" : "destructive"}>
                              {remaining > 0 ? `${remaining} open` : "Full"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          {/* Wrapper Card + duplicate "Completion Reports" title removed —
              the surrounding tab already carries the label. Section overline
              gives a scannable count. */}
          <SectionOverline label="Completion reports" count={completionReports.length} className="mb-3" />
          {completionReports.length === 0 ? (
            <TabEmptyState
              icon={SparklesIcon}
              title="No completion reports yet"
              subtitle="Completed sessions will appear here with checklist, notes, and photo links."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl bg-card">
              <ul className="divide-y divide-border/40">
                {completionReports.map((report: any) => {
                  const hasNotes = !!(report.notes && report.notes.trim());
                  const hasIssue = !!(report.issue_report && report.issue_report.trim());
                  const hasPhoto = !!report.photo_url;
                  const checklistCount = (report.checklist_completed || []).length;
                  return (
                    <li key={report.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <p className="text-sm font-semibold text-foreground">
                              {format(new Date(report.completed_at), "MMM d, yyyy · HH:mm")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              by {report.completed_by || "—"}
                            </p>
                          </div>
                          {/* Only surface the meta line when there's something worth
                              seeing. Zero-info rows used to blast "No notes /
                              Checklist items completed: 6" every time. */}
                          {(hasNotes || hasIssue || checklistCount > 0) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {checklistCount > 0 && <span>{checklistCount} checklist item{checklistCount === 1 ? "" : "s"}</span>}
                              {hasNotes && <span> · has notes</span>}
                              {hasIssue && <span className="text-amber-500"> · issue reported</span>}
                            </p>
                          )}
                          {hasNotes && (
                            <p className="mt-2 line-clamp-2 text-sm text-foreground/90">{report.notes}</p>
                          )}
                          {hasIssue && (
                            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                              {report.issue_report}
                            </p>
                          )}
                          {hasPhoto && (
                            <a
                              className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline"
                              href={report.photo_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View photo
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(completionBookingId)} onOpenChange={(open) => !open && setCompletionBookingId("")}>
        <DialogContent className="flex max-h-[90vh] w-full flex-col sm:max-w-lg md:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Complete Cleaning Session</DialogTitle>
            <DialogDescription>Add checklist status, notes, photo URL, and any issue report.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid gap-space-4 pb-2">
              <Input label="Completed by" value={completion.completed_by} onChange={(event) => setCompletion((current) => ({ ...current, completed_by: event.target.value }))} />
              <div>
                <Label>Checklist completed</Label>
                <div className="mt-space-3 grid gap-space-2">
                  {dailyChecklist.map((item) => (
                    <label key={item} className="flex items-start gap-space-2 rounded-radius-md bg-secondary p-space-3">
                      <Checkbox checked={completion.checklist_completed.includes(item)} onCheckedChange={() => toggleChecklistItem(item)} />
                      <span className="text-sm">{item}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Textarea label="Notes" value={completion.notes} onChange={(event) => setCompletion((current) => ({ ...current, notes: event.target.value }))} />
              <Input
                label="Photo upload after cleaning"
                type="file"
                accept="image/*"
                onChange={handleCompletionPhotoUpload}
                helperText={completion.photo_url?.startsWith("data:") ? "Photo attached to this report" : "Attach a photo from the completed session"}
              />
              <Input label="Photo URL after cleaning" value={completion.photo_url} onChange={(event) => setCompletion((current) => ({ ...current, photo_url: event.target.value }))} />
              <Textarea label="Missing / broken / damaged / unusual report" value={completion.issue_report} onChange={(event) => setCompletion((current) => ({ ...current, issue_report: event.target.value }))} />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setCompletionBookingId("")}>Cancel</Button>
            <Button onClick={() => completeBookingMutation.mutate()} loading={completeBookingMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Mark completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule cleaning */}
      <Dialog open={Boolean(rescheduleBooking)} onOpenChange={(open) => { if (!open) { setRescheduleBooking(null); setRescheduleSlotId(""); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reschedule cleaning</DialogTitle>
            <DialogDescription>
              {rescheduleBooking ? getBookingClientName(rescheduleBooking) : ""}
              {rescheduleBooking?.cleaning_available_slots ? (
                <> · currently {getBookingDate(rescheduleBooking) ? format(new Date(`${getBookingDate(rescheduleBooking)}T00:00:00`), "MMM d") : ""} {to12h(rescheduleBooking.cleaning_available_slots.start_time)}</>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-space-4">
            <div>
              <Label htmlFor="reschedule-date">New date</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleSlotId(""); }}
              />
            </div>

            <div>
              <Label>Available times</Label>
              {rescheduleSlots.length === 0 ? (
                <p className="mt-space-1 text-sm text-muted-foreground">No slots for this date.</p>
              ) : (
                <div className="mt-space-2 grid grid-cols-2 gap-space-2">
                  {rescheduleSlots.map((s: any) => {
                    const remaining = (s.max_bookings ?? 0) - (s.current_bookings ?? 0);
                    const isCurrent = s.id === (rescheduleBooking?.slot_id || rescheduleBooking?.cleaning_available_slots?.id);
                    const full = remaining <= 0 && !isCurrent;
                    const selected = rescheduleSlotId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={full || isCurrent}
                        onClick={() => setRescheduleSlotId(s.id)}
                        className={cn(
                          "rounded-radius-md border px-space-3 py-space-2 text-left transition-colors",
                          selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40",
                          (full || isCurrent) && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <p className="text-sm font-bold text-foreground">{to12h(s.start_time)}</p>
                        <p className="text-xs text-muted-foreground">
                          {isCurrent ? "Current" : full ? "Full" : `${remaining} open`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRescheduleBooking(null)}>Cancel</Button>
            <Button
              onClick={() => rescheduleMutation.mutate()}
              loading={rescheduleMutation.isPending}
              disabled={!rescheduleSlotId || rescheduleMutation.isPending}
            >
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete booking confirmation */}
      <AlertDialog open={Boolean(deleteBooking)} onOpenChange={(open) => !open && setDeleteBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBooking && (
                <span className="mb-1 block font-medium text-foreground">
                  {getBookingClientName(deleteBooking)}
                  {getBookingDate(deleteBooking)
                    ? ` · ${format(new Date(`${getBookingDate(deleteBooking)}T00:00:00`), "MMM d, yyyy")}`
                    : ""}
                  {deleteBooking.cleaning_available_slots?.start_time
                    ? ` · ${to12h(deleteBooking.cleaning_available_slots.start_time)}`
                    : ""}
                </span>
              )}
              This action cannot be undone. The booking and its Google Calendar event will be
              removed. The customer and subscription will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBookingMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBookingMutation.isPending}
              onClick={() => deleteBooking && deleteBookingMutation.mutate(deleteBooking.id)}
            >
              {deleteBookingMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Cleaning Operations" subtitle="Operational booking calendar and cleaning completion reports">
      {body}
    </SuperAdminLayout>
  );
};

function BookingCard({
  booking,
  syncing,
  onSync,
  onComplete,
  onReschedule,
  onDelete,
}: {
  booking: any;
  syncing: boolean;
  onSync: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-radius-lg border border-border bg-card p-space-4">
      <div className="flex items-start justify-between gap-space-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{getBookingClientName(booking)}</p>
          <p className="mt-space-1 text-sm text-muted-foreground">
            {getBookingDate(booking) ? format(new Date(`${getBookingDate(booking)}T00:00:00`), "MMM d, yyyy") : "—"}
            {" · "}
            {to12h(booking.cleaning_available_slots?.start_time)} - {to12h(booking.cleaning_available_slots?.end_time)}
          </p>
        </div>
        <StatusPill status={booking.status} />
      </div>

      <div className="mt-space-3 flex flex-wrap items-center gap-space-2">
        <SaleOriginBadge source={booking.source} />
        <StatusPill
          status={booking.google_calendar_sync_status ?? "pending"}
          label={calendarStatusLabel(booking.google_calendar_sync_status)}
        />
      </div>

      {/* Two independent conditions, not a chained ternary. The old
          `status !== "completed" ? … : status === "booked" ? …` put Reschedule
          in the else-branch of "not completed", so it could only render when
          the booking WAS completed — i.e. never. A booked visit needs both
          actions. */}
      <div className="mt-space-3 flex items-center gap-space-2">
        {booking.status !== "completed" && (
          <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={onComplete}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Mark complete
          </Button>
        )}
        {booking.status === "booked" && (
          <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={onReschedule}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Reschedule
          </Button>
        )}
        <BookingActionsMenu
          booking={booking}
          syncing={syncing}
          onSync={onSync}
          onComplete={onComplete}
          onReschedule={onReschedule}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

// ─── Consolidated actions menu ─────────────────────────────────────────────
// Every row has ~5 possible actions (Sync, Complete, Reschedule, Open in
// Calendar, Delete). Putting them all inline created visual noise the user
// called out. Collapsing to one ⋯ button per row keeps the row scannable and
// still surfaces every action via the dropdown.
function BookingActionsMenu({
  booking,
  syncing,
  onSync,
  onComplete,
  onReschedule,
  onDelete,
}: {
  booking: any;
  syncing: boolean;
  onSync: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="iconSm" variant="tertiary" aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {booking.status !== "completed" ? (
          <DropdownMenuItem onSelect={onComplete}>
            <CheckCircle2 className="h-4 w-4" /> Mark complete
          </DropdownMenuItem>
        ) : null}
        {booking.status !== "cancelled" ? (
          <DropdownMenuItem onSelect={onReschedule}>
            <CalendarClock className="h-4 w-4" /> Reschedule
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onSync} disabled={syncing}>
          <RotateCcw className="h-4 w-4" /> {syncing ? "Syncing…" : "Sync to Calendar"}
        </DropdownMenuItem>
        {booking.google_calendar_event_link ? (
          <DropdownMenuItem asChild>
            <a href={booking.google_calendar_event_link} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Open in Calendar
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default CleaningManagement;
