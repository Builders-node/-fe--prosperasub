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
import { useUniversalIdForLegacy } from "@/lib/services/providerBridge";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { todayHN, formatDateHN } from "@/lib/timezone";
import {
  buildBookingSeries, droppedCount, dowOf, MAX_VISITS, type Cadence,
} from "@/lib/cleaning/bookingSeries";
import { cn } from "@/lib/utils";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { fetchAllRows } from "@/lib/supabasePaging";

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
  /** Package's cleanings_per_month — drives the auto-selected cadence. */
  per_month: number;
  /** Billing_period_months on the subscription — used to compute total span. */
  billing_months: number;
}

interface UserOption {
  id: string;
  label: string;
  email: string | null;
}

/**
 * Who the visit is for.
 *
 * An admin has to be able to book for anyone — a resident who paid off-platform,
 * a one-off favour, a trial. Requiring an existing paid subscription meant those
 * customers simply couldn't be scheduled, and the workaround was inventing a
 * subscription for them. `cleaning_bookings` only insists on a user OR a client
 * (`cleaning_bookings_has_owner`), so a subscription-less visit is legal.
 */
/** One bookable time on the chosen day, and how many places it has left. */
interface SlotWindow { start: string; end: string; left: number }

type Target =
  | { kind: "subscription"; sub: SubOption }
  | { kind: "user"; user: UserOption };

/**
 * Monday-first, matching every other calendar in the product. Values are
 * JS `getDay()` numbers so they can be compared without a lookup.
 */
const WEEKDAYS = [
  { dow: 1, short: "Mon" }, { dow: 2, short: "Tue" }, { dow: 3, short: "Wed" },
  { dow: 4, short: "Thu" }, { dow: 5, short: "Fri" }, { dow: 6, short: "Sat" },
  { dow: 0, short: "Sun" },
] as const;

const CADENCE_LABEL: Record<Cadence, string> = {
  once:     "Just this date",
  daily:    "Daily",
  weekly:   "Weekly",
  biweekly: "Every 2 weeks",
  monthly:  "Monthly",
};

/**
 * Pick the cadence that matches the plan's natural rhythm — so a
 * "cleanings_per_month × billing_months" total visit count spans exactly
 * the paid subscription period, not a random multiple of it.
 *
 *   ~26/month (daily plan) → daily,  count = per_month × months
 *   ~4/month              → weekly
 *   ~2/month              → biweekly
 *   ~1/month              → monthly
 */
function suggestCadenceFor(perMonth: number): Exclude<Cadence, "once"> {
  if (perMonth >= 12) return "daily";     // daily-ish plans (Cowork Daily = 26)
  if (perMonth >= 3)  return "weekly";
  if (perMonth === 2) return "biweekly";
  return "monthly";
}

