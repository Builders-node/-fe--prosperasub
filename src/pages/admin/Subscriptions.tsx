import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { adminApi, supabaseDb, ensureCleaningSlot } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatPricingLabel, monthlyCleaningEstimate, resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";

type SubFilter = "all" | "active" | "pending" | "paused" | "cancelled" | "expired";
type SortKey = "user" | "price" | "period" | "status";
type SortDir = "asc" | "desc";

// Normalized lifecycle status used for display + action logic.
const effectiveStatus = (sub: any): string =>
  sub.subscription_status || (sub.is_active ? "active" : "inactive");

// A subscription still awaiting payment (and not already ended/cancelled).
const isPendingPayment = (sub: any): boolean =>
  sub.payment_status !== "paid" && !["cancelled", "expired"].includes(effectiveStatus(sub));

// Single source of truth for the displayed status badge.
const displayStatus = (sub: any): { label: string; className: string } => {
  if (isPendingPayment(sub)) return { label: "Pending", className: "bg-amber-500/15 text-amber-500" };
  const s = effectiveStatus(sub);
  switch (s) {
    case "active":    return { label: "Active",    className: "bg-emerald-500/15 text-emerald-400" };
    case "paused":    return { label: "Paused",    className: "bg-yellow-500/15 text-yellow-400" };
    case "cancelled": return { label: "Cancelled", className: "bg-muted text-muted-foreground" };
    case "expired":   return { label: "Expired",   className: "bg-red-500/15 text-red-400" };
    default:          return { label: s || "—",    className: "bg-muted text-muted-foreground" };
  }
};

const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;
const formatDate = (v?: string | null) =>
  v ? format(new Date(`${v.slice(0, 10)}T00:00:00`), "MMM d, yyyy") : "—";

const statusBadge = (status: string) => {
  if (status === "active") return "default";
  if (status === "paused") return "outline";
  if (status === "cancelled" || status === "expired") return "destructive";
  return "secondary";
};

// ─── Recurrence helpers (mirrors backend logic) ───────────────────────────────

type RecurrenceType = "weekly" | "biweekly" | "monthly_weeks";

const WEEK_LABELS = ["1st", "2nd", "3rd", "4th", "Last"];
const WEEK_VALUES = [1, 2, 3, 4, -1];

