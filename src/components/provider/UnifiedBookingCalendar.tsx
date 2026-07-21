import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, MoreHorizontal, CheckCircle2, XCircle, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabEmptyState, SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { cn } from "@/lib/utils";
import { supabaseDb } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUnifiedBookings, type UnifiedBookingRow } from "@/hooks/useUnifiedBookings";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment, type ApproveService } from "@/lib/subscriptionApprove";

interface Props {
  providerId: string;
  sourceKey: string;
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
export function UnifiedBookingCalendar({ providerId, sourceKey }: Props) {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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

  const statuses = useMemo(() => {
    const s = new Set<string>();
    bookings.forEach((b) => s.add(b.status));
    return Array.from(s).sort();
  }, [bookings]);

  const weekLabel = `${format(days[0], "MMM d")} — ${format(days[6], "MMM d")}`;

  return (
    <div className="space-y-3">
      {/* Nav bar */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-2">
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

      {/* Status filter chips */}
      {statuses.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
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
                  "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
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
              <section key={dayISO} className="rounded-2xl bg-card p-4">
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
                      pending={setStatus.isPending || approve.isPending}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Booking row ───────────────────────────────────────────────────────────
function BookingRow({
  row, onSetStatus, onApprovePayment, pending,
}: {
  row: UnifiedBookingRow;
  onSetStatus: (next: string) => void;
  onApprovePayment?: () => void;
  pending: boolean;
}) {
  const statusTone = statusColor(row.status);
  const actions = rowActionsFor(row);
  const canApprovePayment =
    !!onApprovePayment &&
    isPendingPayment({ payment_status: row.paymentStatus }) &&
    row.status.toLowerCase() !== "cancelled";
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
            {row.planName ?? row.customerName ?? "Booking"}
          </p>
          <Badge className={cn("rounded-full text-[10px] capitalize", statusTone)}>{row.status}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.customerName ?? "—"}{" · "}{timeRange}
          {phone && ` · ${phone}`}
        </p>
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
          ${(row.priceCents / 100).toFixed(2)}
        </span>
      )}
      {(actions.length > 0 || canApprovePayment) && (
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
            {canApprovePayment && actions.length > 0 && <DropdownMenuSeparator />}
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
  if (row.sourceTable === "beach_club_court_bookings") {
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
  if (row.sourceTable === "rental_bookings") {
    if (s === "pending" || s === "held") return [
      { status: "confirmed", label: "Confirm", icon: CheckCircle2 },
      { status: "cancelled", label: "Cancel",  icon: XCircle, destructive: true },
    ];
    if (s === "confirmed") return [
      { status: "completed", label: "Complete", icon: CheckCircle2 },
    ];
    return [];
  }
  return [];
}

// Map the row's source table to the ApproveService key our helper understands.
function approveServiceFor(sourceTable: UnifiedBookingRow["sourceTable"]): ApproveService | null {
  if (sourceTable === "cleaning_bookings") return null; // cleaning_bookings has no payment_status; the parent subscription does
  if (sourceTable === "food_subscriptions") return "food";
  if (sourceTable === "rental_bookings") return "cars";
  if (sourceTable === "beach_club_court_bookings") return null; // court bookings are pay-on-arrival — no payment_status column
  return null;
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (["active", "confirmed", "booked", "paid", "completed"].includes(s))
    return "bg-emerald-500/15 text-emerald-500";
  if (["pending", "held", "pending_payment"].includes(s))
    return "bg-amber-500/15 text-amber-500";
  if (["cancelled", "failed", "refunded", "expired"].includes(s))
    return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}
