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
  RotateCcw,
  SparklesIcon,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { EmptyState } from "@/components/EmptyState";
import { supabase, adminApi } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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

const dailyChecklist = [
  "Take out trash",
  "Wipe down surfaces",
  "Organize chairs, tables, monitors, cables, and general workspace setup",
  "General visual tidying and upkeep",
  "Refill / set up water jug and cups",
  "Report if anything is missing, broken, damaged, or unusual",
];

const statusColor = (status?: string | null) => {
  switch (status) {
    case "booked":
    case "paid":
    case "active":
    case "synced":
      return "default";
    case "completed":
    case "paused":
    case "pending":
      return "secondary";
    case "cancelled":
    case "archived":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
};

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

const to12h = (time?: string | null) => {
  if (!time) return "—";
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};

const getUserName = (user: any) => {
  if (!user) return "Unknown";
  return user.display_name || user.name || user.email || "Unknown";
};

const getBookingClientName = (booking: any) =>
  booking.cleaning_clients?.company_name || getUserName(booking.users);

const getBookingDate = (booking: any) => booking.cleaning_available_slots?.date ?? "";

const CleaningManagement = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [completionBookingId, setCompletionBookingId] = useState<string>("");
  const [deleteBooking, setDeleteBooking] = useState<any | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
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

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-cleaning-bookings"],
    queryFn: async () => {
      // Load bookings without relying on FK joins (TEXT vs UUID type mismatch breaks them)
      const { data: rawBookings, error } = await supabase
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(id, date, start_time, end_time), cleaning_custom_plans(*), cleaning_completion_reports(*)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!rawBookings?.length) return [];

      // Separately load clients and users to avoid PostgREST FK type-mismatch issues
      const clientIds = [...new Set(rawBookings.map((b: any) => b.client_id).filter(Boolean))];
      const userIds   = [...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean))];

      const [clientsRes, usersRes] = await Promise.all([
        clientIds.length
          ? supabase.from("cleaning_clients").select("id, company_name, location, email, phone").in("id", clientIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? supabase.from("users").select("id, display_name, name, email").in("id", userIds)
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

  const { data: slots = [] } = useQuery({
    queryKey: ["admin-cleaning-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_available_slots")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: completionReports = [] } = useQuery({
    queryKey: ["admin-cleaning-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_completion_reports")
        .select("*, cleaning_bookings(*)")
        .order("completed_at", { ascending: false });
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
      const { error } = await supabase
        .from("cleaning_bookings")
        .update({ status, google_calendar_sync_status: "pending", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
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
        const { error: decErr } = await supabase.rpc("decrement_slot_bookings", { p_slot_id: oldSlotId });
        if (decErr) {
          const { data: os } = await supabase.from("cleaning_available_slots").select("current_bookings").eq("id", oldSlotId).single();
          if (os) await supabase.from("cleaning_available_slots")
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
          planName: booking.cleaning_custom_plans?.plan_name || undefined,
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
          planName: booking.cleaning_custom_plans?.plan_name || undefined,
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
          planName: booking.cleaning_custom_plans?.plan_name || undefined,
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

  const sortedBookings = useMemo(
    () =>
      [...bookings].sort((a: any, b: any) => {
        const dateA = a.cleaning_available_slots?.date ?? "";
        const dateB = b.cleaning_available_slots?.date ?? "";
        if (dateA !== dateB) return dateA < dateB ? -1 : 1;
        const timeA = a.cleaning_available_slots?.start_time ?? "";
        const timeB = b.cleaning_available_slots?.start_time ?? "";
        return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
      }),
    [bookings],
  );

  const completedCount = useMemo(
    () => sortedBookings.filter((b: any) => b.status === "completed").length,
    [sortedBookings],
  );
  const visibleBookings = useMemo(
    () => (hideCompleted ? sortedBookings.filter((b: any) => b.status !== "completed") : sortedBookings),
    [sortedBookings, hideCompleted],
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

  return (
    <SuperAdminLayout title="Cleaning Operations" subtitle="Operational booking calendar and cleaning completion reports">
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

      <Tabs defaultValue="bookings" variant="pills" className="mt-space-4 w-full">
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
              {bookingsLoading ? (
                <p className="py-space-8 text-center text-muted-foreground">Loading bookings...</p>
              ) : bookings.length === 0 ? (
                <EmptyState title="No cleaning bookings" description="Bookings created from subscriptions or assigned plans will appear here." compact />
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
                              <Badge variant={booking.custom_plan_id ? "secondary" : "outline"}>
                                {booking.custom_plan_id ? "Private" : "Public"}
                              </Badge>
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
                                <Badge className="w-fit" variant={statusColor(booking.google_calendar_sync_status) as any}>
                                  {calendarStatusLabel(booking.google_calendar_sync_status)}
                                </Badge>
                                {booking.google_calendar_sync_error ? (
                                  <p className="max-w-[240px] truncate text-xs text-destructive">{booking.google_calendar_sync_error}</p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-space-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  loading={syncCalendarMutation.isPending && syncCalendarMutation.variables === booking.id}
                                  onClick={() => syncCalendarMutation.mutate(booking.id)}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                  Sync
                                </Button>
                                {booking.status !== "completed" ? (
                                  <Button type="button" size="sm" variant="secondary" onClick={() => setCompletionBookingId(booking.id)}>
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Complete
                                  </Button>
                                ) : null}
                                {booking.status !== "cancelled" ? (
                                  <Button type="button" size="sm" variant="secondary" onClick={() => openReschedule(booking)}>
                                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                                    Reschedule
                                  </Button>
                                ) : null}
                                {booking.google_calendar_event_link ? (
                                  <Button type="button" size="iconSm" variant="tertiary" asChild aria-label="Open Calendar Event">
                                    <a href={booking.google_calendar_event_link} target="_blank" rel="noreferrer">
                                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                    </a>
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  size="iconSm"
                                  variant="tertiary"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label="Delete booking"
                                  onClick={() => setDeleteBooking(booking)}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
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
                    <EmptyState title="No bookings for this day" description="Booked cleanings will appear here." compact />
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
                    <EmptyState title="No available slots" description="Available cleaning slots for this day will appear here." compact />
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
          <Card>
            <CardHeader>
              <CardTitle>Completion Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {completionReports.length === 0 ? (
                <EmptyState title="No completion reports yet" description="Completed sessions will appear here with checklist, notes, and photo links." compact />
              ) : (
                <div className="grid gap-space-4 lg:grid-cols-2">
                  {completionReports.map((report: any) => (
                    <article key={report.id} className="rounded-radius-lg bg-secondary p-space-5">
                      <div className="flex items-start justify-between gap-space-3">
                        <div>
                          <h3 className="text-card-title">{report.completed_by}</h3>
                          <p className="mt-space-1 text-sm text-muted-foreground">
                            {format(new Date(report.completed_at), "MMM d, yyyy HH:mm")}
                          </p>
                        </div>
                        <Badge variant="default">Completed</Badge>
                      </div>
                      <p className="mt-space-4 text-sm">{report.notes || "No notes"}</p>
                      {report.issue_report ? (
                        <p className="mt-space-3 rounded-radius-md bg-background p-space-3 text-sm text-muted-foreground">
                          {report.issue_report}
                        </p>
                      ) : null}
                      {report.photo_url ? (
                        <a className="mt-space-3 inline-flex text-sm font-semibold text-primary" href={report.photo_url} target="_blank" rel="noreferrer">
                          View photo
                        </a>
                      ) : null}
                      <p className="mt-space-3 text-xs text-muted-foreground">
                        Checklist items completed: {(report.checklist_completed || []).length}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
        <Badge variant={statusColor(booking.status) as any}>{booking.status || "unknown"}</Badge>
      </div>

      <div className="mt-space-3 flex flex-wrap items-center gap-space-2">
        <Badge variant={booking.custom_plan_id ? "secondary" : "outline"}>
          {booking.custom_plan_id ? "Private" : "Public"}
        </Badge>
        <Badge variant={statusColor(booking.google_calendar_sync_status) as any}>
          {calendarStatusLabel(booking.google_calendar_sync_status)}
        </Badge>
      </div>

      <div className="mt-space-3 flex flex-wrap gap-space-2">
        <Button type="button" size="sm" variant="secondary" loading={syncing} onClick={onSync}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Sync
        </Button>
        {booking.status !== "completed" ? (
          <Button type="button" size="sm" variant="secondary" onClick={onComplete}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Complete
          </Button>
        ) : null}
        {booking.status === "booked" ? (
          <Button type="button" size="sm" variant="secondary" onClick={onReschedule}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Reschedule
          </Button>
        ) : null}
        {booking.google_calendar_event_link ? (
          <Button type="button" size="sm" variant="tertiary" asChild>
            <a href={booking.google_calendar_event_link} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="tertiary"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </div>
  );
}

export default CleaningManagement;