function generateReservationDates(
  startDateStr: string,
  endDateStr: string,
  days: number[],
  recurrenceType: RecurrenceType,
  weeksOfMonth: number[] = [],
): string[] {
  const start = new Date(`${startDateStr}T00:00:00`);
  const end   = new Date(`${endDateStr}T00:00:00`);
  const seen  = new Set<string>();

  if (recurrenceType === "monthly_weeks") {
    if (!days.length || !weeksOfMonth.length) return [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      for (const dow of days) {
        for (const weekNum of weeksOfMonth) {
          let candidate: Date | null = null;
          if (weekNum === -1) {
            for (let d = daysInMonth; d >= 1; d--) {
              const dt = new Date(y, m, d);
              if (dt.getDay() === dow && dt >= start && dt <= end) { candidate = dt; break; }
            }
          } else {
            let count = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const dt = new Date(y, m, d);
              if (dt.getDay() === dow) {
                count++;
                if (count === weekNum && dt >= start && dt <= end) { candidate = dt; break; }
              }
            }
          }
          if (candidate) seen.add(candidate.toISOString().slice(0, 10));
        }
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return [...seen].sort();
  }

  for (const dow of days) {
    const cursor = new Date(start);
    while (cursor.getDay() !== dow) cursor.setDate(cursor.getDate() + 1);
    let occ = 0;
    while (cursor <= end) {
      if (recurrenceType === "weekly" || occ % 2 === 0) seen.add(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 7);
      occ++;
    }
  }
  return [...seen].sort();
}

// ─── Shared recurrence scheduler UI ─────────────────────────────────────────

function RecurrenceScheduler({
  resDays, setResDays,
  resTime, setResTime,
  resEndTime, setResEndTime,
  resType, setResType,
  blockCapacity, setBlockCapacity,
  syncCalendar, setSyncCalendar,
  recurrenceType, setRecurrenceType,
  weeksOfMonth, setWeeksOfMonth,
  startDate, endDate,
}: {
  resDays: number[]; setResDays: (d: number[]) => void;
  resTime: string; setResTime: (t: string) => void;
  resEndTime: string; setResEndTime: (t: string) => void;
  resType: string; setResType: (t: string) => void;
  blockCapacity: boolean; setBlockCapacity: (b: boolean) => void;
  syncCalendar: boolean; setSyncCalendar: (b: boolean) => void;
  recurrenceType: RecurrenceType; setRecurrenceType: (r: RecurrenceType) => void;
  weeksOfMonth: number[]; setWeeksOfMonth: (w: number[]) => void;
  startDate: string; endDate: string;
}) {
  const DAYS = [
    { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
    { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
    { value: 0, label: "Sun" },
  ];
  const TIMES = ["08:00:00", "10:00:00", "12:00:00", "14:00:00"];
  const END_TIMES: Record<string, string> = { "08:00:00": "09:45:00", "10:00:00": "11:45:00", "12:00:00": "13:45:00", "14:00:00": "15:45:00" };
  const to12h = (t: string) => { const h = parseInt(t); return h === 0 ? "12 AM" : h > 12 ? `${h-12} PM` : h === 12 ? "12 PM" : `${h} AM`; };
  const toggleDay = (d: number) => setResDays(resDays.includes(d) ? resDays.filter((x) => x !== d) : [...resDays, d].sort());
  const toggleWeek = (w: number) => setWeeksOfMonth(weeksOfMonth.includes(w) ? weeksOfMonth.filter((x) => x !== w) : [...weeksOfMonth, w].sort((a, b) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b)));

  const generatedDates = (startDate && endDate && resDays.length)
    ? generateReservationDates(startDate, endDate, resDays, recurrenceType, weeksOfMonth)
    : [];
  const resCount = generatedDates.length;

  const recurrenceLabel = recurrenceType === "weekly" ? "Weekly" : recurrenceType === "biweekly" ? "Every 2 weeks" : "Specific weeks of month";

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {/* Recurrence type */}
      <div>
        <Label>Recurrence Type</Label>
        <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Every 2 weeks (biweekly)</SelectItem>
            <SelectItem value="monthly_weeks">Specific weeks of month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Weeks of month — only for monthly_weeks */}
      {recurrenceType === "monthly_weeks" && (
        <div>
          <Label className="mb-2 block">Weeks of Month</Label>
          <div className="flex flex-wrap gap-2">
            {WEEK_VALUES.map((w, i) => (
              <button key={w} type="button" onClick={() => toggleWeek(w)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${weeksOfMonth.includes(w) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {WEEK_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Days of week */}
      <div>
        <Label className="mb-2 block">
          {recurrenceType === "monthly_weeks" ? "Day of Week" : "Days of Week"}
        </Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${resDays.includes(d.value) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start Time</Label>
          <Select value={resTime} onValueChange={(v) => { setResTime(v); setResEndTime(END_TIMES[v] || "09:45:00"); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMES.map((t) => <SelectItem key={t} value={t}>{to12h(t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>End Time</Label>
          <Input readOnly value={resEndTime.slice(0, 5)} className="bg-muted" />
        </div>
      </div>

      {/* Reservation type */}
      <div>
        <Label>Reservation Type</Label>
        <Select value={resType} onValueChange={setResType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="booking_reserved">Reserved (blocks capacity)</SelectItem>
            <SelectItem value="confirmed_booking">Confirmed booking</SelectItem>
            <SelectItem value="calendar_block_only">Calendar block only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {resType !== "calendar_block_only" && (
        <div className="flex items-center justify-between">
          <Label>Block app booking capacity</Label>
          <Switch checked={blockCapacity} onCheckedChange={setBlockCapacity} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label>Sync to Google Calendar</Label>
        <Switch checked={syncCalendar} onCheckedChange={setSyncCalendar} />
      </div>

      {/* Preview */}
      {resCount > 0 && (
        <div className="rounded-lg bg-primary/10 p-3 text-sm">
          <p className="font-semibold text-primary">{resCount} time slots will be reserved</p>
          <p className="text-xs text-muted-foreground">
            {recurrenceLabel} · {to12h(resTime)}–{resEndTime.slice(0, 5)} · {startDate} → {endDate}
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const AdminSubscriptions = () => {
  const queryClient = useQueryClient();
  const { userData } = useAuth();

  const [filter, setFilter] = useState<SubFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("period");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [editSub, setEditSub] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<any>(null);
  const [invoiceSubId, setInvoiceSubId] = useState<string | null>(null);
  const [deleteConfirmSub, setDeleteConfirmSub] = useState<any>(null);
  const [cancelConfirmSub, setCancelConfirmSub] = useState<any>(null);
  const [renewConfirmSub, setRenewConfirmSub] = useState<any>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "user" ? "asc" : "desc");
    }
  };
  const { convertToSats } = useBtcPrice();

  // Auto-reconcile pending payments when the list is opened, so subscriptions
  // that were paid (e.g. an admin invoice) activate without any manual action.
  useEffect(() => {
    (async () => {
      try {
        const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";
        await fetch(`${API_URL}/cron/reconcile-payments`, { method: "POST" });
        queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      } catch {
        /* best effort */
      }
    })();
  }, [queryClient]);

  const generateInvoiceMutation = useMutation({
    mutationFn: async ({ subscriptionId, method }: { subscriptionId: string; method: "lightning" | "onchain" }) => {
      const { data, error } = await adminApi(`/admin/subscriptions/${subscriptionId}/invoice`, {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      if (error) throw error;
      return { ...data, method, subscriptionId };
    },
    onSuccess: (data) => { setInvoiceSubId(data.subscriptionId); setPaymentInvoice(data); },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidate = () => {
    // Prefix-invalidate — every paged/filtered variant of the list.
    queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  // ── Queries ────────────────────────────────────────────────────────────────

  const PAGE_SIZE_SERVER = 25;
  const listQuery = useQuery<{
    rows: any[]; total: number;
    stats: { total: number; active: number; pending: number; paused: number; cancelled: number; expired: number };
  }>({
    queryKey: ["admin-subscriptions", { page, filter, search, sortKey, sortDir }],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE_SERVER),
        status: filter,
        q: search,
        sortBy: sortKey,
        sortDir,
      });
      const { data, error } = await adminApi(`/admin/subscriptions?${qs.toString()}`);
      if (error) throw error;
      return data ?? { rows: [], total: 0, stats: { total: 0, active: 0, pending: 0, paused: 0, cancelled: 0, expired: 0 } };
    },
    keepPreviousData: true,
  } as any);
  const isLoading = listQuery.isLoading;
  const subscriptions = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

  const { data: packages = [] } = useQuery({
    queryKey: ["admin-cleaning-packages-list"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/subscription-packages");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users-for-assign"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/assignment-users");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clients = [], isLoading: clientsLoading, error: clientsError } = useQuery({
    queryKey: ["admin-clients-for-sub"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/clients/simple");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateSubMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      fields: Record<string, any>;
      action: string;
    }) => {
      const { error } = await adminApi(`/admin/subscriptions/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: data.fields, action: data.action }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      invalidate();
      setEditSub(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createSubMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      // One-time cleaning: create the subscription, then book the single slot
      // directly via Supabase (the backend recurrence engine can't create new
      // slots reliably). This mirrors how the user schedule books slots.
      if (data.one_time) {
        const res = data.reservations || {};
        const { reservations, ...subFields } = data;
        const { data: created, error } = await adminApi("/admin/subscriptions", {
          method: "POST",
          body: JSON.stringify(subFields),
        });
        if (error) throw error;
        const subId = created?.id;
        let bookings_created = 0;
        if (subId && res.start_time) {
          const date = String(subFields.start_date);
          const slot = await ensureCleaningSlot(date, res.start_time, res.end_time || res.start_time);
          const { data: bRow, error: bErr } = await supabaseDb.from("cleaning_bookings").insert({
            user_id: subFields.user_id || userData?.id || null,
            client_id: subFields.client_id || null,
            slot_id: slot.id,
            cleaning_subscription_id: subId,
            subscription_id: subId,
            status: "booked",
            reservation_type: "booking_reserved",
            source: "admin_onetime",
            notes: subFields.apartment_note || null,
            google_calendar_sync_status: "pending",
          }).select("id").single();
          if (bErr) throw new Error(`Subscription created, but booking failed: ${bErr.message}`);
          await supabaseDb.from("cleaning_available_slots")
            .update({ current_bookings: (slot.current_bookings || 0) + 1, updated_at: new Date().toISOString() })
            .eq("id", slot.id);
          bookings_created = 1;
          // Push the booking to Google Calendar right away (best-effort — the daily
          // sync cron would otherwise pick it up from its "pending" status).
          if (bRow?.id) {
            await adminApi(`/admin/cleaning/bookings/${bRow.id}/sync-calendar`, { method: "POST" }).catch(() => {});
          }
        }
        return { ...created, bookings_created };
      }

      const endpoint = data.reservations?.enabled ? "/admin/subscriptions/with-reservations" : "/admin/subscriptions";
      const { data: created, error } = await adminApi(endpoint, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (error) throw error;
      return created;
    },
    onSuccess: (result: any) => {
      const bookings = result?.bookings_created;
      toast.success(bookings ? `Subscription created + ${bookings} slot reserved` : "Subscription created");
      invalidate();
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reminderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await adminApi(`/admin/cleaning/subscriptions/${id}/payment-reminder`, { method: "POST" });
      if (error) throw error;
      return data as { ok: boolean; methods?: string[]; reason?: string };
    },
    onSuccess: (res) => {
      if (res?.ok) toast.success(`Reminder sent${res.methods?.length ? ` (${res.methods.join(", ")})` : ""}`);
      else if (res?.reason === "already_paid") toast.info("Already paid — no reminder needed");
      else if (res?.reason === "no_channel") toast.error("No email/account on file to notify this member");
      else toast.error("Could not send reminder");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remindAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/cleaning/payment-reminders/remind-unpaid`, { method: "POST", body: JSON.stringify({}) });
      if (error) throw error;
      return data as { total: number; sent: number; skipped: number };
    },
    onSuccess: (r) => toast.success(`Reminders: ${r.sent} sent${r.skipped ? `, ${r.skipped} skipped` : ""} (of ${r.total} unpaid)`),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelSubMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await adminApi(`/admin/subscriptions/${subscriptionId}/cancel`, { method: "PATCH" });
      if (error) throw error;
      return data;
    },
    onSuccess: (result: any) => {
      const cancelled = result?.bookings_cancelled ?? 0;
      toast.success(
        cancelled > 0
          ? `Subscription cancelled · ${cancelled} booking${cancelled !== 1 ? "s" : ""} removed from calendar`
          : "Subscription cancelled",
      );
      setCancelConfirmSub(null);
      invalidate();
    },
    onError: (e: Error) => { toast.error(e.message); setCancelConfirmSub(null); },
  });

  const deleteSubMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await adminApi(`/admin/subscriptions/${subscriptionId}`, { method: "DELETE" });
      if (error) throw error;
      return data;
    },
    onSuccess: (result: any) => {
      const deleted = result?.bookings_deleted ?? 0;
      toast.success(
        deleted > 0
          ? `Subscription deleted · ${deleted} booking${deleted !== 1 ? "s" : ""} permanently removed`
          : "Subscription permanently deleted",
      );
      setDeleteConfirmSub(null);
      invalidate();
    },
    onError: (e: Error) => { toast.error(e.message); setDeleteConfirmSub(null); },
  });

  // ── Filter / Search / Sort ───────────────────────────────────────────────────

  const getSubscriberName = (sub: any) =>
    sub.user?.display_name || sub.user?.name || sub.client_name || sub.user?.email || "Unknown";

  const getSubscriberEmail = (sub: any) =>
    sub.user?.email || sub.client_email || null;

  // Reset to first page whenever the filter/search/sort changes.
  useEffect(() => { setPage(0); }, [filter, search, sortKey, sortDir]);

  // Rows are already filtered/sorted/paged on the server — render as-is.
  const paged = subscriptions;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const stats = listQuery.data?.stats ?? { total: 0, active: 0, pending: 0, paused: 0, cancelled: 0, expired: 0 };

  const FILTERS: { label: string; value: SubFilter; count: number }[] = [
    { label: "All", value: "all", count: stats.total },
    { label: "Active", value: "active", count: stats.active },
    { label: "Pending", value: "pending", count: stats.pending },
    { label: "Paused", value: "paused", count: stats.paused },
    { label: "Cancelled", value: "cancelled", count: stats.cancelled },
    { label: "Expired", value: "expired", count: stats.expired },
  ];

  return (
    <SuperAdminLayout title="Subscriptions" subtitle="Manage all cleaning subscriptions">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-space-3 md:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: CalendarDays },
          { label: "Active", value: stats.active, icon: Play },
          { label: "Paused", value: stats.paused, icon: Pause },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-space-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <s.icon className="h-4 w-4" />
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mt-space-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-space-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {f.label}{" "}
              {f.count > 0 && (
                <span className="ml-1 opacity-60">{f.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-space-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subscriptions..."
              className="pl-9"
            />
          </div>
          {stats.pending > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => remindAllMutation.mutate()} disabled={remindAllMutation.isPending}>
              <Bell className="h-4 w-4" /> Remind unpaid ({stats.pending})
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Subscription
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="mt-space-4">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : total === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No subscriptions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="User" sortKey="user" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <TableHead>Plan</TableHead>
                    <SortableHead label="Price" sortKey="price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortableHead label="Period" sortKey="period" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <TableHead>Payment</TableHead>
                    <SortableHead label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((sub: any) => {
                    const st = effectiveStatus(sub);
                    const ended = st === "cancelled" || st === "expired";
                    const pending = isPendingPayment(sub);
                    const ds = displayStatus(sub);
                    const end = sub.paid_until || sub.service_end_date || sub.end_date;
                    const daysLeft = end ? Math.ceil((new Date(`${String(end).slice(0, 10)}T00:00:00`).getTime() - Date.now()) / 86400000) : null;
                    return (
                    <TableRow
                      key={sub.id}
                      className="cursor-pointer [&>td]:py-2.5"
                      onClick={() => setEditSub(sub)}
                    >
                      <TableCell>
                        <p className="font-semibold text-sm">{getSubscriberName(sub)}</p>
                        <p className="text-xs text-muted-foreground">{getSubscriberEmail(sub) || "—"}</p>
                      </TableCell>
                      <TableCell className="font-medium">
                        {sub.package_id ? sub.package_name : (sub.admin_notes || "One-time cleaning")}
                        {!sub.package_id && (
                          <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">One-time</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatCents(sub.monthly_price_cents || sub.total_price_cents || 0)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {!sub.package_id ? (
                          // One-time cleaning: a single dated event, not a billing period.
                          <>
                            <div>{formatDate(sub.service_start_date || sub.start_date)}</div>
                            {!ended && daysLeft != null && (
                              daysLeft < 0 ? (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Completed</span>
                              ) : (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-500"><Clock className="h-3 w-3" /> {daysLeft === 0 ? "Today" : `in ${daysLeft}d`}</span>
                              )
                            )}
                          </>
                        ) : (
                          <>
                            <div>
                              {formatDate(sub.service_start_date || sub.start_date)} —{" "}
                              {formatDate(end)}
                            </div>
                            {!ended && daysLeft != null && daysLeft < 0 && (
                              <span className="mt-0.5 flex items-center gap-1 text-xs text-destructive"><Clock className="h-3 w-3" /> Expired</span>
                            )}
                            {!ended && daysLeft != null && daysLeft >= 0 && daysLeft <= 7 && (
                              <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-500"><Clock className="h-3 w-3" /> {daysLeft === 0 ? "Expires today" : `${daysLeft}d left`}</span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={sub.payment_status === "paid" ? "default" : "secondary"} className="text-xs">
                            {sub.payment_status === "paid" ? "Paid" : "Unpaid"}
                          </Badge>
                          <PaymentMethodBadge method={sub.payment_method} />
                          <PaymentReference method={sub.payment_method} reference={sub.payment_reference} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${ds.className}`}>{ds.label}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Primary, context-aware action */}
                          {pending ? (
                            <Button
                              variant="tertiary"
                              size="sm"
                              loading={generateInvoiceMutation.isPending}
                              onClick={() => generateInvoiceMutation.mutate({ subscriptionId: sub.id, method: "lightning" })}
                            >
                              <QrCode className="h-3.5 w-3.5 mr-1" /> Pay
                            </Button>
                          ) : st === "paused" ? (
                            <Button
                              variant="tertiary"
                              size="sm"
                              onClick={() =>
                                updateSubMutation.mutate({ id: sub.id, fields: { subscription_status: "active", is_active: true }, action: "reactivate" })
                              }
                            >
                              <Play className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Resume
                            </Button>
                          ) : st === "active" ? (
                            <Button
                              variant="tertiary"
                              size="sm"
                              onClick={() =>
                                updateSubMutation.mutate({ id: sub.id, fields: { subscription_status: "paused", is_active: false }, action: "pause" })
                              }
                            >
                              <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                            </Button>
                          ) : null}

                          {/* Overflow menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="iconSm" className="rounded-full" aria-label="More actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => setEditSub(sub)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRenewConfirmSub(sub)}>
                                <RefreshCcw className="mr-2 h-4 w-4 text-green-500" /> Renew (payment received)
                              </DropdownMenuItem>
                              {pending && (
                                <DropdownMenuItem onClick={() => reminderMutation.mutate(sub.id)} disabled={reminderMutation.isPending}>
                                  <Bell className="mr-2 h-4 w-4 text-amber-500" /> Send payment reminder
                                </DropdownMenuItem>
                              )}
                              {!ended && (
                                <DropdownMenuItem onClick={() => setCancelConfirmSub(sub)}>
                                  <XCircle className="mr-2 h-4 w-4 text-amber-500" /> Cancel subscription
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteConfirmSub(sub)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {total > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-1 pt-4 mt-2 text-sm text-muted-foreground">
              <span>
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, total)} of {total}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="tertiary"
                    size="iconSm"
                    className="rounded-full"
                    disabled={currentPage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="tabular-nums">Page {currentPage + 1} / {totalPages}</span>
                  <Button
                    variant="tertiary"
                    size="iconSm"
                    className="rounded-full"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Subscription Sheet */}
      <Sheet open={!!editSub} onOpenChange={(o) => !o && setEditSub(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Subscription</SheetTitle>
            <SheetDescription>
              {editSub?.user?.email} — {editSub?.package_name}
            </SheetDescription>
          </SheetHeader>
          {editSub && (
            <EditSubscriptionForm
              sub={editSub}
              packages={packages}
              onSave={(fields) =>
                updateSubMutation.mutate({
                  id: editSub.id,
                  fields,
                  action: "edit",
                })
              }
              saving={updateSubMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create Subscription Sheet */}
      <Sheet open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Subscription</SheetTitle>
            <SheetDescription>
              Create a subscription manually for a user
            </SheetDescription>
          </SheetHeader>
          <CreateSubscriptionForm
            packages={packages}
            users={users}
            clients={clients}
            clientsLoading={clientsLoading}
            clientsError={clientsError}
            onSave={(data) => createSubMutation.mutate(data)}
            saving={createSubMutation.isPending}
          />
        </SheetContent>
      </Sheet>

      {/* Payment QR Dialog */}
      <Dialog open={!!paymentInvoice} onOpenChange={(open) => !open && setPaymentInvoice(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment Invoice</DialogTitle>
            <DialogDescription>
              {paymentInvoice?.plan_name} — {paymentInvoice?.client_name}
            </DialogDescription>
          </DialogHeader>
          {paymentInvoice && (() => {
            const isOnchain = paymentInvoice.method === "onchain";
            const onchainSats = isOnchain ? convertToSats((paymentInvoice.amount_cents || 0) / 100) : 0;
            const bitcoinUri = isOnchain
              ? `bitcoin:${paymentInvoice.address}?amount=${(onchainSats / 1e8).toFixed(8)}&label=ProsperaSub&message=${encodeURIComponent(`${paymentInvoice.plan_name ?? ""} — ${paymentInvoice.client_name ?? ""}`)}`
              : "";
            const qrValue = isOnchain ? bitcoinUri : paymentInvoice.payment_request;
            const code = isOnchain ? paymentInvoice.address : paymentInvoice.payment_request;
            const subSats = isOnchain ? onchainSats : paymentInvoice.amount_sats;
            return (
              <div className="flex flex-col items-center gap-4 py-2">
                {/* Method chooser */}
                <div className="grid w-full grid-cols-2 gap-2">
                  {(["lightning", "onchain"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={generateInvoiceMutation.isPending}
                      onClick={() => invoiceSubId && generateInvoiceMutation.mutate({ subscriptionId: invoiceSubId, method: m })}
                      className={cn(
                        "rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all",
                        (m === "onchain") === isOnchain ? "border-[#f7931a] bg-[#f7931a]/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30",
                        generateInvoiceMutation.isPending && "opacity-60",
                      )}
                    >
                      {m === "lightning" ? "Lightning" : "On-chain"}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl bg-white p-4">
                  <QRCodeSVG value={qrValue || " "} size={240} level="M" />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatCents(paymentInvoice.amount_cents)}</p>
                  {subSats ? (
                    <p className="text-sm text-muted-foreground">{Number(subSats).toLocaleString()} sats</p>
                  ) : null}
                </div>
                <div className="w-full space-y-2">
                  <Label className="text-xs text-muted-foreground">{isOnchain ? "Bitcoin Address" : "Payment Code"}</Label>
                  <div className="relative">
                    <Input readOnly value={code} className="pr-10 text-xs font-mono truncate" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => { navigator.clipboard.writeText(code); toast.success("Copied"); }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {isOnchain
                    ? "Send the exact amount on-chain to this address. Re-open Pay to refresh status."
                    : "Scan the QR code or copy the payment code to pay with any Lightning wallet."}
                </p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteConfirmSub} onOpenChange={(open) => !open && setDeleteConfirmSub(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Subscription
            </DialogTitle>
            <DialogDescription>
              This action is <strong>permanent and irreversible</strong>. The subscription and all
              associated bookings will be permanently deleted from the database and removed from
              Google Calendar.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirmSub && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">
                  {deleteConfirmSub.users?.display_name || deleteConfirmSub.users?.name || deleteConfirmSub.users?.email || "Unknown user"}
                </p>
                <p className="text-muted-foreground">
                  {deleteConfirmSub.plan_name || "Subscription"} · {deleteConfirmSub.subscription_status}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setDeleteConfirmSub(null)}
                  disabled={deleteSubMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  loading={deleteSubMutation.isPending}
                  onClick={() => deleteSubMutation.mutate(deleteConfirmSub.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteSubMutation.isPending ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation dialog ── */}
      <Dialog open={!!cancelConfirmSub} onOpenChange={(open) => !open && setCancelConfirmSub(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <XCircle className="h-5 w-5" />
              Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              This marks the subscription as <strong>cancelled</strong> and removes all of its
              future bookings from the calendar. The record is kept (you can still delete it later).
            </DialogDescription>
          </DialogHeader>
          {cancelConfirmSub && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">{getSubscriberName(cancelConfirmSub)}</p>
                <p className="text-muted-foreground">
                  {cancelConfirmSub.package_name || "Subscription"} · {effectiveStatus(cancelConfirmSub)}
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setCancelConfirmSub(null)}
                  disabled={cancelSubMutation.isPending}
                >
                  Keep subscription
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  loading={cancelSubMutation.isPending}
                  onClick={() => cancelSubMutation.mutate(cancelConfirmSub.id)}
                >
                  <XCircle className="h-4 w-4" />
                  {cancelSubMutation.isPending ? "Cancelling…" : "Cancel subscription"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Renew (off-platform payment) dialog ── */}
      <Dialog open={!!renewConfirmSub} onOpenChange={(open) => !open && setRenewConfirmSub(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-500">
              <RefreshCcw className="h-5 w-5" />
              Renew Subscription
            </DialogTitle>
            <DialogDescription>
              Record an <strong>off-platform payment</strong>: the period is extended by the plan
              duration (continuing from the current end date), and it's marked <strong>Paid</strong>{" "}
              (method: Manual). Use this when money was received outside the platform.
            </DialogDescription>
          </DialogHeader>
          {renewConfirmSub && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">{getSubscriberName(renewConfirmSub)}</p>
                <p className="text-muted-foreground">
                  {renewConfirmSub.package_name || "Subscription"} · {effectiveStatus(renewConfirmSub)}
                </p>
              </div>
              <DialogFooter>
                <Button variant="secondary" className="flex-1" onClick={() => setRenewConfirmSub(null)} disabled={updateSubMutation.isPending}>
                  Go back
                </Button>
                <Button
                  className="flex-1"
                  loading={updateSubMutation.isPending}
                  onClick={() => {
                    const sub = renewConfirmSub;
                    const months = Math.max(Number(sub.billing_period_months) || 1, 1);
                    const today = todayHN();
                    const prevEndStr = (sub.paid_until || sub.service_end_date || sub.end_date || "").slice(0, 10);
                    const nextStartStr = prevEndStr && prevEndStr >= today ? addDaysISO(prevEndStr, 1) : today;
                    const endStr = addMonthsISO(nextStartStr, months);
                    updateSubMutation.mutate({
                      id: sub.id,
                      action: "renew",
                      fields: {
                        subscription_status: "active", is_active: true,
                        payment_status: "paid", payment_method: "manual",
                        service_start_date: nextStartStr, service_end_date: endStr,
                        paid_until: endStr, end_date: endStr,
                      },
                    });
                    setRenewConfirmSub(null);
                  }}
                >
                  <RefreshCcw className="h-4 w-4" /> Confirm renewal
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
};

// ── Sortable column header ──
function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

function EditSubscriptionForm({
  sub,
  packages,
  onSave,
  saving,
}: {
  sub: any;
  packages: any[];
  onSave: (d: any) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState(
    sub.subscription_status || (sub.is_active ? "active" : "inactive"),
  );
  const [paymentStatus, setPaymentStatus] = useState(
    sub.payment_status || "pending",
  );
  const [packageId, setPackageId] = useState(sub.package_id || "");
  const [monthlyPrice, setMonthlyPrice] = useState(
    String(sub.monthly_price_cents || ""),
  );
  const [startDate, setStartDate] = useState(
    (sub.service_start_date || sub.start_date || "").slice(0, 10),
  );
  const [endDate, setEndDate] = useState(
    (sub.paid_until || sub.service_end_date || sub.end_date || "").slice(0, 10),
  );
  const [notes, setNotes] = useState(sub.apartment_note || "");

  // Load existing bookings for this subscription
  const { data: existingBookings = [] } = useQuery({
    queryKey: ["sub-bookings", sub.id],
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/subscriptions/${sub.id}/bookings`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const to12hSlot = (t: string) => {
    const h = parseInt(t);
    return h === 0 ? "12:00 AM" : h > 12 ? `${h - 12}:${t.slice(3, 5)} PM` : h === 12 ? `12:${t.slice(3, 5)} PM` : `${h}:${t.slice(3, 5)} AM`;
  };

  // Reservation
  const [reserveSlots, setReserveSlots] = useState(false);
  const [resDays, setResDays] = useState<number[]>([]);
  const [resTime, setResTime] = useState("08:00:00");
  const [resEndTime, setResEndTime] = useState("09:45:00");
  const [resType, setResType] = useState("booking_reserved");
  const [blockCapacity, setBlockCapacity] = useState(true);
  const [syncCalendar, setSyncCalendar] = useState(true);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [weeksOfMonth, setWeeksOfMonth] = useState<number[]>([]);

  const resCount = (reserveSlots && resDays.length && startDate && endDate)
    ? generateReservationDates(startDate, endDate, resDays, recurrenceType, weeksOfMonth).length
    : 0;

  const addReservationsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi(`/admin/subscriptions/with-reservations`, {
        method: "POST",
        body: JSON.stringify({
          // Reuse existing subscription data — backend will detect existing sub id
          user_id: sub.user_id || null,
          client_id: sub.client_id || null,
          package_id: packageId,
          start_date: startDate,
          end_date: endDate,
          service_start_date: startDate,
          service_end_date: endDate,
          paid_until: endDate,
          billing_period_months: 1,
          monthly_price_cents: Number(monthlyPrice) || 0,
          total_price_cents: Number(monthlyPrice) || 0,
          payment_status: paymentStatus,
          subscription_status: status,
          is_active: status === "active",
          apartment_note: notes || null,
          // Attach to existing subscription
          _existing_subscription_id: sub.id,
          reservations: {
            enabled: true,
            recurrence_type: recurrenceType,
            days_of_week: resDays,
            weeks_of_month: weeksOfMonth,
            start_time: resTime,
            end_time: resEndTime,
            reservation_type: resType,
            block_capacity: resType !== "calendar_block_only" && blockCapacity,
            sync_calendar: syncCalendar,
            end_date: endDate,
            notes,
          },
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reservations added");
      setResDays([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOneTime = !sub.package_id;

  return (
    <div className="mt-6 space-y-5">
      {isOneTime ? (
        <div>
          <Label>Plan</Label>
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{sub.admin_notes || "One-time cleaning"}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">One-time</span>
          </div>
        </div>
      ) : (
        <div>
          <Label>Plan</Label>
          <Select value={packageId} onValueChange={setPackageId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {packages.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Subscription Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="pending_schedule">Pending Schedule</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Payment Status</Label>
        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Monthly Price (cents)</Label>
        <Input
          type="number"
          value={monthlyPrice}
          onChange={(e) => setMonthlyPrice(e.target.value)}
        />
        {monthlyPrice && (
          <p className="mt-1 text-xs text-muted-foreground">
            = {formatCents(Number(monthlyPrice))}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label>End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>Notes / Apartment</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes"
        />
      </div>
      {sub.cleaner_hint && (
        <div>
          <Label>Hints for cleaners (from customer)</Label>
          <p className="mt-1 whitespace-pre-wrap rounded-radius-md border border-[hsl(var(--app-divider))] bg-muted/30 p-space-3 text-sm text-muted-foreground">
            {sub.cleaner_hint}
          </p>
        </div>
      )}
      <Button
        className="w-full"
        size="xl"
        onClick={() =>
          onSave({
            package_id: packageId || null,
            subscription_status: status,
            is_active: status === "active",
            payment_status: paymentStatus,
            monthly_price_cents: Number(monthlyPrice) || undefined,
            service_start_date: startDate || undefined,
            paid_until: endDate || undefined,
            service_end_date: endDate || undefined,
            apartment_note: notes || null,
          })
        }
        loading={saving}
      >
        Save Changes
      </Button>

      {/* Existing Reservations */}
      {existingBookings.length > 0 && (
        <div className="border-t border-border pt-5">
          <Label className="mb-2 block">Reservations ({existingBookings.length})</Label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {existingBookings.map((b: any) => {
              const slot = b.slot;
              const date = slot?.date ? new Date(`${slot.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
              const time = slot?.start_time ? `${to12hSlot(slot.start_time)}–${to12hSlot(slot.end_time)}` : "";
              const syncIcon = b.google_calendar_sync_status === "synced" ? "✅" : b.google_calendar_sync_status === "failed" ? "❌" : "⏳";
              return (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{date}</span>
                    <span className="ml-2 text-muted-foreground">{time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={b.status === "booked" ? "default" : b.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {b.reservation_type === "calendar_block_only" ? "block" : b.reservation_type === "booking_reserved" ? "reserved" : b.status}
                    </Badge>
                    <span className="text-xs" title={`Calendar: ${b.google_calendar_sync_status}`}>{syncIcon}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Reservations */}
      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
          <div>
            <p className="text-sm font-medium">Reserve time slots</p>
            <p className="text-xs text-muted-foreground">Add weekly slot reservations to this subscription</p>
          </div>
          <Switch checked={reserveSlots} onCheckedChange={setReserveSlots} />
        </div>
      </div>

      {reserveSlots && (
        <>
          <RecurrenceScheduler
            resDays={resDays} setResDays={setResDays}
            resTime={resTime} setResTime={setResTime}
            resEndTime={resEndTime} setResEndTime={setResEndTime}
            resType={resType} setResType={setResType}
            blockCapacity={blockCapacity} setBlockCapacity={setBlockCapacity}
            syncCalendar={syncCalendar} setSyncCalendar={setSyncCalendar}
            recurrenceType={recurrenceType} setRecurrenceType={setRecurrenceType}
            weeksOfMonth={weeksOfMonth} setWeeksOfMonth={setWeeksOfMonth}
            startDate={startDate} endDate={endDate}
          />
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => addReservationsMutation.mutate()}
            loading={addReservationsMutation.isPending}
            disabled={!resDays.length || (recurrenceType === "monthly_weeks" && !weeksOfMonth.length)}
          >
            Add {resCount} Reservations
          </Button>
        </>
      )}
    </div>
  );
}

function CreateSubscriptionForm({
  packages,
  users,
  clients,
  clientsLoading,
  clientsError,
  onSave,
  saving,
}: {
  packages: any[];
  users: any[];
  clients: any[];
  clientsLoading: boolean;
  clientsError: Error | null;
  onSave: (d: any) => void;
  saving: boolean;
}) {
  const [mode, setMode] = useState<"plan" | "onetime">("plan");
  const [subscriberType, setSubscriberType] = useState<"user" | "client">("user");
  const [userId, setUserId] = useState("");
  const [clientId, setClientId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [billingMonths, setBillingMonths] = useState("1");
  const [startDate, setStartDate] = useState(todayHN());
  const [notes, setNotes] = useState("");

  // One-time cleaning (no plan): custom price + single date/time
  const [onetimePrice, setOnetimePrice] = useState("");
  const [onetimeStart, setOnetimeStart] = useState("08:00:00");
  const [onetimeEnd, setOnetimeEnd] = useState("09:45:00");
  const [onetimeLabel, setOnetimeLabel] = useState("One-time cleaning");
  const [isFree, setIsFree] = useState(false);

  // Reservation
  const [reserveSlots, setReserveSlots] = useState(false);
  const [resDays, setResDays] = useState<number[]>([]);
  const [resTime, setResTime] = useState("08:00:00");
  const [resEndTime, setResEndTime] = useState("09:45:00");
  const [resType, setResType] = useState("booking_reserved");
  const [blockCapacity, setBlockCapacity] = useState(true);
  const [syncCalendar, setSyncCalendar] = useState(true);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [weeksOfMonth, setWeeksOfMonth] = useState<number[]>([]);

  const addMonths = (date: string, months: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  };

  const oneTime = mode === "onetime";
  const onetimeCents = isFree ? 0 : Math.round((parseFloat(onetimePrice) || 0) * 100);
  const selectedPkg = packages.find((p: any) => p.id === packageId);
  const monthly = oneTime ? onetimeCents : (selectedPkg ? resolveMonthlyPriceCents(selectedPkg) : 0);
  const total = oneTime ? onetimeCents : monthly * (Number(billingMonths) || 1);
  const hasSubscriber = subscriberType === "user" ? !!userId : !!clientId;
  const endDate = oneTime ? startDate : addMonths(startDate, Number(billingMonths));
  const resCount = (reserveSlots && resDays.length)
    ? generateReservationDates(startDate, endDate, resDays, recurrenceType, weeksOfMonth).length
    : 0;

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([
          { id: "plan" as const, label: "Subscription plan" },
          { id: "onetime" as const, label: "One-time cleaning" },
        ]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <Label>Subscriber Type</Label>
        <Select value={subscriberType} onValueChange={(v) => { setSubscriberType(v as "user" | "client"); setUserId(""); setClientId(""); }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User (registered account)</SelectItem>
            <SelectItem value="client">Client (cleaning client)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {subscriberType === "user" ? (
        <div>
          <Label>User *</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name || u.name || u.email}{" "}
                  {u.email ? `(${u.email})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label>Client *</Label>
          {clientsLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading clients…</p>
          ) : clientsError ? (
            <p className="text-sm text-destructive py-2">Failed to load clients: {clientsError.message}</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No clients found. Create a client first in Clients page.</p>
          ) : (
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c: any) => {
                  const name = c.companyName || c.company_name || "Unnamed";
                  const email = c.email || "";
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex flex-col">
                        <span>{name}</span>
                        {email && <span className="text-xs text-muted-foreground">{email}</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {!oneTime && (
        <>
          <div>
            <Label>Plan *</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatPricingLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Billing Period (months)</Label>
            <Select value={billingMonths} onValueChange={setBillingMonths}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 month</SelectItem>
                <SelectItem value="2">2 months</SelectItem>
                <SelectItem value="3">3 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {oneTime && (
        <>
          <div>
            <Label>Label</Label>
            <Input value={onetimeLabel} onChange={(e) => setOnetimeLabel(e.target.value)} placeholder="One-time cleaning" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <div>
              <p className="text-sm font-medium">Free cleaning</p>
              <p className="text-xs text-muted-foreground">No charge — created as paid &amp; active</p>
            </div>
            <Switch checked={isFree} onCheckedChange={setIsFree} />
          </div>
          {!isFree && (
            <div>
              <Label>Price (USD) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={onetimePrice}
                onChange={(e) => setOnetimePrice(e.target.value)}
                placeholder="e.g. 50.00"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start time</Label>
              <Input type="time" value={onetimeStart.slice(0, 5)} onChange={(e) => setOnetimeStart(`${e.target.value}:00`)} />
            </div>
            <div>
              <Label>End time</Label>
              <Input type="time" value={onetimeEnd.slice(0, 5)} onChange={(e) => setOnetimeEnd(`${e.target.value}:00`)} />
            </div>
          </div>
        </>
      )}

      <div>
        <Label>{oneTime ? "Cleaning Date" : "Start Date"}</Label>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
      {oneTime ? (
        (isFree || onetimeCents > 0) && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p>
              Price: <strong>{isFree ? "Free" : formatCents(total)}</strong>
            </p>
            <p>
              {startDate} · {onetimeStart.slice(0, 5)}–{onetimeEnd.slice(0, 5)}
            </p>
            <p className="text-xs text-muted-foreground">A single cleaning will be reserved on this date.</p>
          </div>
        )
      ) : (
        selectedPkg && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p>
              Monthly: <strong>{formatCents(monthly)}</strong>
            </p>
            <p>
              Total: <strong>{formatCents(total)}</strong>
            </p>
            <p>
              Period: {startDate} — {addMonths(startDate, Number(billingMonths))}
            </p>
          </div>
        )
      )}
      {/* Reserve Time Slots — plan mode only (one-time always reserves its single date) */}
      {!oneTime && (
        <>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <div>
              <p className="text-sm font-medium">Reserve time slots</p>
              <p className="text-xs text-muted-foreground">Block weekly cleaning times for this subscription</p>
            </div>
            <Switch checked={reserveSlots} onCheckedChange={setReserveSlots} />
          </div>

          {reserveSlots && (
            <RecurrenceScheduler
              resDays={resDays} setResDays={setResDays}
              resTime={resTime} setResTime={setResTime}
              resEndTime={resEndTime} setResEndTime={setResEndTime}
              resType={resType} setResType={setResType}
              blockCapacity={blockCapacity} setBlockCapacity={setBlockCapacity}
              syncCalendar={syncCalendar} setSyncCalendar={setSyncCalendar}
              recurrenceType={recurrenceType} setRecurrenceType={setRecurrenceType}
              weeksOfMonth={weeksOfMonth} setWeeksOfMonth={setWeeksOfMonth}
              startDate={startDate} endDate={endDate}
            />
          )}
        </>
      )}

      <div>
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Apartment number, access notes"
        />
      </div>
      <Button
        className="w-full"
        size="xl"
        onClick={() => {
          if (oneTime) {
            const dow = new Date(`${startDate}T00:00:00`).getDay();
            onSave({
              user_id: subscriberType === "user" ? userId : null,
              client_id: subscriberType === "client" ? clientId : null,
              package_id: null,
              one_time: true,
              start_date: startDate,
              end_date: startDate,
              service_start_date: startDate,
              service_end_date: startDate,
              paid_until: startDate,
              billing_period_months: 1,
              monthly_price_cents: total,
              total_price_cents: total,
              cleanings_remaining: 1,
              payment_status: isFree ? "paid" : "pending",
              payment_method: isFree ? "free" : undefined,
              subscription_status: isFree ? "active" : "pending_payment",
              is_active: isFree,
              apartment_note: notes || null,
              admin_notes: onetimeLabel || (isFree ? "Free cleaning" : "One-time cleaning"),
              reservations: {
                enabled: true,
                recurrence_type: "weekly",
                days_of_week: [dow],
                weeks_of_month: [],
                start_time: onetimeStart,
                end_time: onetimeEnd,
                reservation_type: "booking_reserved",
                block_capacity: true,
                sync_calendar: true,
                end_date: startDate,
                notes,
              },
            });
            return;
          }
          const payload: any = {
            user_id: subscriberType === "user" ? userId : null,
            client_id: subscriberType === "client" ? clientId : null,
            package_id: packageId,
            start_date: startDate,
            end_date: endDate,
            service_start_date: startDate,
            service_end_date: endDate,
            paid_until: endDate,
            billing_period_months: Number(billingMonths),
            monthly_price_cents: monthly,
            total_price_cents: total,
            cleanings_remaining: selectedPkg ? monthlyCleaningEstimate(selectedPkg) * Number(billingMonths) : 0,
            payment_status: "pending",
            subscription_status: "pending_payment",
            is_active: false,
            apartment_note: notes || null,
          };
          if (reserveSlots && resDays.length) {
            payload.reservations = {
              enabled: true,
              recurrence_type: recurrenceType,
              days_of_week: resDays,
              weeks_of_month: weeksOfMonth,
              start_time: resTime,
              end_time: resEndTime,
              reservation_type: resType,
              block_capacity: resType !== "calendar_block_only" && blockCapacity,
              sync_calendar: syncCalendar,
              end_date: endDate,
              notes,
            };
          }
          onSave(payload);
        }}
        loading={saving}
        disabled={oneTime ? (!hasSubscriber || (!isFree && onetimeCents <= 0)) : (!hasSubscriber || !packageId)}
      >
        {oneTime
          ? (isFree ? "Create Free Cleaning" : "Create One-time Cleaning")
          : `Create Subscription${reserveSlots && resCount > 0 ? ` + ${resCount} Reservations` : ""}`}
      </Button>
    </div>
  );
}

export default AdminSubscriptions;
