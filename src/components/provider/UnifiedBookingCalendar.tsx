import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, MoreHorizontal, CheckCircle2, XCircle, PauseCircle, PlayCircle, CalendarClock } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import { StatusPill } from "@/components/patterns/StatusPill";
import { CustomerPhone } from "@/components/patterns/CustomerPhone";
import { SaleOriginBadge } from "@/components/patterns/SaleOrigin";
import { RescheduleCleaningDialog } from "@/components/cleaning/RescheduleCleaningDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabEmptyState, SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { cn } from "@/lib/utils";
import { supabaseDb } from "@/integrations/supabase/client";
import { cancelCleaningBookings } from "@/lib/cleaning/cancelBooking";
import { toast } from "sonner";
import { useUnifiedBookings, type UnifiedBookingRow } from "@/hooks/useUnifiedBookings";
import { WeekTimeGrid } from "@/components/provider/WeekTimeGrid";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment, type ApproveService } from "@/lib/subscriptionApprove";

interface Props {
  providerId: string;
  /** Universal `providers.id` — what `bookable_resources` is keyed by. */
  calendarsProviderId?: string;
  sourceKey: string;
  /**
   * How the week is cut up.
   *
   * "day" answers "what is happening on Thursday"; "calendar" answers "how
   * busy is court 2" — the same week, the same rows, the same actions, grouped
   * by the other axis. A club with three courts cannot read the second from
   * the first without counting.
   */
  groupBy?: "day" | "calendar";
}

// Mon-first weekday order for the strip header + iteration.
function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const timeLabel = (d: Date) => format(d, "HH:mm");

/**
 * Owner-facing week calendar of every booking on the provider — one component
 * for cleaning / food / cars / beach. Reads normalized rows via
 * `useUnifiedBookings` so the same view works regardless of which legacy table
 * the data lives in.
 *
 *   ← Week of Mon 8 Jul – Sun 14 Jul →
 *   [ status filter chips … ]
 *
 *   Mon 8    Tue 9    Wed 10   Thu 11   Fri 12   Sat 13   Sun 14
 *   ─────    ─────    ─────    ─────    ─────    ─────    ─────
 *    row      row       —       row      row       —        —
 *    row       —        —        —       row       —        —
 *
 * Tapping a row opens the customer/plan detail (future — we surface the raw
 * booking record to any onOpen callback the parent tab wants to wire).
 */
