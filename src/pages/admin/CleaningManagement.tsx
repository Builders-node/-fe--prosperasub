import { type ChangeEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { todayHN, nowHN, formatTimestampHN, HN_TZ } from "@/lib/timezone";
import {
  Archive,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SparklesIcon,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { EmptyState } from "@/components/EmptyState";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
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
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const weekdayOptions = [
  { label: "Monday", value: "MONDAY", short: "Mon" },
  { label: "Tuesday", value: "TUESDAY", short: "Tue" },
  { label: "Wednesday", value: "WEDNESDAY", short: "Wed" },
  { label: "Thursday", value: "THURSDAY", short: "Thu" },
  { label: "Friday", value: "FRIDAY", short: "Fri" },
  { label: "Saturday", value: "SATURDAY", short: "Sat" },
  { label: "Sunday", value: "SUNDAY", short: "Sun" },
];

const dailyChecklist = [
  "Take out trash",
  "Wipe down surfaces",
  "Organize chairs, tables, monitors, cables, and general workspace setup",
  "General visual tidying and upkeep",
  "Refill / set up water jug and cups",
  "Report if anything is missing, broken, damaged, or unusual",
];

const deepChecklist = [
  "Clean microwave",
  "Clean refrigerators",
  "Dust library, monitors, and other surfaces",
  "Sweep and mop floors",
  "Clean bean bags as needed",
  "Wipe down swivel chairs",
  "Clean cowork door and interior windows with glass cleaner",
  "Take out trash and replace bags",
  "Wipe down all surfaces",
  "Organize workspace",
  "Refill water jug and cups",
  "Report missing, broken, damaged, or unusual items",
];

const initialForm = {
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  location: "",
  service_type: "",
  notes: "",
  internal_admin_notes: "",
  start_date: todayHN(),
  end_date: "",
  status: "active",
  plan_name: "",
  custom_price: "10",
  billing_type: "daily",
  monthly_invoice: true,
  payment_timing: "after_service_completed",
  custom_terms: "Monthly invoice after services are completed",
  service_frequency: "daily",
  days_of_week: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
  deep_cleaning_add_on: false,
  estimated_monthly_total: "240",
  preferred_start_time: "08:00",
  preferred_end_time: "10:00",
  service_duration_minutes: "120",
  repeat_frequency: "weekly",
};

const initialClientEditForm = {
  id: "",
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  location: "",
  service_type: "",
  notes: "",
  internal_admin_notes: "",
  status: "active",
};

const toLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toCents = (value: string) => Math.round(Number(value || 0) * 100);
const formatUSD = (cents?: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const normalizeSearch = (value?: string | null) => String(value || "").trim().toLowerCase();
const normalizePhone = (value?: string | null) => String(value || "").replace(/\D/g, "");
const formatDateLabel = (value?: string | null) => value ? format(new Date(`${value}T00:00:00`), "MMM d, yyyy") : "—";

const getSubscriptionMonths = (subscription: any) => Number(subscription.billing_period_months) || 1;
const getSubscriptionMonthlyPrice = (subscription: any) => {
  if (Number(subscription.monthly_price_cents)) return Number(subscription.monthly_price_cents);
  const cleanings = Number(subscription.cleaning_packages?.cleanings_per_month) || 4;
  const pricePerCleaning = subscription.package_id === "cleaning-2-bedroom" ? 2475 : 1975;
  return cleanings * pricePerCleaning;
};
const getSubscriptionTotalPrice = (subscription: any) =>
  Number(subscription.total_price_cents) || getSubscriptionMonthlyPrice(subscription) * getSubscriptionMonths(subscription);
const getSubscriptionStatus = (subscription: any) =>
  subscription.subscription_status || (subscription.is_active ? "active" : "inactive");

const serviceFrequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const formatServiceFrequency = (value?: string | null) =>
  serviceFrequencyOptions.find((option) => option.value === value)?.label || value || "Custom";

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

const findSimilarClient = (clients: any[] = [], formValue: typeof initialForm) => {
  const email = normalizeSearch(formValue.email);
  const phone = normalizePhone(formValue.phone);
  const company = normalizeSearch(formValue.company_name);
  const location = normalizeSearch(formValue.location);

  if (!email && !phone && !company) return null;

  return clients.find((client) => {
    const clientEmail = normalizeSearch(client.email);
    const clientPhone = normalizePhone(client.phone);
    const clientCompany = normalizeSearch(client.company_name);
    const clientLocation = normalizeSearch(client.location);

    return (
      (email && clientEmail && email === clientEmail) ||
      (phone && clientPhone && phone === clientPhone) ||
      (company && location && clientCompany === company && clientLocation === location)
    );
  });
};

const statusColor = (status: string) => {
  switch (status) {
    case "booked":
    case "paid":
    case "active":
      return "default";
    case "completed":
    case "paused":
      return "secondary";
    case "cancelled":
    case "archived":
      return "destructive";
    default:
      return "outline";
  }
};

const calendarStatusColor = (status?: string | null) => {
  switch (status) {
    case "synced":
      return "default";
    case "failed":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
};

const calendarStatusLabel = (status?: string | null) => {
  if (status === "synced") return "Synced";
  if (status === "failed") return "Failed";
  return "Pending";
};

const getUserName = (user: any) => {
  if (!user) return "Unknown";
  return user.display_name || user.name || user.email || "Unknown";
};

const getBookingDate = (booking: any) => booking.cleaning_available_slots?.date ?? "";

const CleaningManagement = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState(initialForm);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientMode, setClientMode] = useState<"existing" | "new">("new");
  const [createClientId, setCreateClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientEditOpen, setClientEditOpen] = useState(false);
  const [clientEditForm, setClientEditForm] = useState(initialClientEditForm);
  const [editSubOpen, setEditSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<any>(null);
  const [completionBookingId, setCompletionBookingId] = useState<string>("");
  const [completion, setCompletion] = useState({
    completed_by: "Admin",
    notes: "",
    photo_url: "",
    issue_report: "",
    checklist_completed: dailyChecklist,
  });

  const invalidateCleaning = () => {
    [
      "admin-cleaning-subscriptions",
      "admin-cleaning-bookings",
      "admin-cleaning-slots",
      "admin-cleaning-clients",
      "admin-cleaning-custom-plans",
      "admin-cleaning-schedules",
      "admin-cleaning-checklists",
      "admin-cleaning-reports",
      "cleaning-slots",
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ["admin-cleaning-subscriptions"],
    queryFn: async () => {
      const { data: subs, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!subs?.length) return [];

      // Look up users
      const userIds = [...new Set(subs.map((s: any) => s.user_id).filter(Boolean))];
      const { data: usersData } = await supabaseDb
        .from("users")
        .select("id, name, display_name, email")
        .in("id", userIds);
      const usersMap = new Map((usersData ?? []).map((u: any) => [String(u.id), u]));

      // Look up packages
      const pkgIds = [...new Set(subs.map((s: any) => s.package_id).filter(Boolean))];
      const { data: pkgsData } = await supabaseDb
        .from("cleaning_packages")
        .select("id, name, cleanings_per_month")
        .in("id", pkgIds);
      const pkgsMap = new Map((pkgsData ?? []).map((p: any) => [p.id, p]));

      return subs.map((s: any) => ({
        ...s,
        users: usersMap.get(String(s.user_id)) || null,
        cleaning_packages: pkgsMap.get(s.package_id) || null,
      }));
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-all-cleaning-packages"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_packages")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-cleaning-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(id, date, start_time, end_time), users(display_name, email, name), cleaning_clients(*), cleaning_custom_plans(*), cleaning_completion_reports(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: slots } = useQuery({
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

  const { data: clients } = useQuery({
    queryKey: ["admin-cleaning-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customPlans } = useQuery({
    queryKey: ["admin-cleaning-custom-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_custom_plans")
        .select("*, cleaning_clients(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ["admin-cleaning-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_recurring_schedules")
        .select("*, cleaning_clients(*), cleaning_custom_plans(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useQuery({
    queryKey: ["admin-cleaning-checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_checklist_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: completionReports } = useQuery({
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

  const createCustomPlan = useMutation({
    mutationFn: async () => {
      const validationError =
        clientMode === "existing" && !createClientId
          ? "Select an existing client before creating the plan"
          : !form.company_name.trim()
            ? "Client / company name is required"
            : !form.location.trim()
              ? "Location is required"
              : !form.email.trim() && !form.phone.trim()
                ? "Email or phone is required"
                : !form.plan_name.trim()
                  ? "Plan name is required"
                  : Number(form.custom_price) <= 0
                    ? "Custom price is required"
                    : !form.start_date
                      ? "Start date is required"
                      : null;

      if (validationError) throw new Error(validationError);

      const duplicate = clientMode === "new" ? findSimilarClient(clients ?? [], form) : null;
      if (duplicate) {
        throw new Error(`Similar client already exists: ${duplicate.company_name}. Select Existing client to reuse it.`);
      }

      const { data, error } = await supabase.rpc("create_custom_cleaning_plan", {
        ...form,
        existing_client_id: clientMode === "existing" ? createClientId : null,
        assigned_cleaner: null,
        deep_cleaning_add_on: false,
        custom_price_cents: toCents(form.custom_price),
        estimated_monthly_total_cents: toCents(form.estimated_monthly_total),
        daily_checklist: dailyChecklist,
        deep_cleaning_checklist: deepChecklist,
        custom_checklist: dailyChecklist,
      });
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: (result) => {
      toast.success(`Custom plan created. ${result?.bookings_created ?? 0} recurring slots booked.`);
      if (result?.conflicts?.length) {
        toast.warning(`${result.conflicts.length} dates were already occupied and skipped.`);
      }
      setCreateOpen(false);
      setForm(initialForm);
      setCreateClientId("");
      setClientMode("new");
      setClientSearch("");
      setSelectedClientId(result?.client?.id ?? "");
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create custom plan"),
  });

  const approveMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase
        .from("cleaning_subscriptions")
        .update({ payment_status: "paid", is_active: true })
        .eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment approved and subscription activated");
      invalidateCleaning();
    },
    onError: () => toast.error("Failed to approve payment"),
  });

  const updateSubMutation = useMutation({
    mutationFn: async (updates: { id: string; [key: string]: any }) => {
      const { id, ...fields } = updates;
      const { error } = await supabaseDb
        .from("cleaning_subscriptions")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      invalidateCleaning();
      setEditSubOpen(false);
      setEditingSub(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("cleaning_recurring_schedules")
        .update({ status, paused_at: status === "paused" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recurring schedule updated");
      invalidateCleaning();
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async () => {
      if (!clientEditForm.company_name.trim()) throw new Error("Client / company name is required");
      if (!clientEditForm.location.trim()) throw new Error("Location is required");
      if (!clientEditForm.email.trim() && !clientEditForm.phone.trim()) throw new Error("Email or phone is required");

      const { id, ...values } = clientEditForm;
      const { data, error } = await supabase
        .from("cleaning_clients")
        .update({
          ...values,
          company_name: values.company_name.trim(),
          contact_person: values.contact_person.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          location: values.location.trim(),
          service_type: values.service_type.trim(),
          notes: values.notes,
          internal_admin_notes: values.internal_admin_notes,
        })
        .eq("id", id);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Custom client updated");
      setClientEditOpen(false);
      setClientEditForm(initialClientEditForm);
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Could not update client"),
  });

  const archiveClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("cleaning_clients")
        .update({ status: "archived" })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client archived");
      invalidateCleaning();
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.from("cleaning_clients").delete().eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client deleted from admin-only records");
      setSelectedClientId("");
      invalidateCleaning();
    },
  });

  const unarchiveClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("cleaning_clients")
        .update({ status: "active" })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client unarchived");
      setClientEditOpen(false);
      setClientEditForm(initialClientEditForm);
      invalidateCleaning();
    },
    onError: () => toast.error("Could not unarchive client"),
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

  const syncCalendarMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      // Find the booking in local data so we can pass it directly (no DB needed)
      const booking = bookings?.find((b: any) => b.id === bookingId);
      const slot = booking?.cleaning_available_slots;

      if (booking && slot?.date && slot?.start_time && slot?.end_time) {
        // Use direct sync — passes all booking details to avoid DB dependency
        // Normalise to HH:mm (DB may store "08:00:00")
        const { data, error } = await supabase.admin.syncCleaningBookingDirect(bookingId, {
          date: slot.date,
          startTime: String(slot.start_time).slice(0, 5),
          endTime: String(slot.end_time).slice(0, 5),
          clientName:
            booking.cleaning_clients?.company_name ||
            booking.users?.display_name ||
            booking.users?.name ||
            undefined,
          planName: booking.cleaning_custom_plans?.plan_name || undefined,
          location: booking.location || booking.cleaning_clients?.location || undefined,
          status: booking.status || "booked",
          notes: booking.notes || undefined,
          googleCalendarEventId: booking.google_calendar_event_id || undefined,
        });
        if (error) throw error;

        // Persist the returned event ID back to the DB so future syncs update instead of create
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

      // Fallback to server-side load (when DB is available)
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
        toast.success("Booking synced to Google Calendar ✓");
      }
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Google Calendar sync failed"),
  });

  const syncAllCalendarMutation = useMutation({
    mutationFn: async () => {
      const activeBookings = (bookings ?? []).filter(
        (b: any) => b.status === "booked" || b.status === "completed" || b.status === "cancelled"
      );

      if (activeBookings.length === 0) {
        return { ok: true, total: 0, synced: 0, failed: 0, results: [] };
      }

      // Sync each booking directly (no DB required)
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
          clientName:
            booking.cleaning_clients?.company_name ||
            booking.users?.display_name ||
            booking.users?.name ||
            undefined,
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

        // Save event ID back to localStorage
        if (data?.ok && data?.googleCalendarEventId) {
          await supabase.admin.updateCleaningBooking(booking.id, {
            google_calendar_event_id: data.googleCalendarEventId,
            google_calendar_event_link: data.googleCalendarEventLink ?? null,
            google_calendar_sync_status: "synced",
          });
        }

        results.push({ ok: data?.ok ?? false, bookingId: booking.id, ...(data?.ok ? {} : { error: data?.error }) });
      }

      const failed = results.filter((r) => !r.ok).length;
      return { ok: failed === 0, total: results.length, synced: results.length - failed, failed, results };
    },
    onSuccess: (result) => {
      if (result?.ok === false && result?.total === 0) {
        toast.warning("No bookings to sync.");
      } else if (result?.ok === false) {
        const failed = result?.failed ?? 0;
        toast.error(`Sync finished with ${failed} error${failed !== 1 ? "s" : ""}.`);
      } else {
        const total = result?.total ?? 0;
        const synced = result?.synced ?? 0;
        const failed = result?.failed ?? 0;
        const message = failed
          ? `Calendar sync finished: ${synced}/${total} synced, ${failed} failed.`
          : `Calendar sync finished: ${synced}/${total} synced ✓`;
        toast.success(message);
      }
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Google Calendar bulk sync failed"),
  });

  const selectedClient = clients?.find((client: any) => client.id === selectedClientId) ?? clients?.[0] ?? null;
  const selectedClientPlans = customPlans?.filter((plan: any) => plan.client_id === selectedClient?.id) ?? [];
  const selectedClientSchedules = schedules?.filter((schedule: any) => schedule.client_id === selectedClient?.id) ?? [];
  const selectedClientBookings = bookings?.filter((booking: any) => booking.client_id === selectedClient?.id) ?? [];
  const activeSubsCount = subscriptions?.filter((sub: any) => sub.is_active).length ?? 0;
  const totalBookings = bookings?.length ?? 0;
  const upcomingBookings = bookings?.filter((booking: any) => booking.status === "booked").length ?? 0;
  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const bookedDates = useMemo(
    () =>
      bookings
        ?.filter((booking: any) => booking.status === "booked" && booking.cleaning_available_slots?.date)
        .map((booking: any) => new Date(`${booking.cleaning_available_slots.date}T00:00:00`)) ?? [],
    [bookings]
  );
  const slotDates = useMemo(
    () => slots?.map((slot: any) => new Date(`${slot.date}T00:00:00`)) ?? [],
    [slots]
  );
  const bookingsForSelectedDate = useMemo(
    () => bookings?.filter((booking: any) => booking.cleaning_available_slots?.date === selectedDateKey) ?? [],
    [bookings, selectedDateKey]
  );
  const slotsForSelectedDate = useMemo(
    () => slots?.filter((slot: any) => slot.date === selectedDateKey) ?? [],
    [slots, selectedDateKey]
  );

  const previewDates = useMemo(() => {
    const days = new Set(form.days_of_week);
    const start = new Date(`${form.start_date}T00:00:00`);
    return Array.from({ length: 21 }, (_, index) => addDays(start, index))
      .filter((date) => {
        const option = weekdayOptions[date.getDay() === 0 ? 6 : date.getDay() - 1];
        return days.has(option?.value);
      })
      .slice(0, 12);
  }, [form.days_of_week, form.start_date]);

  const filteredClients = useMemo(() => {
    const search = normalizeSearch(clientSearch);
    const list = clients ?? [];
    if (!search) return list.slice(0, 8);
    return list
      .filter((client: any) =>
        [
          client.company_name,
          client.contact_person,
          client.email,
          client.phone,
          client.location,
          client.service_type,
        ]
          .map(normalizeSearch)
          .some((value) => value.includes(search))
      )
      .slice(0, 8);
  }, [clients, clientSearch]);

  const similarClient = clientMode === "new" ? findSimilarClient(clients ?? [], form) : null;

  const setFormValue = (key: keyof typeof initialForm, value: any) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openCreatePlanModal = () => {
    setForm(initialForm);
    setCreateClientId("");
    setClientMode("new");
    setClientSearch("");
    setCreateStep(1);
    setCreateOpen(true);
  };

  const openClientEditModal = (client: any) => {
    setSelectedClientId(client.id);
    setClientEditForm({
      ...initialClientEditForm,
      id: client.id,
      company_name: client.company_name || "",
      contact_person: client.contact_person || "",
      email: client.email || "",
      phone: client.phone || "",
      location: client.location || "",
      service_type: client.service_type || "",
      notes: client.notes || "",
      internal_admin_notes: client.internal_admin_notes || "",
      status: client.status || "active",
    });
    setClientEditOpen(true);
  };

  const selectExistingClientForPlan = (client: any) => {
    setCreateClientId(client.id);
    setClientSearch(client.company_name || "");
    setForm((current) => ({
      ...current,
      company_name: client.company_name || "",
      contact_person: client.contact_person || "",
      email: client.email || "",
      phone: client.phone || "",
      location: client.location || "",
      service_type: client.service_type || "",
      notes: client.notes || "",
      internal_admin_notes: client.internal_admin_notes || "",
      plan_name: current.plan_name || `${client.company_name || "Client"} Cleaning Plan`,
    }));
  };

  const toggleWeekday = (value: string) => {
    setForm((current) => ({
      ...current,
      days_of_week: current.days_of_week.includes(value)
        ? current.days_of_week.filter((day) => day !== value)
        : [...current.days_of_week, value],
    }));
  };

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
    <SuperAdminLayout title="Cleaning Operations" subtitle="Bookings, available slots, active subscriptions, and recurring schedules">
      <div className="grid grid-cols-2 gap-space-3 md:grid-cols-5 md:gap-space-4">
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Active Subs
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{activeSubsCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <SparklesIcon className="h-4 w-4" />
              Custom Clients
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{clients?.length ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{upcomingBookings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              Total Bookings
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalBookings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Slots
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{slots?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="custom-clients" variant="pills" className="mt-space-8 w-full">
        <TabsList wrap className="h-auto">
          <TabsTrigger value="custom-clients">Custom Clients</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="bookings">All Bookings</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="reports">Completion Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="custom-clients">
          <div>
            <Card>
              <CardHeader className="flex flex-col gap-space-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Custom Clients</CardTitle>
                  <p className="mt-space-2 text-body text-muted-foreground">
                    Private admin-only cleaning clients. These records never feed the public pricing flow.
                  </p>
                </div>
                <Button onClick={openCreatePlanModal}>
                  <Plus className="h-4 w-4" />
                  Create Custom Plan
                </Button>
              </CardHeader>
              <CardContent>
                {!clients?.length ? (
                  <EmptyState
                    title="No custom clients yet"
                    description="Create a private cleaning client plan for cowork spaces, offices, or custom agreements."
                    compact
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Visibility</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients.map((client: any) => (
                          <TableRow
                            key={client.id}
                            className={selectedClient?.id === client.id ? "bg-primary/10" : undefined}
                          >
                            <TableCell className="font-bold">
                              <button
                                type="button"
                                className="text-left"
                                onClick={() => setSelectedClientId(client.id)}
                                aria-label={`Open ${client.company_name} custom client details`}
                              >
                                {client.company_name}
                                <span className="block text-sm font-medium text-muted-foreground">
                                  {client.service_type || "Custom cleaning"}
                                </span>
                              </button>
                            </TableCell>
                            <TableCell>{client.location}</TableCell>
                            <TableCell><Badge variant={statusColor(client.status) as any}>{client.status}</Badge></TableCell>
                            <TableCell>
                              <Badge variant="secondary">{client.visibility || "admin_only"}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-space-2">
                                <Button variant="tertiary" size="iconSm" onClick={() => openClientEditModal(client)} aria-label="Edit client">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {client.status === "archived" ? (
                                  <Button variant="tertiary" size="iconSm" onClick={() => unarchiveClientMutation.mutate(client.id)} aria-label="Unarchive client">
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button variant="tertiary" size="iconSm" onClick={() => archiveClientMutation.mutate(client.id)} aria-label="Archive client">
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button variant="tertiary" size="iconSm" onClick={() => deleteClientMutation.mutate(client.id)} aria-label="Delete client">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid gap-space-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-space-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Slot Blocking Preview
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
                <div className="mt-space-5 grid gap-space-3 text-control text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-space-2"><span className="h-3 w-3 rounded-radius-full bg-primary" />Booked cleaning</div>
                  <div className="flex items-center gap-space-2"><span className="h-3 w-3 rounded-radius-full border border-primary" />Available slot</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-space-6">
                <section>
                  <div className="mb-space-3 flex items-center gap-space-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h3 className="text-card-title">Bookings</h3>
                    <Badge variant="secondary">{bookingsForSelectedDate.length}</Badge>
                  </div>
                  {bookingsForSelectedDate.length === 0 ? (
                    <EmptyState title="No bookings for this day" description="Booked cleanings will appear here." />
                  ) : (
                    <div className="space-y-space-3">
                      {bookingsForSelectedDate.map((booking: any) => (
                        <div key={booking.id} className="rounded-radius-lg bg-secondary p-space-4">
                          <div className="flex flex-wrap items-start justify-between gap-space-3">
                            <div>
                              <p className="text-card-title">
                                {booking.cleaning_clients?.company_name || getUserName(booking.users)}
                              </p>
                              <p className="type-body text-muted-foreground">
                                {booking.cleaning_available_slots?.start_time?.slice(0, 5)} - {booking.cleaning_available_slots?.end_time?.slice(0, 5)}
                              </p>
                            </div>
                            <Badge variant={statusColor(booking.status) as any}>{booking.status}</Badge>
                          </div>
                          {booking.custom_plan_id && (
                            <p className="mt-space-3 text-body text-primary">Private custom cleaning client</p>
                          )}
                        </div>
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
                  <div className="grid gap-space-3 sm:grid-cols-2">
                    {slotsForSelectedDate.map((slot: any) => {
                      const remaining = Math.max(0, slot.max_bookings - slot.current_bookings);
                      return (
                        <div key={slot.id} className="rounded-radius-lg bg-card p-space-4">
                          <p className="text-card-title">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</p>
                          <p className="mt-space-1 type-body text-muted-foreground">{slot.current_bookings} booked of {slot.max_bookings}</p>
                          <Badge className="mt-space-3" variant={remaining > 0 ? "default" : "destructive"}>
                            {remaining > 0 ? "1 spot left" : "Blocked"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bookings">
          <Card>
            <CardHeader className="flex flex-col gap-space-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>All Cleaning Bookings</CardTitle>
                <p className="mt-space-2 text-body text-muted-foreground">
                  Push all backend-saved cleaning bookings into the shared admin Google Calendar.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={syncAllCalendarMutation.isPending}
                disabled={totalBookings === 0 || syncAllCalendarMutation.isPending}
                onClick={() => syncAllCalendarMutation.mutate()}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Sync all booked to calendar
              </Button>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <p className="py-space-8 text-center text-muted-foreground">Loading...</p>
              ) : !bookings?.length ? (
                <p className="py-space-8 text-center text-muted-foreground">No bookings yet</p>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-space-3 md:hidden">
                    {bookings.map((booking: any) => (
                      <div key={booking.id} className="rounded-radius-lg border border-border bg-card p-space-4 space-y-space-3">
                        <div className="flex items-start justify-between gap-space-3">
                          <div className="min-w-0">
                            <p className="font-bold truncate">
                              {booking.cleaning_clients?.company_name || getUserName(booking.users)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {getBookingDate(booking) ? format(new Date(`${getBookingDate(booking)}T00:00:00`), "MMM d, yyyy") : "—"}
                              {" · "}
                              {booking.cleaning_available_slots?.start_time?.slice(0, 5)} - {booking.cleaning_available_slots?.end_time?.slice(0, 5)}
                            </p>
                          </div>
                          <Badge variant={statusColor(booking.status) as any}>{booking.status}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-space-2">
                          <Badge variant={booking.custom_plan_id ? "secondary" : "outline"}>
                            {booking.custom_plan_id ? "Private" : "Public"}
                          </Badge>
                          <Badge variant={calendarStatusColor(booking.google_calendar_sync_status) as any}>
                            {calendarStatusLabel(booking.google_calendar_sync_status)}
                          </Badge>
                        </div>
                        <div className="flex gap-space-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            loading={syncCalendarMutation.isPending && syncCalendarMutation.variables === booking.id}
                            onClick={() => syncCalendarMutation.mutate(booking.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            Sync
                          </Button>
                          {booking.google_calendar_event_link ? (
                            <Button type="button" size="sm" variant="tertiary" asChild aria-label="Open Calendar Event">
                              <a href={booking.google_calendar_event_link} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                Open
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Google Calendar</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookings.map((booking: any) => (
                          <TableRow key={booking.id}>
                            <TableCell className="font-medium">
                              {booking.cleaning_clients?.company_name || getUserName(booking.users)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={booking.custom_plan_id ? "secondary" : "outline"}>
                                {booking.custom_plan_id ? "Private custom" : "Public subscription"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {getBookingDate(booking) ? format(new Date(`${getBookingDate(booking)}T00:00:00`), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell>
                              {booking.cleaning_available_slots?.start_time?.slice(0, 5)} - {booking.cleaning_available_slots?.end_time?.slice(0, 5)}
                            </TableCell>
                            <TableCell><Badge variant={statusColor(booking.status) as any}>{booking.status}</Badge></TableCell>
                            <TableCell>
                              <div className="flex min-w-[220px] flex-col gap-space-2">
                                <div className="flex items-center gap-space-2">
                                  <Badge variant={calendarStatusColor(booking.google_calendar_sync_status) as any}>
                                    {calendarStatusLabel(booking.google_calendar_sync_status)}
                                  </Badge>
                                  {booking.google_calendar_synced_at ? (
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(booking.google_calendar_synced_at), "MMM d, h:mm a")}
                                    </span>
                                  ) : null}
                                </div>
                                {booking.google_calendar_event_id ? (
                                  <p className="max-w-[210px] truncate text-xs text-muted-foreground">
                                    {booking.google_calendar_event_id}
                                  </p>
                                ) : null}
                                {booking.google_calendar_sync_error ? (
                                  <p className="max-w-[210px] truncate text-xs text-destructive">
                                    {booking.google_calendar_sync_error}
                                  </p>
                                ) : null}
                                <div className="flex items-center gap-space-2">
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
                                  {booking.google_calendar_event_link ? (
                                    <Button type="button" size="iconSm" variant="tertiary" asChild aria-label="Open Calendar Event">
                                      <a href={booking.google_calendar_event_link} target="_blank" rel="noreferrer">
                                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                      </a>
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{booking.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <CardTitle>Public Cleaning Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <p className="py-space-8 text-center text-muted-foreground">Loading...</p>
              ) : !subscriptions?.length ? (
                <p className="py-space-8 text-center text-muted-foreground">No subscriptions yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Monthly</TableHead>
                        <TableHead>Total paid</TableHead>
                        <TableHead>Paid until</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptions.map((sub: any) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{getUserName(sub.users)}</TableCell>
                          <TableCell>{sub.cleaning_packages?.name || "—"}</TableCell>
                          <TableCell>{getSubscriptionMonths(sub)} month{getSubscriptionMonths(sub) > 1 ? "s" : ""}</TableCell>
                          <TableCell>{formatUSD(getSubscriptionMonthlyPrice(sub))}</TableCell>
                          <TableCell>{formatUSD(getSubscriptionTotalPrice(sub))}</TableCell>
                          <TableCell>{formatDateLabel(sub.paid_until || sub.end_date)}</TableCell>
                          <TableCell>{sub.cleanings_remaining}</TableCell>
                          <TableCell><Badge variant={statusColor(sub.payment_status) as any}>{sub.payment_status}</Badge></TableCell>
                          <TableCell><Badge variant={statusColor(getSubscriptionStatus(sub)) as any}>{getSubscriptionStatus(sub)}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {sub.payment_status === "pending" && (
                                <Button size="sm" onClick={() => approveMutation.mutate(sub.id)} loading={approveMutation.isPending}>
                                  Approve
                                </Button>
                              )}
                              <Button size="sm" variant="tertiary" onClick={() => { setEditingSub(sub); setEditSubOpen(true); }}>
                                Edit
                              </Button>
                              {sub.is_active ? (
                                <Button size="sm" variant="tertiary" onClick={() => updateSubMutation.mutate({ id: sub.id, is_active: false, subscription_status: "paused" })}>
                                  Pause
                                </Button>
                              ) : sub.payment_status === "paid" ? (
                                <Button size="sm" variant="tertiary" onClick={() => updateSubMutation.mutate({ id: sub.id, is_active: true, subscription_status: "active" })}>
                                  Activate
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Completion Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {!completionReports?.length ? (
                <EmptyState title="No completion reports yet" description="Completed sessions will appear here with checklist, notes, and photo links." />
              ) : (
                <div className="grid gap-space-4 lg:grid-cols-2">
                  {completionReports.map((report: any) => (
                    <article key={report.id} className="rounded-radius-lg bg-secondary p-space-5">
                      <div className="flex items-start justify-between gap-space-3">
                        <div>
                          <h3 className="text-card-title">{report.completed_by}</h3>
                          <p className="mt-space-1 text-body text-muted-foreground">
                            {format(new Date(report.completed_at), "MMM d, yyyy HH:mm")}
                          </p>
                        </div>
                        <Badge variant="default">Completed</Badge>
                      </div>
                      <p className="mt-space-4 text-body">{report.notes || "No notes"}</p>
                      {report.issue_report && (
                        <p className="mt-space-3 rounded-radius-md bg-background p-space-3 text-body text-muted-foreground">
                          {report.issue_report}
                        </p>
                      )}
                      {report.photo_url && (
                        <a className="mt-space-3 inline-flex text-control text-primary" href={report.photo_url} target="_blank" rel="noreferrer">
                          View photo
                        </a>
                      )}
                      <p className="mt-space-3 text-caption text-muted-foreground">
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

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateStep(1); }}>
        <DialogContent className="flex max-h-[92vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-2xl">
          {/* ── Sticky header ── */}
          <div className="shrink-0 border-b border-[hsl(var(--app-divider))] px-space-6 pb-space-4 pt-space-6">
            <DialogHeader className="mb-space-5">
              <DialogTitle className="text-xl font-extrabold">New Cleaning Plan</DialogTitle>
              <DialogDescription className="text-caption">
                {createStep === 1 && "Step 1 of 4 — Who is the client?"}
                {createStep === 2 && "Step 2 of 4 — What service and pricing?"}
                {createStep === 3 && "Step 3 of 4 — When does it happen?"}
                {createStep === 4 && "Step 4 of 4 — Review and confirm"}
              </DialogDescription>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center gap-space-2">
              {([1, 2, 3, 4] as const).map((n, i) => (
                <div key={n} className="flex flex-1 items-center gap-space-2">
                  <button
                    type="button"
                    onClick={() => n < createStep && setCreateStep(n)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition-colors ${
                      createStep === n
                        ? "bg-primary text-black"
                        : createStep > n
                          ? "cursor-pointer bg-primary/25 text-primary hover:bg-primary/40"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {createStep > n ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                  </button>
                  <span className={`hidden text-xs font-bold sm:block ${createStep === n ? "text-foreground" : "text-muted-foreground"}`}>
                    {["Client", "Plan", "Schedule", "Review"][n - 1]}
                  </span>
                  {i < 3 && <div className="h-px flex-1 bg-border" />}
                </div>
              ))}
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-space-6 py-space-5">

            {/* ─── STEP 1: CLIENT ─── */}
            {createStep === 1 && (
              <div className="space-y-space-5">
                {/* Source toggle */}
                <div className="grid grid-cols-2 gap-space-3 rounded-radius-lg bg-muted p-space-1">
                  <Button
                    type="button"
                    variant={clientMode === "new" ? "primary" : "ghost"}
                    className="h-10 w-full"
                    onClick={() => { setClientMode("new"); setCreateClientId(""); setClientSearch(""); }}
                  >
                    New client
                  </Button>
                  <Button
                    type="button"
                    variant={clientMode === "existing" ? "primary" : "ghost"}
                    className="h-10 w-full"
                    onClick={() => setClientMode("existing")}
                  >
                    Existing client
                  </Button>
                </div>

                {clientMode === "existing" ? (
                  <div className="space-y-space-3">
                    <Input
                      label="Search clients"
                      placeholder="Company, contact, email, phone, or location…"
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      leftIcon={<Search className="h-4 w-4" />}
                    />
                    <div className="max-h-56 overflow-auto rounded-radius-lg border border-border bg-background p-space-1">
                      {filteredClients.length === 0 ? (
                        <p className="p-space-4 text-center text-caption text-muted-foreground">No matching clients</p>
                      ) : (
                        <div className="space-y-space-1">
                          {filteredClients.map((client: any) => {
                            const active = createClientId === client.id;
                            return (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => selectExistingClientForPlan(client)}
                                className={`w-full rounded-radius-md px-space-3 py-space-2.5 text-left transition-colors ${
                                  active ? "bg-primary text-black" : "hover:bg-muted"
                                }`}
                              >
                                <span className="block text-sm font-bold">{client.company_name}</span>
                                <span className={`mt-0.5 block text-caption ${active ? "text-black/70" : "text-muted-foreground"}`}>
                                  {[client.location, client.email, client.phone].filter(Boolean).join(" · ") || "No details"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {createClientId && (
                      <div className="flex items-center gap-space-2 rounded-radius-md bg-primary/10 px-space-3 py-space-2 text-sm text-primary">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span className="font-semibold">
                          {filteredClients.find((c: any) => c.id === createClientId)?.company_name ?? "Client selected"}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-space-4">
                    {similarClient && (
                      <div className="flex items-start gap-space-3 rounded-radius-lg bg-warning/10 p-space-4">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <div className="text-sm">
                          <p className="font-bold text-foreground">Similar client exists</p>
                          <p className="mt-0.5 text-muted-foreground">
                            <span className="font-semibold">{similarClient.company_name}</span> matches by email, phone, or company+location. Switch to "Existing client" to reuse it.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="grid gap-space-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Input label="Company / client name" value={form.company_name} onChange={(event) => setFormValue("company_name", event.target.value)} required />
                      </div>
                      <Input label="Contact person" value={form.contact_person} onChange={(event) => setFormValue("contact_person", event.target.value)} />
                      <Input label="Service type" value={form.service_type} onChange={(event) => setFormValue("service_type", event.target.value)} placeholder="e.g. Office, Cowork" />
                      <Input label="Email" type="email" value={form.email} onChange={(event) => setFormValue("email", event.target.value)} />
                      <Input label="Phone / WhatsApp" value={form.phone} onChange={(event) => setFormValue("phone", event.target.value)} />
                      <div className="sm:col-span-2">
                        <Input label="Location / address" value={form.location} onChange={(event) => setFormValue("location", event.target.value)} required />
                      </div>
                    </div>
                    <Textarea label="Client notes" value={form.notes} onChange={(event) => setFormValue("notes", event.target.value)} placeholder="Access instructions, preferences, etc." rows={2} />
                  </div>
                )}
              </div>
            )}

            {/* ─── STEP 2: PLAN & BILLING ─── */}
            {createStep === 2 && (
              <div className="space-y-space-5">
                <Input label="Plan name" value={form.plan_name} onChange={(event) => setFormValue("plan_name", event.target.value)} required placeholder="e.g. Daily Cowork Cleaning" />

                <div className="grid grid-cols-2 gap-space-4">
                  <Input label="Price per session" type="number" value={form.custom_price} onChange={(event) => setFormValue("custom_price", event.target.value)} leftIcon={<span className="text-muted-foreground">$</span>} />
                  <Input label="Est. monthly total" type="number" value={form.estimated_monthly_total} onChange={(event) => setFormValue("estimated_monthly_total", event.target.value)} leftIcon={<span className="text-muted-foreground">$</span>} />
                </div>

                <div className="grid grid-cols-2 gap-space-4">
                  <div>
                    <Label className="mb-space-2 block text-label">Billing cycle</Label>
                    <Select value={form.billing_type} onValueChange={(value) => setFormValue("billing_type", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-space-2 block text-label">Payment timing</Label>
                    <Select value={form.payment_timing} onValueChange={(value) => setFormValue("payment_timing", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prepaid">Prepaid</SelectItem>
                        <SelectItem value="after_service_completed">After service</SelectItem>
                        <SelectItem value="custom_terms">Custom terms</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-radius-lg border border-border px-space-4 py-space-3 transition-colors hover:bg-muted">
                  <div>
                    <span className="block text-sm font-bold">Monthly invoice</span>
                    <span className="text-caption text-muted-foreground">Send a single invoice at month end</span>
                  </div>
                  <Switch checked={form.monthly_invoice} onCheckedChange={(checked) => setFormValue("monthly_invoice", checked)} />
                </label>

                <Textarea label="Payment terms / notes" value={form.custom_terms} onChange={(event) => setFormValue("custom_terms", event.target.value)} rows={2} />
              </div>
            )}

            {/* ─── STEP 3: SCHEDULE ─── */}
            {createStep === 3 && (
              <div className="space-y-space-5">
                <div className="grid grid-cols-2 gap-space-4">
                  <Input label="Service start date" type="date" value={form.start_date} onChange={(event) => setFormValue("start_date", event.target.value)} required />
                  <Input label="End date" type="date" value={form.end_date} onChange={(event) => setFormValue("end_date", event.target.value)} helperText="Optional" />
                </div>

                <div>
                  <Label className="mb-space-3 block text-label">Days of week</Label>
                  <div className="grid grid-cols-4 gap-space-2 sm:grid-cols-7">
                    {weekdayOptions.map((day) => {
                      const checked = form.days_of_week.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleWeekday(day.value)}
                          className={`rounded-radius-md py-space-2 text-center text-xs font-bold transition-colors ${
                            checked
                              ? "bg-primary text-black"
                              : "bg-muted text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground"
                          }`}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-space-4">
                  <Input label="Start time" type="time" value={form.preferred_start_time} onChange={(event) => setFormValue("preferred_start_time", event.target.value)} />
                  <Input label="End time" type="time" value={form.preferred_end_time} onChange={(event) => setFormValue("preferred_end_time", event.target.value)} />
                </div>

                <Input label="Session duration (minutes)" type="number" value={form.service_duration_minutes} onChange={(event) => setFormValue("service_duration_minutes", event.target.value)} />

                {previewDates.length > 0 && (
                  <div className="rounded-radius-lg border border-border bg-muted/50 p-space-4">
                    <div className="mb-space-3 flex items-center justify-between">
                      <span className="text-sm font-bold">Sessions preview</span>
                      <Badge variant="secondary">{previewDates.length} sessions</Badge>
                    </div>
                    <div className="flex flex-wrap gap-space-2">
                      {previewDates.slice(0, 16).map((date) => (
                        <Badge key={date.toISOString()} variant="outline" className="text-caption">
                          {format(date, "MMM d")}
                        </Badge>
                      ))}
                      {previewDates.length > 16 && (
                        <Badge variant="outline" className="text-caption text-muted-foreground">
                          +{previewDates.length - 16} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <Textarea label="Internal admin notes" value={form.internal_admin_notes} onChange={(event) => setFormValue("internal_admin_notes", event.target.value)} placeholder="Scheduling context, access codes, special instructions…" rows={2} />
              </div>
            )}

            {/* ─── STEP 4: REVIEW ─── */}
            {createStep === 4 && (
              <div className="space-y-space-4">
                {/* Client card */}
                <div className="rounded-radius-lg border border-border p-space-4">
                  <p className="mb-space-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Client</p>
                  {clientMode === "existing" ? (
                    <div>
                      <p className="font-bold">{filteredClients.find((c: any) => c.id === createClientId)?.company_name ?? "—"}</p>
                      <p className="text-caption text-muted-foreground">Existing client · {filteredClients.find((c: any) => c.id === createClientId)?.location ?? "—"}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold">{form.company_name || "—"}</p>
                      <p className="text-caption text-muted-foreground">New client · {form.location || "—"}</p>
                      {form.email && <p className="text-caption text-muted-foreground">{form.email}{form.phone ? ` · ${form.phone}` : ""}</p>}
                    </div>
                  )}
                </div>

                {/* Plan card */}
                <div className="rounded-radius-lg border border-border p-space-4">
                  <p className="mb-space-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Plan & Billing</p>
                  <p className="font-bold">{form.plan_name || "—"}</p>
                  <p className="mt-space-1 text-caption text-muted-foreground">
                    ${form.custom_price}/session · {form.billing_type} · {form.payment_timing.replace(/_/g, " ")}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Est. ${form.estimated_monthly_total}/month{form.monthly_invoice ? " · Monthly invoice" : ""}
                  </p>
                </div>

                {/* Schedule card */}
                <div className="rounded-radius-lg border border-border p-space-4">
                  <p className="mb-space-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Schedule</p>
                  <p className="font-bold">
                    {form.days_of_week.map((d) => weekdayOptions.find((w) => w.value === d)?.short).join(", ")}
                  </p>
                  <p className="mt-space-1 text-caption text-muted-foreground">
                    {form.preferred_start_time} – {form.preferred_end_time} · {form.service_duration_minutes} min
                  </p>
                  <p className="text-caption text-muted-foreground">
                    From {form.start_date || "—"}{form.end_date ? ` to ${form.end_date}` : " (ongoing)"}
                  </p>
                  {previewDates.length > 0 && (
                    <div className="mt-space-3 flex items-center gap-space-2">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      <span className="text-caption font-semibold text-primary">{previewDates.length} sessions will be created</span>
                    </div>
                  )}
                </div>

                {similarClient && (
                  <div className="flex items-start gap-space-3 rounded-radius-lg bg-warning/10 p-space-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-sm text-muted-foreground">
                      A similar client (<span className="font-semibold">{similarClient.company_name}</span>) already exists. A new record will be created. Go back to Step 1 to use the existing client instead.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sticky footer ── */}
          <div className="shrink-0 border-t border-[hsl(var(--app-divider))] px-space-6 py-space-4">
            <div className="flex items-center justify-between gap-space-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => createStep === 1 ? setCreateOpen(false) : setCreateStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              >
                {createStep === 1 ? "Cancel" : "← Back"}
              </Button>

              {createStep < 4 ? (
                <Button
                  type="button"
                  onClick={() => setCreateStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                  disabled={
                    (createStep === 1 && clientMode === "existing" && !createClientId) ||
                    (createStep === 1 && clientMode === "new" && (!form.company_name || !form.location)) ||
                    (createStep === 2 && !form.plan_name) ||
                    (createStep === 3 && (!form.start_date || form.days_of_week.length === 0 || !form.preferred_start_time))
                  }
                >
                  Continue →
                </Button>
              ) : (
                <Button onClick={() => createCustomPlan.mutate()} loading={createCustomPlan.isPending}>
                  <Plus className="h-4 w-4" />
                  Create plan
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clientEditOpen}
        onOpenChange={(open) => {
          setClientEditOpen(open);
          if (!open) setClientEditForm(initialClientEditForm);
        }}
      >
        <DialogContent className="max-h-[92vh] w-full overflow-y-auto sm:max-w-lg md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Custom Client</DialogTitle>
            <DialogDescription>
              Update private cleaning client details, change status, or reactivate an archived client.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-space-4">
            <Input
              label="Client / company name"
              value={clientEditForm.company_name}
              onChange={(event) => setClientEditForm((current) => ({ ...current, company_name: event.target.value }))}
              required
            />
            <Input
              label="Contact person"
              value={clientEditForm.contact_person}
              onChange={(event) => setClientEditForm((current) => ({ ...current, contact_person: event.target.value }))}
            />
            <div className="grid gap-space-4 sm:grid-cols-2">
              <Input
                label="Email"
                type="email"
                value={clientEditForm.email}
                onChange={(event) => setClientEditForm((current) => ({ ...current, email: event.target.value }))}
              />
              <Input
                label="Phone / WhatsApp"
                value={clientEditForm.phone}
                onChange={(event) => setClientEditForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </div>
            <Input
              label="Location"
              value={clientEditForm.location}
              onChange={(event) => setClientEditForm((current) => ({ ...current, location: event.target.value }))}
              required
            />
            <Input
              label="Service type"
              value={clientEditForm.service_type}
              onChange={(event) => setClientEditForm((current) => ({ ...current, service_type: event.target.value }))}
            />
            <div>
              <Label>Status</Label>
              <Select
                value={clientEditForm.status}
                onValueChange={(value) => setClientEditForm((current) => ({ ...current, status: value }))}
              >
                <SelectTrigger className="mt-space-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-space-2 text-caption text-muted-foreground">
                Set the status to Active to unarchive this custom client.
              </p>
            </div>
            <Textarea
              label="Client notes"
              value={clientEditForm.notes}
              onChange={(event) => setClientEditForm((current) => ({ ...current, notes: event.target.value }))}
            />
            <Textarea
              label="Internal admin notes"
              value={clientEditForm.internal_admin_notes}
              onChange={(event) => setClientEditForm((current) => ({ ...current, internal_admin_notes: event.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setClientEditOpen(false);
                setClientEditForm(initialClientEditForm);
              }}
            >
              Cancel
            </Button>
            {clientEditForm.status === "archived" ? (
              <Button
                variant="secondary"
                onClick={() => unarchiveClientMutation.mutate(clientEditForm.id)}
                loading={unarchiveClientMutation.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Unarchive
              </Button>
            ) : null}
            <Button onClick={() => updateClientMutation.mutate()} loading={updateClientMutation.isPending}>
              Save client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completionBookingId)} onOpenChange={(open) => !open && setCompletionBookingId("")}>
        <DialogContent className="w-full sm:max-w-lg md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complete Cleaning Session</DialogTitle>
            <DialogDescription>Add checklist status, notes, photo URL, and any issue report.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-space-4">
            <Input label="Completed by" value={completion.completed_by} onChange={(event) => setCompletion((current) => ({ ...current, completed_by: event.target.value }))} />
            <div>
              <Label>Checklist completed</Label>
              <div className="mt-space-3 grid gap-space-2">
                {dailyChecklist.map((item) => (
                  <label key={item} className="flex items-start gap-space-2 rounded-radius-md bg-secondary p-space-3">
                    <Checkbox checked={completion.checklist_completed.includes(item)} onCheckedChange={() => toggleChecklistItem(item)} />
                    <span className="text-control">{item}</span>
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
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCompletionBookingId("")}>Cancel</Button>
            <Button onClick={() => completeBookingMutation.mutate()} loading={completeBookingMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Mark completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Edit Subscription Sheet ── */}
      <Sheet open={editSubOpen} onOpenChange={(o) => { if (!o) { setEditSubOpen(false); setEditingSub(null); } }}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Subscription</SheetTitle>
            <SheetDescription>{editingSub ? getUserName(editingSub.users) : ""}</SheetDescription>
          </SheetHeader>
          {editingSub && (
            <EditSubscriptionForm
              sub={editingSub}
              packages={plans}
              onSave={(updates) => updateSubMutation.mutate({ id: editingSub.id, ...updates })}
              saving={updateSubMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </SuperAdminLayout>
  );
};

function EditSubscriptionForm({ sub, packages, onSave, saving }: {
  sub: any;
  packages: any[];
  onSave: (updates: any) => void;
  saving: boolean;
}) {
  const [packageId, setPackageId] = useState(sub.package_id || "");
  const [status, setStatus] = useState(sub.subscription_status || "active");
  const [paymentStatus, setPaymentStatus] = useState(sub.payment_status || "pending");
  const [paidUntil, setPaidUntil] = useState(sub.paid_until || "");
  const [cleaningsRemaining, setCleaningsRemaining] = useState(String(sub.cleanings_remaining ?? 0));
  const [apartmentNote, setApartmentNote] = useState(sub.apartment_note || "");
  const [isActive, setIsActive] = useState(sub.is_active ?? false);

  const selectedPkg = packages.find((p: any) => p.id === packageId);
  const monthlyCents = selectedPkg
    ? selectedPkg.price_per_cleaning_cents * selectedPkg.cleanings_per_month
    : sub.monthly_price_cents;

  return (
    <div className="mt-6 space-y-5">
      <div>
        <Label>Plan</Label>
        <Select value={packageId} onValueChange={setPackageId}>
          <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
          <SelectContent>
            {packages.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — ${(p.price_per_cleaning_cents * p.cleanings_per_month / 100).toFixed(2)}/mo
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Subscription Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending_payment">Pending Payment</SelectItem>
              <SelectItem value="pending_schedule">Pending Schedule</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Payment Status</Label>
          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Paid Until</Label>
          <Input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
        </div>
        <div>
          <Label>Cleanings Remaining</Label>
          <Input type="number" value={cleaningsRemaining} onChange={(e) => setCleaningsRemaining(e.target.value)} min={0} />
        </div>
      </div>

      <div>
        <Label>Apartment Note</Label>
        <Input value={apartmentNote} onChange={(e) => setApartmentNote(e.target.value)} placeholder="Apt number, access notes" />
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <Label>Active</Label>
      </div>

      <Button
        className="w-full"
        size="xl"
        onClick={() => onSave({
          package_id: packageId,
          subscription_status: status,
          payment_status: paymentStatus,
          paid_until: paidUntil || null,
          cleanings_remaining: Number(cleaningsRemaining) || 0,
          apartment_note: apartmentNote || null,
          is_active: isActive,
          monthly_price_cents: monthlyCents,
        })}
        loading={saving}
      >
        Save Changes
      </Button>
    </div>
  );
}

export default CleaningManagement;