export function NewCleaningBookingDialog({ providerId, trigger }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"subscription" | "user">("subscription");
  const [subId, setSubId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userSearch, setUserSearch] = useState<string>("");
  const [date, setDate] = useState<string>(todayHN());
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [notes, setNotes] = useState<string>("");
  const [cadence, setCadence] = useState<Cadence>("once");
  // Which days the cleaner should come. Empty = whatever day the anchor date
  // falls on, which is what "Weekly" used to mean and still does by default.
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [count, setCount] = useState<number>(1);

  // `providerId` here is the LEGACY cleaning_providers id — that is what the
  // workspace passes down and what cleaning_bookings.provider_id stores. Slots
  // reference the universal providers.id, so the booking has to be attached
  // through the bridge; without it a hand-added visit lands on the shared grid
  // and is counted against a schedule its own provider does not keep.
  const { data: universalProviderId } = useUniversalIdForLegacy("cleaning", providerId ?? null);

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
          ? fetchUsersByIds(userIds).then((m) => ({ data: [...m.values()] }))
          : Promise.resolve({ data: [] as any[] }),
        clientIds.length
          // contact_person, not contact_name — the latter doesn't exist, so this
          // query 400'd and every client-backed subscription fell back to the
          // literal word "Customer" in the picker.
          ? supabaseDb.from("cleaning_clients").select("id,company_name,contact_person").in("id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const userMap = new Map((usersRes.data ?? []).map((u: any) => [String(u.id), u]));
      const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [String(c.id), c]));

      return rows.map((r: any): SubOption => {
        const user = r.user_id ? userMap.get(String(r.user_id)) : null;
        const client = r.client_id ? clientMap.get(String(r.client_id)) : null;
        const customer =
          user?.display_name ?? user?.name ?? user?.email ??
          client?.contact_person ?? client?.company_name ?? "Customer";
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
          per_month: pkg?.per_month || 0,
          billing_months: Number(r.billing_period_months) || 1,
        };
      });
    },
  });

  // Every account, so an admin can book for someone who has no subscription —
  // paid off-platform, a trial, a one-off favour. Loaded only in that mode.
  const { data: users = [], isLoading: usersLoading } = useQuery<UserOption[]>({
    queryKey: ["admin-new-booking-users"],
    enabled: open && mode === "user",
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("users")
        .select("id,name,display_name,email")
        .order("display_name", { ascending: true, nullsFirst: false });
      return (data ?? []).map((u: any) => ({
        id: u.id,
        label: u.display_name || u.name || u.email || String(u.id).slice(0, 8),
        email: u.email ?? null,
      }));
    },
  });

  const visibleUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.label.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }, [users, userSearch]);

  /**
   * The time windows this provider actually runs.
   *
   * The dialog used to take any clock time and hand it to ensureCleaningSlot,
   * which seeds a slot for whatever was typed. A visit booked at 09:00 against
   * an 08:00/10:00/13:00 grid therefore invented a slot of its own: it counted
   * against nothing, the day's capacity stopped meaning anything, and the
   * calendar filled with times no cleaner's shift matches. Offering the grid
   * instead is what keeps a hand-added visit inside the same schedule
   * everything else is booked against.
   */
  //
  // Scoped to THIS provider and THE CHOSEN DATE. It used to read every active
  // future slot of every provider (~1,700 rows, half a year of three grids) and
  // PostgREST silently cut that at 1,000 — of Apartment Cleaning's 468 rows
  // exactly one survived, so the list offered a single time ("10:00 – 11:45")
  // out of three, and on another day it could hand back the shared grid's
  // 14:00 that this provider does not run. It also ignored the date: a Sunday,
  // when no slot exists, still listed times. One day of one provider is at
  // most a handful of rows, so there is nothing left to truncate.
  /**
   * Does this provider keep a grid of its own at all? Decides two things the
   * per-day read cannot: whether an empty day means "not a working day" (it
   * does keep one) or "no grid yet" (it does not), and whether falling back to
   * the shared grid is allowed — a provider with its own grid must never be
   * offered the shared one's times just because the chosen day is empty.
   */
  const { data: providerKeepsGrid = false, isLoading: gridCheckLoading } = useQuery<boolean>({
    queryKey: ["admin-new-booking-has-grid", universalProviderId ?? "shared"],
    enabled: open && !!universalProviderId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_available_slots")
        .select("id")
        .eq("provider_id", universalProviderId)
        .eq("is_active", true)
        .gte("date", todayHN())
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  const { data: slotWindows = [], isLoading: windowsLoading } = useQuery<SlotWindow[]>({
    queryKey: ["admin-new-booking-slot-windows", universalProviderId ?? "shared", date, providerKeepsGrid],
    // Wait for the grid check: before it answers, an empty day would fall
    // through to the shared grid and offer times this provider does not run.
    enabled: open && !!date && !gridCheckLoading,
    queryFn: async () => {
      const read = (own: boolean) => {
        let q = supabaseDb
          .from("cleaning_available_slots")
          .select("start_time,end_time,max_bookings,current_bookings")
          .eq("date", date)
          .eq("is_active", true)
          .order("start_time");
        q = own ? q.eq("provider_id", universalProviderId) : q.is("provider_id", null);
        return q;
      };
      // Same rule as the booking page: the provider's own grid when it keeps
      // one, the shared grid otherwise. Mixing them books against a schedule
      // this provider does not run.
      let rows: any[] = [];
      if (universalProviderId) {
        const { data, error } = await read(true);
        if (error) throw error;
        rows = data ?? [];
      }
      if (!rows.length && !providerKeepsGrid) {
        const { data, error } = await read(false);
        if (error) throw error;
        rows = data ?? [];
      }

      const hhmm = (t: string) => String(t ?? "").slice(0, 5);
      const seen = new Map<string, SlotWindow>();
      for (const r of rows) {
        const start = hhmm(r.start_time);
        const end = hhmm(r.end_time);
        if (!start) continue;
        const key = `${start}-${end}`;
        const left = Math.max(0, (Number(r.max_bookings) || 0) - (Number(r.current_bookings) || 0));
        const prev = seen.get(key);
        seen.set(key, { start, end, left: (prev?.left ?? 0) + left });
      }
      return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
    },
  });

  /** No grid at all — fall back to typing a time rather than blocking the admin. */
  const noGrid = !windowsLoading && !gridCheckLoading && slotWindows.length === 0 && !providerKeepsGrid;
  /** The provider has a grid, just not on this day (a Sunday, a day off). */
  const dayOff = !windowsLoading && !gridCheckLoading && slotWindows.length === 0 && providerKeepsGrid;

  // Snap to a real window as soon as the grid is known.
  useEffect(() => {
    if (!slotWindows.length) return;
    const match = slotWindows.some((w) => w.start === startTime);
    if (!match) {
      setStartTime(slotWindows[0].start);
      setEndTime(slotWindows[0].end);
    }
  }, [slotWindows]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSub = useMemo(() => subs.find((s) => s.id === subId) ?? null, [subs, subId]);
  const selectedUser = useMemo(() => users.find((u) => u.id === userId) ?? null, [users, userId]);

  /** Who this visit is for, whichever way the admin chose to say it. */
  const target: Target | null = useMemo(() => {
    if (mode === "subscription") return selectedSub ? { kind: "subscription", sub: selectedSub } : null;
    return selectedUser ? { kind: "user", user: selectedUser } : null;
  }, [mode, selectedSub, selectedUser]);

  // Auto-fill notes from the subscription's apartment_note on selection so the
  // admin doesn't have to retype every visit.
  useEffect(() => {
    if (selectedSub?.apartment_note && !notes) setNotes(selectedSub.apartment_note);
  }, [selectedSub, notes]);

  // When the admin picks a subscription, auto-select the cadence that MATCHES
  // that plan's natural rhythm (daily plan → daily; 4x/month → weekly; …).
  // Before this, cadence stayed as whatever the admin last clicked, so a Daily
  // plan with the default "weekly × 26 visits" spanned ~6 months instead of
  // the intended 1-month subscription period.
  useEffect(() => {
    if (!selectedSub) return;
    if (cadence === "once") { setCount(1); return; }
    const natural = suggestCadenceFor(selectedSub.per_month);
    if (cadence !== natural) setCadence(natural);
    setCount(selectedSub.suggested_count);
  }, [selectedSub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual cadence flips still reset count sensibly (Once → 1, everything else
  // → total visits for the subscription's paid period).
  useEffect(() => {
    if (cadence === "once") setCount(1);
    else if (selectedSub) setCount(selectedSub.suggested_count);
  }, [cadence, selectedSub]);

  /** Weekday choice only means something for the two weekly cadences. */
  const weekdaysApply = cadence === "weekly" || cadence === "biweekly";

  /**
   * Every date the chosen time actually exists on, across the seeded grid.
   *
   * The dialog checked only the first date; a repeat then walked through
   * Sundays and days off, and ensureCleaningSlot seeded a slot on each — a
   * visit on a day the provider does not work, counted against nothing. The
   * series now keeps to the days this time is really run.
   */
  const { data: grid } = useQuery<{ dates: Set<string>; weekdays: Set<number>; last: string | null }>({
    queryKey: ["admin-new-booking-working-dates", universalProviderId ?? "shared", providerKeepsGrid, startTime],
    enabled: open && !!startTime && !gridCheckLoading && !noGrid,
    queryFn: async () => {
      const rows = await fetchAllRows<{ date: string }>(() => {
        let q = supabaseDb
          .from("cleaning_available_slots")
          .select("date")
          .eq("is_active", true)
          .gte("date", todayHN())
          .like("start_time", `${startTime}%`)
          .order("date");
        q = providerKeepsGrid && universalProviderId ? q.eq("provider_id", universalProviderId) : q.is("provider_id", null);
        return q;
      }, { maxRows: 5_000 });
      const dates = new Set(rows.map((r) => String(r.date).slice(0, 10)));
      const sorted = [...dates].sort();
      return {
        dates,
        weekdays: new Set(sorted.map(dowOf)),
        last: sorted.length ? sorted[sorted.length - 1] : null,
      };
    },
  });

  /**
   * Is the chosen time run on `d`? Inside the seeded grid the grid answers.
   * Past its end (it is seeded ahead a day at a time) the weekday pattern
   * answers — a provider off on Sundays will still be off on Sundays. With no
   * grid loaded yet, or none at all, nothing is refused.
   */
  const isWorkingDay = useMemo(() => (d: string) => {
    if (!grid || !grid.dates.size) return true;
    if (grid.last && d <= grid.last) return grid.dates.has(d);
    return grid.weekdays.has(dowOf(d));
  }, [grid]);

  // Which dates this actually books. The arithmetic lives in
  // `lib/cleaning/bookingSeries` with a spec: an admin asked for four visits,
  // got four thirty days apart, and read it as "only one was added" because
  // the first was the only one in the list's window.
  const seriesInput = useMemo(() => ({
    anchor: date, cadence, count,
    weekdays: weekdaysApply ? weekdays : [],
    isWorkingDay,
  }), [date, cadence, count, weekdays, weekdaysApply, isWorkingDay]);

  const dates = useMemo(() => buildBookingSeries(seriesInput), [seriesInput]);

  /** Visits the series had to drop because no working day was left in their window. */
  const droppedVisits = droppedCount(seriesInput);

  /**
   * How many different months the series touches. The Bookings list shows the
   * near term, so a series that leaves this month is one the admin has to be
   * told about in words.
   */
  const spansMonths = useMemo(
    () => new Set(dates.map((d) => d.slice(0, 7))).size,
    [dates],
  );

  /** Short, readable date for the preview — "Tue 13 Oct". */
  const dayLabel = (d: string) =>
    `${WEEKDAYS.find((w) => w.dow === dowOf(d))?.short ?? ""} ${formatDateHN(d, { day: "numeric", month: "short" })}`;

  const create = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error(mode === "user" ? "Pick a customer" : "Pick a subscription");
      if (!date) throw new Error("Pick a date");
      if (!startTime) throw new Error("Pick a start time");
      if (!dates.length) throw new Error("No dates to book");

      // Loop sequentially — ensureCleaningSlot may seed a new slot per date, and
      // running these in parallel could double-seed for the same day+time.
      //
      // A date that fails no longer aborts the run. It used to throw, which
      // kept every booking made before it, told the admin nothing about which
      // ones those were, left the lists un-refreshed, and double-booked them
      // all on the retry. Each date now stands on its own and the run reports
      // what happened to all of them.
      const createdIds: string[] = [];
      const failed: Array<{ date: string; reason: string }> = [];
      let skipped = 0;

      const owner = target.kind === "subscription"
        ? {
            // A visit booked straight for a user has no subscription behind it.
            // The table only requires a user OR a client
            // (cleaning_bookings_has_owner), so that's a legal row — it just
            // doesn't draw down anyone's remaining cleanings, because there is
            // no balance to draw from.
            user_id: target.sub.user_id, client_id: target.sub.client_id,
            cleaning_subscription_id: target.sub.id, subscription_id: target.sub.id,
          }
        : {
            user_id: target.user.id, client_id: null,
            cleaning_subscription_id: null, subscription_id: null,
          };

      for (const d of dates) {
        try {
          const slot = await ensureCleaningSlot(d, startTime, endTime || startTime, universalProviderId ?? null);

          // Already booked? Say so and move on. This is what makes a retry
          // after a partial failure safe, and it also stops a double-click
          // from booking the same customer onto the same hour twice.
          let dup = supabaseDb
            .from("cleaning_bookings")
            .select("id")
            .eq("slot_id", slot.id)
            .neq("status", "cancelled")
            .limit(1);
          dup = owner.user_id ? dup.eq("user_id", owner.user_id) : dup.eq("client_id", owner.client_id);
          const { data: existing, error: dupErr } = await dup;
          // A failed lookup must not be read as "no booking yet" — that is how
          // a duplicate gets written. Refuse the date instead.
          if (dupErr) throw new Error(dupErr.message);
          if (existing?.length) { skipped += 1; continue; }

          const { data: bRow, error: bErr } = await supabaseDb.from("cleaning_bookings").insert({
            ...owner,
            // Stamped directly. Without it a subscription-less visit belongs to
            // nobody — the provider's Bookings list finds rows by walking
            // booking → subscription → package → provider, and that walk has no
            // starting point here.
            provider_id: providerId,
            slot_id: slot.id,
            status: "booked",
            reservation_type: "booking_reserved",
            source: cadence === "once" ? "admin_manual" : "admin_bulk",
            notes: notes.trim() || null,
            google_calendar_sync_status: "pending",
          }).select("id").single();
          if (bErr) throw new Error(bErr.message);

          // Bump slot capacity so a hand-added booking counts toward the day's cap.
          await supabaseDb.from("cleaning_available_slots")
            .update({
              current_bookings: (Number(slot.current_bookings) || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", slot.id);
          if (bRow?.id) createdIds.push(bRow.id);
        } catch (e: any) {
          failed.push({ date: d, reason: e?.message || "unknown error" });
        }
      }
      const created = createdIds.length;

      // Push all new bookings to Google Calendar — fire-and-forget in parallel
      // so the mutation returns fast even for large bulk runs.
      await Promise.allSettled(
        createdIds.map((id) =>
          adminApi(`/admin/cleaning/bookings/${id}/sync-calendar`, { method: "POST" })
        ),
      );

      if (userData?.id) {
        await logAuditEvent(userData.id, "create", "booking", createdIds[0] ?? null, {
          ...(target.kind === "subscription"
            ? { subscription_id: target.sub.id }
            : { booked_for_user: target.user.id, without_subscription: true }),
          dates, start_time: startTime, end_time: endTime,
          count: created, cadence,
          ...(skipped ? { already_booked: skipped } : {}),
          ...(failed.length ? { failed } : {}),
          ...(weekdaysApply && weekdays.length ? { weekdays } : {}),
        });
      }
      return { created, skipped, failed, asked: dates.length };
    },
    onSuccess: ({ created, skipped, failed, asked }) => {
      // Whatever happened, the lists have to catch up: the old version threw
      // on the first bad date and left the screen showing a stale schedule
      // that was already missing bookings it had just made.
      qc.invalidateQueries({ queryKey: ["unified-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-cleaning-bookings"] });
      qc.invalidateQueries({ queryKey: ["provider-analytics"] });

      const note = [
        created ? `${created} of ${asked} booked` : null,
        skipped ? `${skipped} already booked` : null,
      ].filter(Boolean).join(" · ");

      if (failed.length) {
        // Named dates, so the admin knows exactly what to try again — and the
        // dialog stays open with the series intact to do it with. Re-running
        // skips what already exists instead of doubling it.
        toast.error(
          `${note || "Nothing booked"}. Failed: ${failed.map((f) => f.date).join(", ")} — ${failed[0].reason}`,
          { duration: 10_000 },
        );
        return;
      }
      // Name the span. The Bookings list is a single week, so a monthly series
      // shows one row out of four and reads as "it only added one" — which is
      // exactly how this was reported. The confirmation has to say where the
      // rest went.
      toast.success(
        asked > 1 ? note : "Booking created",
        asked > 1
          ? {
              description: `${dayLabel(dates[0])} → ${dayLabel(dates[dates.length - 1])}`
                + (spansMonths > 1
                  ? ` · across ${spansMonths} months. The list shows one week at a time.`
                  : ""),
              duration: spansMonths > 1 ? 10_000 : 5_000,
            }
          : undefined,
      );
      resetAndClose();
    },
    onError: (e: Error) => toast.error(e.message || "Could not create booking"),
  });

  const resetAndClose = () => {
    setOpen(false);
    setMode("subscription");
    setSubId("");
    setUserId("");
    setUserSearch("");
    setWeekdays([]);
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" /> New cleaning booking
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Who the visit is for. Booking used to require an existing paid
                subscription, so a customer who paid off-platform or is being
                given a trial couldn't be scheduled at all. */}
            <div className="space-y-2">
              <Label>Book for *</Label>
              <div className="flex gap-1.5">
                {([
                  { key: "subscription", label: "Existing subscription" },
                  { key: "user", label: "Any customer" },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    // Dropping the other side's pick matters: `selectedSub`
                    // survived a switch to "Any customer" and went on driving
                    // the visit count and the "matches subscription period"
                    // note for a subscription that was no longer the target.
                    onClick={() => {
                      if (m.key === mode) return;
                      setMode(m.key);
                      if (m.key === "user") setSubId(""); else { setUserId(""); setUserSearch(""); }
                    }}
                    className={cn(
                      "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      mode === m.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === "subscription" ? (
                <Select value={subId} onValueChange={setSubId}>
                  <SelectTrigger>
                    <SelectValue placeholder={subsLoading ? "Loading…" : "Pick a subscription"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subs.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {subsLoading ? "Loading subscriptions…" : "Nothing to pick — see below."}
                      </div>
                    )}
                    {subs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.customer_name} · {s.package_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {/* Said on the page, not only inside the dropdown. An admin
                  facing an empty list had to open it to find out why, and the
                  way forward — book for anyone — is the tab next to it. */}
              {mode === "subscription" && !subsLoading && subs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No paid subscriptions for this provider yet. Use{" "}
                  <button
                    type="button"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                    onClick={() => { setMode("user"); setSubId(""); }}
                  >
                    Any customer
                  </button>{" "}
                  to book a visit anyway.
                </p>
              ) : null}
              {mode === "user" ? (
                <>
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder={usersLoading ? "Loading…" : "Pick a customer"} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Search lives inside the list so it filters what's on
                          screen without the dialog growing a second field. */}
                      <div className="px-2 pb-1 pt-2">
                        <Input
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Search by name or email…"
                          className="h-8"
                        />
                      </div>
                      {visibleUsers.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          {usersLoading ? "Loading customers…" : "No customer matches that search."}
                        </div>
                      )}
                      {visibleUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.label}{u.email && u.email !== u.label ? ` · ${u.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    No subscription is attached, so this visit doesn't draw down anyone's
                    remaining cleanings. Use it for off-platform or complimentary visits.
                  </p>
                </>
              ) : null}
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

            {noGrid ? (
              // Nothing seeded yet. Typing a time is worse than picking one, but
              // it beats an admin who cannot book at all; the slot grid is
              // seeded daily and by the Cleaning workspace.
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start time *</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <Label>End time</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
                <p className="col-span-2 text-xs text-amber-500">
                  This provider has no slot grid yet, so the visit will create its own time. Seed the
                  slots to keep bookings on one schedule.
                </p>
              </div>
            ) : dayOff ? (
              <div>
                <Label>Time slot *</Label>
                <p className="rounded-radius-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                  This provider doesn't work on {WEEKDAYS.find((d) => d.dow === dowOf(date))?.short ?? "this day"}s
                  — no slots on {date}. Pick another date.
                </p>
              </div>
            ) : (
              <div>
                <Label>Time slot *</Label>
                <Select
                  value={startTime}
                  onValueChange={(v) => {
                    const w = slotWindows.find((x) => x.start === v);
                    if (!w) return;
                    setStartTime(w.start);
                    setEndTime(w.end);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={windowsLoading ? "Loading slots…" : "Pick a time slot"} />
                  </SelectTrigger>
                  <SelectContent>
                    {slotWindows.map((w) => (
                      <SelectItem key={`${w.start}-${w.end}`} value={w.start}>
                        {w.start}{w.end ? ` – ${w.end}` : ""}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {/* Still selectable when full: squeezing one more
                              visit in is what this dialog is for. */}
                          {w.left > 0 ? `${w.left} left` : "full"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only the times this provider actually runs — so the visit counts against the
                  right slot instead of inventing one.
                </p>
              </div>
            )}

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
            <div className="space-y-2 rounded-radius-md bg-muted/30 p-3">
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
              {/* Which days the cleaner should come. "Weekly" alone could only
                  mean "the same weekday as the start date"; a customer who wants
                  Mon + Thu had to be booked twice, once per day. */}
              {weekdaysApply && (
                <div className="mt-2 space-y-1.5">
                  <Label className="text-xs">Days of the week</Label>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((d) => {
                      const on = weekdays.includes(d.dow);
                      // A day the provider never runs this time cannot be picked.
                      const off = !!grid?.weekdays.size && !grid.weekdays.has(d.dow);
                      return (
                        <button
                          key={d.dow}
                          type="button"
                          disabled={off && !on}
                          title={off ? "The provider doesn't run this time on this day" : undefined}
                          onClick={() => setWeekdays((prev) =>
                            prev.includes(d.dow) ? prev.filter((x) => x !== d.dow) : [...prev, d.dow])}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                            on ? "bg-primary text-primary-foreground"
                               : "bg-card text-muted-foreground hover:text-foreground",
                            off && !on && "pointer-events-none opacity-40 line-through",
                          )}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {weekdays.length === 0
                      ? `No day picked — repeats on ${WEEKDAYS.find((d) => d.dow === dowOf(date))?.short ?? "the start day"}, the start date's own day.`
                      : `Visits land only on the days above, starting ${date}.`}
                  </p>
                </div>
              )}
              {cadence !== "once" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs shrink-0">Number of visits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_VISITS}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(MAX_VISITS, parseInt(e.target.value || "1", 10))))}
                    className="h-8 w-20"
                  />
                  {!!selectedSub && count === selectedSub.suggested_count
                    && weekdays.length === 0
                    && cadence === suggestCadenceFor(selectedSub.per_month) && (
                    // Only truthful when BOTH the count is the suggested total
                    // AND the cadence matches the plan's rhythm — otherwise the
                    // series spans more (or less) than the paid window.
                    <span className="text-xs text-muted-foreground">(matches subscription period)</span>
                  )}
                </div>
              )}

              {/* What this will actually create.
                  Four visits a month apart were reported as "it only added
                  one": they were all there, three of them months away, and the
                  dialog said so in one line of grey 12px type. Every date, in
                  full, before the button is pressed. */}
              {cadence !== "once" && dates.length > 0 && (
                <div className="mt-2 space-y-1.5 rounded-radius-md bg-card p-2.5">
                  <p className="text-xs font-semibold">
                    {dates.length} visit{dates.length === 1 ? "" : "s"}, {dayLabel(dates[0])}
                    {dates.length > 1 ? ` → ${dayLabel(dates[dates.length - 1])}` : ""}
                    {spansMonths > 1 && (
                      <span className="font-normal text-muted-foreground"> · across {spansMonths} months</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dates.map((d) => (
                      <span
                        key={d}
                        className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                      >
                        {dayLabel(d)}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    All at {startTime}{endTime ? `–${endTime}` : ""}.
                    {spansMonths > 1 && " Only the nearest ones show in this month's list."}
                  </p>
                </div>
              )}

              {cadence !== "once" && grid?.dates.size ? (
                <p className="text-xs text-muted-foreground">
                  Days the provider doesn't run {startTime} are skipped
                  {cadence === "daily" || weekdays.length ? "" : " — a visit that lands on one moves to the next working day"}.
                  {droppedVisits > 0 && (
                    <span className="text-amber-500"> {droppedVisits} visit{droppedVisits === 1 ? "" : "s"} had no working day left and won't be booked.</span>
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              // `target`, not `subId` — booking for a bare customer never sets
              // a subscription id, so the old check left the button dead.
              disabled={!target || !date || !startTime || !dates.length || dayOff || create.isPending}
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
