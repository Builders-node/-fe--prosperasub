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
import { fetchUsersByIds } from "@/lib/admin/customerNames";

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
type Target =
  | { kind: "subscription"; sub: SubOption }
  | { kind: "user"; user: UserOption };

type Cadence = "once" | "daily" | "weekly" | "biweekly" | "monthly";

const CADENCE_DAYS: Record<Exclude<Cadence, "once">, number> = {
  daily:    1,
  weekly:   7,
  biweekly: 14,
  monthly:  30,
};

/**
 * Monday-first, matching every other calendar in the product. Values are
 * JS `getDay()` numbers so they can be compared without a lookup.
 */
const WEEKDAYS = [
  { dow: 1, short: "Mon" }, { dow: 2, short: "Tue" }, { dow: 3, short: "Wed" },
  { dow: 4, short: "Thu" }, { dow: 5, short: "Fri" }, { dow: 6, short: "Sat" },
  { dow: 0, short: "Sun" },
] as const;

/** Honduras-local weekday of a YYYY-MM-DD string, without a timezone shift. */
function dowOf(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

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

  // Build the list of dates to book — anchored on `date`, N entries total.
  // `once` = just the anchor.
  const dates = useMemo(() => {
    if (cadence === "once" || !date) return date ? [date] : [];
    const n = Math.max(1, Math.min(count, 60));

    // Specific days of the week: walk forward from the anchor and take every
    // day that matches, so "Mon + Thu, 8 visits" books four real weeks rather
    // than eight Mondays. A fixed +7 step could never express that.
    if (weekdaysApply && weekdays.length > 0) {
      const wanted = new Set(weekdays);
      // Every-2-weeks keeps only alternate weeks; weeks are counted from the
      // Monday of the anchor's week so the parity doesn't shift with the day
      // the admin happened to start on.
      const anchorMonday = (dowOf(date) + 6) % 7; // days since Monday
      const out: string[] = [];
      const horizon = 60 * (cadence === "biweekly" ? 14 : 7) + 14;
      for (let offset = 0; offset < horizon && out.length < n; offset += 1) {
        const d = offset === 0 ? date : addDaysISO(date, offset);
        if (!wanted.has(dowOf(d))) continue;
        if (cadence === "biweekly") {
          const weekIndex = Math.floor((offset + anchorMonday) / 7);
          if (weekIndex % 2 !== 0) continue;
        }
        out.push(d);
      }
      return out;
    }

    const step = CADENCE_DAYS[cadence];
    return Array.from({ length: n }, (_, i) => (i === 0 ? date : addDaysISO(date, i * step)));
  }, [cadence, count, date, weekdays, weekdaysApply]);

  const create = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error(mode === "user" ? "Pick a customer" : "Pick a subscription");
      if (!date) throw new Error("Pick a date");
      if (!startTime) throw new Error("Pick a start time");
      if (!dates.length) throw new Error("No dates to book");

      // Loop sequentially — ensureCleaningSlot may seed a new slot per date, and
      // running these in parallel could double-seed for the same day+time.
      let created = 0;
      const createdIds: string[] = [];
      for (const d of dates) {
        const slot = await ensureCleaningSlot(d, startTime, endTime || startTime);
        // A visit booked straight for a user has no subscription behind it. The
        // table only requires a user OR a client (cleaning_bookings_has_owner),
        // so that's a legal row — it just doesn't draw down anyone's remaining
        // cleanings, because there is no balance to draw from.
        const owner = target.kind === "subscription"
          ? {
              user_id: target.sub.user_id, client_id: target.sub.client_id,
              cleaning_subscription_id: target.sub.id, subscription_id: target.sub.id,
            }
          : {
              user_id: target.user.id, client_id: null,
              cleaning_subscription_id: null, subscription_id: null,
            };
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
          ...(target.kind === "subscription"
            ? { subscription_id: target.sub.id }
            : { booked_for_user: target.user.id, without_subscription: true }),
          dates, start_time: startTime, end_time: endTime,
          count: created, cadence,
          ...(weekdaysApply && weekdays.length ? { weekdays } : {}),
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
        <DialogContent className="max-w-md">
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
                    onClick={() => setMode(m.key)}
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
              ) : (
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
              )}
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
              {/* Which days the cleaner should come. "Weekly" alone could only
                  mean "the same weekday as the start date"; a customer who wants
                  Mon + Thu had to be booked twice, once per day. */}
              {weekdaysApply && (
                <div className="mt-2 space-y-1.5">
                  <Label className="text-xs">Days of the week</Label>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((d) => {
                      const on = weekdays.includes(d.dow);
                      return (
                        <button
                          key={d.dow}
                          type="button"
                          onClick={() => setWeekdays((prev) =>
                            prev.includes(d.dow) ? prev.filter((x) => x !== d.dow) : [...prev, d.dow])}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                            on ? "bg-primary text-primary-foreground"
                               : "bg-card text-muted-foreground hover:text-foreground",
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
                    max={60}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(60, parseInt(e.target.value || "1", 10))))}
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      // "matches subscription period" is only truthful when
                      // BOTH the count is the suggested total AND the cadence
                      // matches the plan's natural rhythm — otherwise we're
                      // spanning way more (or fewer) days than the paid window.
                      // No `cadence !== "once"` test: this whole block only
                      // renders when that's already true.
                      const isMatch =
                        !!selectedSub &&
                        count === selectedSub.suggested_count &&
                        weekdays.length === 0 &&
                        cadence === suggestCadenceFor(selectedSub.per_month);
                      return isMatch
                        ? "(matches subscription period)"
                        : `first ${dates[0]} → last ${dates[dates.length - 1]}`;
                    })()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              // `target`, not `subId` — booking for a bare customer never sets
              // a subscription id, so the old check left the button dead.
              disabled={!target || !date || !startTime || !dates.length || create.isPending}
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