export function UnifiedBookingCalendar({
  providerId, calendarsProviderId, sourceKey, groupBy = "day",
}: Props) {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [rescheduleRow, setRescheduleRow] = useState<UnifiedBookingRow | null>(null);
  /** Which calendar the grid is showing; empty string means all of them. */
  const [calendarId, setCalendarId] = useState("");

  // The calendars are what the grid is drawn from: their opening hours decide
  // where the day starts and ends, so an 8–19 club does not render midnight.
  const { data: calendars = [] } = useQuery({
    queryKey: ["grid-calendars", calendarsProviderId ?? providerId],
    enabled: groupBy === "calendar" && !!(calendarsProviderId ?? providerId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, hours, sort_order")
        .eq("provider_id", calendarsProviderId ?? providerId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; name: string;
        hours: { open_hour?: number; close_hour?: number } | null;
      }>;
    },
  });

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const from = iso(days[0]);
  const to = iso(days[6]);

  const { data: bookings = [], isLoading } = useUnifiedBookings({
    providerId, sourceKey, from, to,
  });

  // Service-aware row-action mutation. Writes directly to the source table so
  // the owner can mark bookings from the calendar without leaving to the ops
  // tab. Rich flows (cleaning completion form with checklist + photo) still
  // live under the Reports tab — this is the daily-status quick path.
  const setStatus = useMutation({
    mutationFn: async ({ row, next }: { row: UnifiedBookingRow; next: string }) => {
      // Cleaning cancellations go through the shared helper: the visit holds a
      // slot seat and a cleaning off the subscription, and a bare status write
      // strands both. Other services book a resource for a date range and have
      // no counter to give back, so a plain write is right for them.
      if (next === "cancelled" && row.sourceTable === "cleaning_bookings") {
        const { cancelled } = await cancelCleaningBookings(supabaseDb, [row.id]);
        if (cancelled.length === 0) throw new Error("This booking is already cancelled or completed");
        return;
      }
      const { error } = await supabaseDb
        .from(row.sourceTable)
        .update({ status: next })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["unified-bookings", sourceKey, providerId] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update"),
  });

  const { userData } = useAuth();
  // Off-platform / pending-cron payments. Cars in particular had NO approve
  // action anywhere (audit P0 #1). Now every row with payment_status != paid
  // gets a "Mark as paid" item in the ⋯ menu.
  const approve = useMutation({
    mutationFn: async (row: UnifiedBookingRow) => {
      const service = approveServiceFor(row.sourceTable);
      if (!service) throw new Error("Unsupported service");
      await approvePayment(service, row.id, { adminUserId: userData?.id });
    },
    onSuccess: () => {
      toast.success("Payment approved");
      qc.invalidateQueries({ queryKey: ["unified-bookings", sourceKey, providerId] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not approve"),
  });

  const filtered = useMemo(
    () => (statusFilter ? bookings.filter((b) => b.status === statusFilter) : bookings),
    [bookings, statusFilter],
  );

  // Group by day-of-week ordinal so the grid renders in one pass.
  const byDay = useMemo(() => {
    const m = new Map<string, UnifiedBookingRow[]>();
    days.forEach((d) => m.set(iso(d), []));
    filtered.forEach((b) => {
      // A booking may span multiple days (food subs) — render on every day it
      // overlaps in the current window so owners see coverage at a glance.
      days.forEach((d) => {
        const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
        if (b.startAt <= dayEnd && (b.endAt ?? b.startAt) >= d) {
          m.get(iso(d))?.push(b);
        }
      });
    });
    return m;
  }, [filtered, days]);

  /**
   * The same rows keyed by the calendar they are on, in the order the
   * calendars were named. A booking from a service without calendars falls
   * into one unnamed group rather than disappearing.
   */
  const byCalendar = useMemo(() => {
    const m = new Map<string, { name: string; rows: UnifiedBookingRow[] }>();
    filtered.forEach((b) => {
      const key = b.resourceId ?? b.resourceName ?? "__none__";
      const name = b.resourceName ?? b.planName ?? "No calendar";
      const bucket = m.get(key) ?? { name, rows: [] };
      bucket.rows.push(b);
      m.set(key, bucket);
    });
    return [...m.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  /** Rows the grid draws: the week's, narrowed to one calendar when chosen. */
  const gridRows = useMemo(
    () => (calendarId ? filtered.filter((b) => b.resourceId === calendarId) : filtered),
    [filtered, calendarId],
  );

  /**
   * When the day starts and ends on this grid.
   *
   * The widest window among the calendars in view, so a court open till 21:00
   * is not cut off by one that closes at 19:00. Falls back to 8–19, which is
   * what a calendar carries when nobody has edited its hours.
   */
  const { openHour, closeHour } = useMemo(() => {
    const inView = calendarId ? calendars.filter((c) => c.id === calendarId) : calendars;
    const opens = inView.map((c) => c.hours?.open_hour).filter((h): h is number => typeof h === "number");
    const closes = inView.map((c) => c.hours?.close_hour).filter((h): h is number => typeof h === "number");
    const open = opens.length ? Math.min(...opens) : 8;
    const close = closes.length ? Math.max(...closes) : 19;
    return { openHour: Math.max(0, Math.min(open, 23)), closeHour: Math.max(open + 1, Math.min(close, 24)) };
  }, [calendars, calendarId]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    bookings.forEach((b) => s.add(b.status));
    return Array.from(s).sort();
  }, [bookings]);

  const weekLabel = `${format(days[0], "MMM d")} — ${format(days[6], "MMM d")}`;

  return (
    <div className="space-y-3">
      {/* Nav bar */}
      <div className="flex items-center justify-between gap-2 rounded-radius-lg bg-card p-2">
        <Button
          variant="ghost" size="iconSm"
          onClick={() => setWeekStart((d) => addDays(d, -7))}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-sm font-bold text-foreground">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="ghost" size="iconSm"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Which calendar. Only when there is a choice to make. */}
      {groupBy === "calendar" && calendars.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCalendarId("")}
            className={cn(
              "rounded-full px-3 py-1 text-[14px] font-semibold transition-colors",
              calendarId === ""
                ? "bg-primary/15 text-primary ring-1 ring-primary"
                : "bg-muted/40 text-muted-foreground hover:text-foreground",
            )}
          >
            All calendars
          </button>
          {calendars.map((c) => {
            const count = filtered.filter((b) => b.resourceId === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCalendarId(c.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[14px] font-semibold transition-colors",
                  calendarId === c.id
                    ? "bg-primary/15 text-primary ring-1 ring-primary"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name} · {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Status filter chips */}
      {statuses.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={cn(
              "rounded-full px-3 py-1 text-[14px] font-semibold transition-colors",
              statusFilter === null
                ? "bg-primary/15 text-primary ring-1 ring-primary"
                : "bg-muted/40 text-muted-foreground hover:text-foreground",
            )}
          >
            All · {bookings.length}
          </button>
          {statuses.map((s) => {
            const count = bookings.filter((b) => b.status === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1 text-[14px] font-semibold transition-colors",
                  statusFilter === s
                    ? "bg-primary/15 text-primary ring-1 ring-primary"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {s} · {count}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : groupBy === "calendar" ? (
        // A quiet week is a grid with nothing in it — that IS the answer to
        // "what is free". Replacing it with a message hides the one thing the
        // view exists to show.
        <WeekTimeGrid
          days={days}
          bookings={gridRows}
          openHour={openHour}
          closeHour={closeHour}
          // Who booked it, always — the court is the chip above (or the second
          // line when every calendar is showing at once).
          labelOf={(row) => row.customerName ?? row.planName ?? "Booked"}
          sublabelOf={calendarId ? undefined : (row) => row.resourceName ?? null}
        />
      ) : filtered.length === 0 ? (
        <TabEmptyState
          icon={CalendarDays}
          title="No bookings this week"
          subtitle={statusFilter ? "Try changing the filter or navigating to another week." : "This week is quiet — check upcoming or past weeks."}
        />
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const dayISO = iso(day);
            const rows = byDay.get(dayISO) ?? [];
            if (rows.length === 0) return null;
            const isToday = isSameDay(day, new Date());
            return (
              <section key={dayISO} className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
                <div className="mb-2 flex items-center justify-between">
                  <SectionOverline
                    label={`${format(day, "EEE d MMM")}${isToday ? " · Today" : ""}`}
                    count={rows.length}
                    tone={isToday ? "success" : "default"}
                  />
                </div>
                <div className="divide-y divide-border/40">
                  {rows.map((b) => (
                    <BookingRow
                      key={`${dayISO}-${b.id}`}
                      row={b}
                      onSetStatus={(next) => setStatus.mutate({ row: b, next })}
                      onApprovePayment={() => approve.mutate(b)}
                      onReschedule={() => setRescheduleRow(b)}
                      pending={setStatus.isPending || approve.isPending}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Cleaning-only reschedule dialog. `rescheduleRow` guards the mount so
          other services can't accidentally open it. */}
      {rescheduleRow?.sourceTable === "cleaning_bookings" && (
        <RescheduleCleaningDialog
          booking={{
            id: rescheduleRow.id,
            customerName: rescheduleRow.customerName,
            planName: rescheduleRow.planName,
            currentSlotId: (rescheduleRow.meta?.slot_id as string | null) ?? null,
            currentDate: (rescheduleRow.meta?.slot_date as string | null) ?? null,
            currentStartTime: (rescheduleRow.meta?.slot_start_time as string | null) ?? null,
            currentEndTime: (rescheduleRow.meta?.slot_end_time as string | null) ?? null,
            location: (rescheduleRow.meta?.location as string | null) ?? null,
            notes: (rescheduleRow.meta?.notes as string | null) ?? null,
            googleCalendarEventId: (rescheduleRow.meta?.google_calendar_event_id as string | null) ?? null,
            status: rescheduleRow.status,
          }}
          onClose={() => setRescheduleRow(null)}
        />
      )}
    </div>
  );
}

// ─── Booking row ───────────────────────────────────────────────────────────
function BookingRow({
  row, onSetStatus, onApprovePayment, onReschedule, pending, dayLabel,
}: {
  row: UnifiedBookingRow;
  /** Set when the section is not a day — then the row has to say which day. */
  dayLabel?: string;
  onSetStatus: (next: string) => void;
  onApprovePayment?: () => void;
  onReschedule?: () => void;
  pending: boolean;
}) {
  const actions = rowActionsFor(row);
  const canApprovePayment =
    !!onApprovePayment &&
    isPendingPayment({ payment_status: row.paymentStatus }) &&
    row.status.toLowerCase() !== "cancelled";
  // Reschedule is cleaning-only for now — food is date-range, cars/beach have
  // their own booking flows and don't share slot-capacity mechanics.
  const canReschedule =
    !!onReschedule &&
    row.sourceTable === "cleaning_bookings" &&
    !["cancelled", "completed"].includes(row.status.toLowerCase());
  // What the user provided at booking time — surface it inline so the owner
  // sees address / access instructions / free-form notes without having to
  // click through to the source table.
  const location   = (row.meta?.location as string | null) || (row.meta?.delivery_address as string | null) || null;
  const notes      = (row.meta?.notes as string | null) || (row.meta?.delivery_notes as string | null) || null;
  const access     = row.meta?.access_instructions as string | null;
  const cleaner    = row.meta?.cleaner_hint as string | null;
  const phone      = row.meta?.phone as string | null;
  const timeRange = row.endAt && !isSameDay(row.startAt, row.endAt)
    ? `${format(row.startAt, "MMM d")} → ${format(row.endAt, "MMM d")}`
    : row.endAt
      ? `${timeLabel(row.startAt)} – ${timeLabel(row.endAt)}`
      : timeLabel(row.startAt);
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-foreground">
            {dayLabel
              ? (row.customerName ?? row.planName ?? "Booking")
              // What was booked, then what it is on, then who — so the title
              // never repeats the line under it.
              : (row.planName ?? row.resourceName ?? row.customerName ?? "Booking")}
          </p>
          <StatusPill status={row.status} />
          <SaleOriginBadge source={row.meta?.source} paymentReference={row.meta?.payment_reference} />
        </div>
        {/* The line under the title never repeats it: grouped by day the title
            is what was booked and this is who booked it; grouped by calendar
            the title is the customer and this is when. */}
        <p className="truncate text-xs text-muted-foreground">
          {dayLabel ? `${dayLabel} · ${timeRange}` : `${row.customerName ?? "—"} · ${timeRange}`}
        </p>
        {/* Its own line and a real tel:/WhatsApp link — the number used to be
            appended as grey text after the time range, where it was both hard
            to spot and impossible to tap. */}
        {phone && <CustomerPhone phone={phone} />}
        {location && (
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">Location:</span> {location}
          </p>
        )}
        {access && (
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">Access:</span> {access}
          </p>
        )}
        {notes && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">Notes:</span> {notes}
          </p>
        )}
        {cleaner && (
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">For cleaner:</span> {cleaner}
          </p>
        )}
      </div>
      {row.priceCents != null && (
        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
          {formatUSD(row.priceCents)}
        </span>
      )}
      {(actions.length > 0 || canApprovePayment || canReschedule) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="iconSm" variant="ghost" aria-label="Row actions" disabled={pending}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canApprovePayment && (
              <DropdownMenuItem onSelect={() => onApprovePayment?.()}>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Mark as paid
              </DropdownMenuItem>
            )}
            {canReschedule && (
              <DropdownMenuItem onSelect={() => onReschedule?.()}>
                <CalendarClock className="h-4 w-4" /> Reschedule
              </DropdownMenuItem>
            )}
            {(canApprovePayment || canReschedule) && actions.length > 0 && <DropdownMenuSeparator />}
            {actions.map((a, i) => (
              <div key={a.status}>
                {a.destructive && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onSelect={() => onSetStatus(a.status)}
                  className={cn(a.destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive")}
                >
                  <a.icon className="h-4 w-4" /> {a.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Row-action verbs are unified across all four services so the provider learns
// four verbs total, not four vocabularies:
//   Complete · Cancel · Pause · Resume.
// The status the transition writes to the underlying table is service-specific
// (cleaning: "completed"; rental: "completed" too; beach: "cancelled"; food:
// "paused"/"active"), but the label the provider sees is the same everywhere.
function rowActionsFor(row: UnifiedBookingRow): { status: string; label: string; icon: React.ComponentType<{ className?: string }>; destructive?: boolean }[] {
  const s = row.status.toLowerCase();
  if (row.sourceTable === "cleaning_bookings") {
    if (s === "booked") return [
      { status: "completed", label: "Complete", icon: CheckCircle2 },
      { status: "cancelled", label: "Cancel",   icon: XCircle, destructive: true },
    ];
    return [];
  }
  if (row.sourceTable === "bookings") {
    if (s !== "cancelled") return [
      { status: "cancelled", label: "Cancel", icon: XCircle, destructive: true },
    ];
    return [];
  }
  if (row.sourceTable === "food_subscriptions") {
    if (s === "active") return [{ status: "paused", label: "Pause",  icon: PauseCircle }];
    if (s === "paused") return [{ status: "active", label: "Resume", icon: PlayCircle }];
    return [];
  }
  return [];
}

// Map the row's source table to the ApproveService key our helper understands.
function approveServiceFor(sourceTable: UnifiedBookingRow["sourceTable"]): ApproveService | null {
  if (sourceTable === "cleaning_bookings") return null; // cleaning_bookings has no payment_status; the parent subscription does
  if (sourceTable === "food_subscriptions") return "food";
  if (sourceTable === "bookings") return null; // court bookings are pay-on-arrival — no payment_status column
  return null;
}

