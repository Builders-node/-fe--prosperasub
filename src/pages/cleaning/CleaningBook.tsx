import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isBefore, parseISO } from "date-fns";
import { todayHN } from "@/lib/timezone";
import { CalendarDays, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { UserLayout } from "@/components/layout/UserLayout";
import { CheckoutStickyFooter } from "@/components/patterns/CheckoutStickyFooter";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { cn } from "@/lib/utils";
import { resolvePlanBookingSettings } from "@/lib/booking/resolvePlanSettings";
import { blockAppliesOn, mondayFirstIndex, to12h, toMinutes } from "@/lib/booking/bookingSettings";
import { DayStrip, TimeSlotPicker, WEEKDAYS } from "@/components/booking/TimePickers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayKey = () => todayHN();
const toDate   = (value: string) => parseISO(`${value}T00:00:00`);
const normalizeTime = (value: string) => (value.length === 5 ? `${value}:00` : value);
const timeLabel     = (start: string, end: string) => `${to12h(start)} – ${to12h(end)}`;

const getScheduleDates = (startDate: string, endDate: string, weekday: number) => {
  const start = toDate(startDate);
  const end   = toDate(endDate);
  const dates: string[] = [];
  let cursor = start;
  while (!isBefore(end, cursor)) {
    if (cursor.getDay() === weekday) dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return dates;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const CleaningBook = () => {
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const [searchParams] = useSearchParams();
  const requestedSubscriptionId = searchParams.get("subscriptionId");

  // ── State (unchanged) ──────────────────────────────────────────────────────
  const [selectedSubId,  setSelectedSubId]  = useState("");
  const [selectedDay,    setSelectedDay]    = useState<number>(1);
  const [selectedTime,   setSelectedTime]   = useState("");
  const [notes,          setNotes]          = useState("");
  const [notesError,     setNotesError]     = useState("");
  const { userData, isAuthenticated } = useAuth();
  const userUuid = useUserUuid();

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ["my-cleaning-subscriptions-schedule", userUuid],
    queryFn: async () => {
      if (!userUuid) return [];
      const { data: subs, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("*")
        .eq("user_id", userUuid)
        .eq("payment_status", "paid")
        .in("subscription_status", ["pending_schedule", "active"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!subs?.length) return [];

      const pkgIds = [...new Set(subs.map((s: any) => s.package_id).filter(Boolean))];
      // `booking_settings` (nullable JSONB) is the per-plan calendar override.
      // NULL = inherit provider calendar; when set, we filter slots below so
      // the user only sees times allowed by this specific plan.
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages")
        .select("id, name, cleanings_per_month, frequency_unit, frequency_count, custom_frequency_label, booking_settings, provider_id")
        .in("id", pkgIds);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p]));

      return subs.map((s: any) => ({
        ...s,
        cleaning_packages: pkgMap.get(s.package_id) || null,
      }));
    },
    enabled: isAuthenticated && !!userUuid,
  });

  // Fetch the parent provider's booking calendar so plans without an override
  // fall through to the provider-level schedule when we filter slots below.
  // Keyed on the SELECTED package's provider_id — the old query grabbed
  // "first active cleaning provider" and applied its schedule to every plan,
  // so owner-set minNotice/maxAdvance only worked by luck.
  //
  // Declared BEFORE the slot query, which keys off the universal id: a `const`
  // read during render before its declaration is a TDZ crash, not a warning.
  const selectedPackage = subscriptions?.find((s: any) => s.id === selectedSubId)?.cleaning_packages;
  const packageProviderId: string | null = selectedPackage?.provider_id ?? null;
  const { data: providerRow } = useQuery({
    queryKey: ["cleaning-provider-booking-settings", packageProviderId ?? "none"],
    enabled: !!packageProviderId,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers")
        // `id` is the UNIVERSAL providers.id the slot rows point at; the
        // package carries the LEGACY id. Confusing the two is the id-space
        // split CLAUDE.md calls the top source of bugs here.
        .select("id, booking_settings")
        .eq("source_service_key", "cleaning")
        .eq("source_provider_id", packageProviderId!)
        .maybeSingle();
      return data ?? null;
    },
  });
  const providerSettings = (providerRow as { booking_settings?: unknown } | null)?.booking_settings ?? null;
  const universalProviderId = (providerRow as { id?: string } | null)?.id ?? null;

  /**
   * Slots for THIS provider, falling back to the shared grid.
   *
   * The grid used to be global: one set of rows for every cleaning provider,
   * with the four times hard-coded inside seed_cleaning_slots. Car Wash is
   * configured for 60-minute sessions and was still offered 8:00–9:45, because
   * booking_settings only ever acted as a filter below — able to hide a slot
   * outside opening hours, never to change its length.
   *
   * A provider that has its own slots uses only those. One that has none keeps
   * the shared rows exactly as before, so nothing changes for it until an admin
   * seeds it.
   */
  const { data: rawSlots, isLoading: slotsLoading } = useQuery({
    queryKey: ["cleaning-slots-schedule", universalProviderId ?? "shared"],
    queryFn: async () => {
      // supabaseDb, not the wrapper: OwnedQueryBuilder has no `.is()`, so the
      // NULL check for the shared grid cannot be expressed through it. The file
      // already reads its other service tables this way.
      //
      // Row count stays under PostgREST's 1000-row cap because the filter is
      // server-side and per provider: 180 days at 3–4 slots a day is ~700.
      const base = () => supabaseDb
        .from("cleaning_available_slots")
        .select("*")
        .gte("date", todayKey())
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      if (universalProviderId) {
        const { data, error } = await base().eq("provider_id", universalProviderId);
        if (error) throw error;
        if ((data ?? []).length > 0) return data!;
      }
      // No provider-specific grid — the shared rows are still the schedule.
      const { data, error } = await base().is("provider_id", null);
      if (error) throw error;
      return data || [];
    },
  });

  // Apply the effective plan/provider calendar as a *filter* on top of the
  // pre-seeded `cleaning_available_slots` rows. Slots remain the source of
  // truth for capacity — we just hide any that fall on a closed weekday,
  // outside the plan's working window, inside the min-notice cutoff, or
  // beyond the max-advance horizon.
  const slots = useMemo(() => {
    if (!rawSlots) return rawSlots;
    const plan = subscriptions?.find((s: any) => s.id === selectedSubId)?.cleaning_packages;
    if (!plan && !providerSettings) return rawSlots;
    const settings = resolvePlanBookingSettings(plan, { booking_settings: providerSettings });

    // Temporal cutoffs — always evaluated in Honduras time to match slot rows.
    const now = todayHN() as unknown as Date; // nowHN not exported here; use current Date semantics for cutoffs
    const currentMs = Date.now();
    const noticeCutoffMs = currentMs + settings.minNoticeHours * 3600_000;
    void now;

    /**
     * maxAdvanceDays limits how far ahead a customer may START a booking. A
     * recurring schedule inside a period they have ALREADY PAID FOR is not
     * that, so the horizon has to reach at least the end of it.
     *
     * Without this the page was unusable for anyone whose plan outran the
     * horizon. availableTimeOptions offers a time only if a free slot exists on
     * EVERY date of the period; the default horizon is 30 days, so a two-month
     * car-wash plan had its last three dates filtered away and not one time was
     * offered — on any weekday. The screen said "A conflict exists in your
     * period. Choose a different weekday", which could never help, and a
     * customer who had paid on 3 August was still unable to book nine days
     * later. There was no conflict; the slots were there, all free.
     */
    const sub = subscriptions?.find((s: any) => s.id === selectedSubId);
    const paidUntil = sub?.paid_until || sub?.service_end_date || sub?.end_date || null;
    const paidUntilMs = paidUntil ? Date.parse(`${paidUntil}T23:59:59`) : Number.NaN;
    const advanceCutoffMs = Math.max(
      currentMs + settings.maxAdvanceDays * 86400_000,
      Number.isNaN(paidUntilMs) ? 0 : paidUntilMs,
    );

    return rawSlots.filter((slot: any) => {
      // Full-day block? Hide.
      if (settings.blockedDates.includes(slot.date)) return false;
      const [y, m, d] = String(slot.date).split("-").map(Number);
      const day = settings.weekly[mondayFirstIndex(new Date(y, (m ?? 1) - 1, d ?? 1).getDay())];
      if (!day?.enabled) return false;
      const start = toMinutes(String(slot.start_time).slice(0, 5));
      const end = toMinutes(String(slot.end_time).slice(0, 5));
      const open = toMinutes(day.from);
      const close = toMinutes(day.to);
      if (Number.isNaN(start) || Number.isNaN(end)) return true; // keep on parse error
      if (start < open || end > close) return false;
      // Temporal cutoffs: minNoticeHours (can't book too soon) and
      // maxAdvanceDays (can't book too far ahead).
      const slotStartMs = new Date(`${slot.date}T${String(slot.start_time).slice(0, 5)}:00`).getTime();
      if (!Number.isNaN(slotStartMs)) {
        if (slotStartMs < noticeCutoffMs) return false;
        if (slotStartMs > advanceCutoffMs) return false;
      }
      // Time-range block?
      const blocked = settings.blockedRanges.some((r) => {
        if (!blockAppliesOn(r, slot.date)) return false;
        const bf = toMinutes(r.from);
        const bt = toMinutes(r.to);
        return !Number.isNaN(bf) && !Number.isNaN(bt) && start < bt && end > bf;
      });
      return !blocked;
    });
  }, [rawSlots, subscriptions, selectedSubId, providerSettings]);

  const { data: myBookings } = useQuery({
    queryKey: ["my-cleaning-bookings-schedule", selectedSubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("id, slot_id, subscription_id, status")
        .eq("subscription_id", selectedSubId)
        .eq("status", "booked");
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(selectedSubId),
  });

  // ── Derived data (unchanged logic) ────────────────────────────────────────
  const schedulableSubscriptions = useMemo(() => {
    const today = toDate(todayKey());
    return (subscriptions || []).filter((subscription) => {
      const paidUntil = subscription.paid_until || subscription.service_end_date || subscription.end_date;
      return paidUntil && !isBefore(toDate(paidUntil), today);
    });
  }, [subscriptions]);

  const selectedSubscription = schedulableSubscriptions.find((s) => s.id === selectedSubId);

  const periodStart = useMemo(() => {
    if (!selectedSubscription) return todayKey();
    return (
      [selectedSubscription.service_start_date, selectedSubscription.start_date, todayKey()]
        .filter(Boolean)
        .sort()
        .find((d) => d >= todayKey()) || todayKey()
    );
  }, [selectedSubscription]);

  const periodEnd = selectedSubscription?.paid_until || selectedSubscription?.service_end_date || selectedSubscription?.end_date || todayKey();

  const scheduleDates = useMemo(
    () => (selectedSubscription ? getScheduleDates(periodStart, periodEnd, selectedDay) : []),
    [periodEnd, periodStart, selectedDay, selectedSubscription],
  );

  const existingBookingSlotIds = useMemo(
    () => new Set((myBookings || []).map((b) => b.slot_id)),
    [myBookings],
  );

  const availableTimeOptions = useMemo(() => {
    if (!slots?.length || !scheduleDates.length) return [];
    const byTime = new Map<string, { start: string; end: string }>();
    slots.forEach((slot) => {
      byTime.set(normalizeTime(slot.start_time), {
        start: normalizeTime(slot.start_time),
        end: normalizeTime(slot.end_time),
      });
    });
    return Array.from(byTime.values())
      .filter(({ start }) =>
        scheduleDates.every((date) => {
          const slot = slots.find((c) => c.date === date && normalizeTime(c.start_time) === start);
          if (!slot) return false;
          if (existingBookingSlotIds.has(slot.id)) return true;
          return slot.current_bookings < slot.max_bookings;
        }),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [existingBookingSlotIds, scheduleDates, slots]);

  // ── NEW: per-weekday occurrence counts for the day strip ──────────────────
  const weekdayOccurrences = useMemo(() => {
    const result: Record<number, { nextDate: string; count: number }> = {};
    if (!selectedSubscription) return result;
    WEEKDAYS.forEach((day) => {
      const dates = getScheduleDates(periodStart, periodEnd, day.value);
      const upcoming = dates.filter((d) => d > todayKey());
      if (upcoming.length) {
        result[day.value] = { nextDate: upcoming[0], count: upcoming.length };
      }
    });
    return result;
  }, [selectedSubscription, periodStart, periodEnd]);

  // The picker groups these into morning / afternoon / evening itself.
  const timeChoices = useMemo(
    () => availableTimeOptions.map((s) => ({ start: s.start, label: timeLabel(s.start, s.end) })),
    [availableTimeOptions],
  );

  /**
   * Why no time is on offer, in the customer's terms.
   *
   * A time must be free on EVERY date of the paid period, so one bad date kills
   * every option — and the old copy blamed "a conflict" and told them to try
   * another weekday, which is useless when the reason is the same on all seven.
   * Naming the dates lets them pick a weekday that actually works, or tell
   * support something specific.
   */
  const blockedDates = useMemo(() => {
    if (!slots?.length || !scheduleDates.length || availableTimeOptions.length) return [];
    return scheduleDates.filter((date) => !slots.some((s: any) => s.date === date));
  }, [availableTimeOptions, scheduleDates, slots]);

  const nextCleaningDate   = scheduleDates.find((d) => d > todayKey()) || null;
  const selectedTimeOption = availableTimeOptions.find((o) => o.start === selectedTime);

  // ── Mutation (unchanged) ───────────────────────────────────────────────────
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const cleanedNotes = notes.trim();
      if (!cleanedNotes) throw new Error("Apartment / access notes are required");
      const { data, error } = await supabase.rpc("schedule_cleaning_subscription", {
        p_subscription_id: selectedSubId,
        p_day_of_week:     selectedDay,
        p_start_time:      selectedTime,
        p_notes:           cleanedNotes,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Weekly cleaning schedule confirmed.");
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-all"] });
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["cleaning-slots-schedule"] });
      navigate("/my-subscriptions?tab=cleaning");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not save this cleaning schedule");
    },
  });

  const handleConfirmSchedule = () => {
    if (!notes.trim()) {
      setNotesError("Apartment / access notes are required.");
      toast.error("Add your apartment number before confirming.");
      return;
    }
    setNotesError("");
    scheduleMutation.mutate();
  };

  // ── Effects (unchanged) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!schedulableSubscriptions.length || selectedSubId) return;
    const requested = requestedSubscriptionId
      ? schedulableSubscriptions.find((s) => s.id === requestedSubscriptionId)
      : null;
    setSelectedSubId((requested || schedulableSubscriptions[0]).id);
  }, [requestedSubscriptionId, schedulableSubscriptions, selectedSubId]);

  useEffect(() => {
    if (!selectedSubscription) return;
    if (typeof selectedSubscription.recurring_day_of_week === "number") {
      setSelectedDay(selectedSubscription.recurring_day_of_week);
    }
    if (selectedSubscription.recurring_time) {
      setSelectedTime(normalizeTime(selectedSubscription.recurring_time));
    } else {
      setSelectedTime("");
    }
  }, [selectedSubscription]);

  useEffect(() => {
    if (selectedTime && !availableTimeOptions.some((o) => o.start === selectedTime)) {
      setSelectedTime("");
    }
  }, [availableTimeOptions, selectedTime]);

  const isLoading  = subscriptionsLoading || slotsLoading;
  const canConfirm = Boolean(selectedSubId && selectedTime && scheduleDates.length > 0 && notes.trim());

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <UserLayout title="Schedule Cleaning" showBackButton backTo="/my-subscriptions" showBottomNav={false}>
      {/* Outer shell — pads for the measured bar rather than guessing at it. */}
      <div className="flex min-h-[calc(100dvh-60px)] flex-col bg-[hsl(var(--background))] pb-[calc(var(--checkout-footer-h,140px)+16px)]">

        {/* ── Loading state ── */}
        {isLoading && <PageLoader />}

        {/* ── No subscription state ── */}
        {!isLoading && !schedulableSubscriptions.length && (
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-radius-lg bg-card p-8 text-center ">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CalendarDays className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-foreground">No paid plan to schedule</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Pay for a cleaning plan first. Scheduling opens after payment is confirmed.
              </p>
              <Button
                onClick={() => navigate("/services/cleaning")}
                className="w-full bg-foreground text-background hover:bg-foreground/90"
              >
                View cleaning plans
              </Button>
            </div>
          </div>
        )}

        {/* ── Main booking UI ── */}
        {!isLoading && schedulableSubscriptions.length > 0 && (
          <div className="flex flex-1 flex-col pb-28">

            {/* ── Plan info banner ── */}
            <div className="border-b border-border bg-card px-4 py-4 sm:px-6">
              <div className="mx-auto max-w-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary/10">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {(selectedSubscription as any)?.cleaning_packages?.name || "Cleaning plan"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedSubscription
                          ? `Paid until ${format(toDate(periodEnd), "MMM d, yyyy")}`
                          : "Loading…"}
                      </p>
                    </div>
                  </div>
                  {schedulableSubscriptions.length > 1 && (
                    <Select value={selectedSubId} onValueChange={setSelectedSubId}>
           <SelectTrigger inputSize="sm" className="w-auto rounded-full border-border text-xs font-semibold">
                        <SelectValue placeholder="Choose plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {schedulableSubscriptions.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {(sub as any).cleaning_packages?.name || "Cleaning plan"} — {sub.billing_period_months || 1} mo
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            {/* ── Scrollable content area ── */}
            <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6 sm:px-6">

              {/* ── Day strip ── */}
              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Choose a weekday
                </h2>
                <DayStrip
                  selected={selectedDay}
                  onSelect={(day) => { setSelectedDay(day); setSelectedTime(""); }}
                  occurrences={weekdayOccurrences}
                />
                {scheduleDates.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {scheduleDates.length} session{scheduleDates.length !== 1 ? "s" : ""} in your paid period
                    {nextCleaningDate ? ` · Next: ${format(toDate(nextCleaningDate), "MMM d")}` : ""}
                  </p>
                )}
              </section>

              {/* ── Time slots ── */}
              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Choose a time
                </h2>

                {!scheduleDates.length ? (
                  <div className="rounded-radius-md border border-border bg-card p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">No dates in paid period</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try a different weekday.</p>
                  </div>
                ) : !timeChoices.length ? (
                  <div className="rounded-radius-md border border-border bg-card p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">No time works for every date</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {blockedDates.length > 0
                        ? `Nothing is published on ${blockedDates
                            .slice(0, 3)
                            .map((d) => format(toDate(d), "MMM d"))
                            .join(", ")}${blockedDates.length > 3 ? ` and ${blockedDates.length - 3} more` : ""}. Try another weekday, or contact us and we'll set it up for you.`
                        : "Every time is already full on at least one of your dates. Try another weekday, or contact us and we'll set it up for you."}
                    </p>
                    <Link to="/support" className="mt-3 inline-block text-xs font-semibold text-primary hover:opacity-80">
                      Contact support
                    </Link>
                  </div>
                ) : (
                  <TimeSlotPicker
                    options={timeChoices}
                    selected={selectedTime}
                    onSelect={setSelectedTime}
                  />
                )}
              </section>

              {/* ── Apartment notes ── */}
              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Access details
                </h2>
                <div className="rounded-radius-md border border-border bg-card p-4">
                  <Textarea
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      if (notesError && e.target.value.trim()) setNotesError("");
                    }}
                    placeholder="Apartment 1204, tower name, door code, or any entry notes…"
                    rows={3}
                    className="resize-none rounded-xl border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                  />
                  {notesError && (
                    <p className="mt-2 text-xs font-medium text-destructive">{notesError}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Required so the cleaning team knows exactly where to go.
                  </p>
                </div>
              </section>

              {/* ── Schedule summary (visible on larger screens / when selected) ── */}
              {selectedTimeOption && (
                <section className="rounded-radius-md border border-primary/20 bg-primary/5 p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary/70">
                    Your schedule
                  </p>
                  <div className="space-y-2">
                    {[
                      {
                        label: "Day",
                        value: WEEKDAYS.find((d) => d.value === selectedDay)?.label,
                      },
                      {
                        label: "Time",
                        value: timeLabel(selectedTimeOption.start, selectedTimeOption.end),
                      },
                      {
                        label: "Sessions",
                        value: `${scheduleDates.length} total`,
                      },
                      nextCleaningDate && {
                        label: "First cleaning",
                        value: format(toDate(nextCleaningDate), "EEEE, MMM d"),
                      },
                    ]
                      .filter(Boolean)
                      .map((row: any) => (
                        <div key={row.label} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{row.label}</span>
                          <span className="text-xs font-bold text-foreground">{row.value}</span>
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/*
          One bar, measured, for both widths — this page had two hand-rolled
          ones (a fixed md:hidden bar and a separate in-flow desktop bar) with
          the same two buttons written twice. CheckoutStickyFooter publishes
          its height so the page pads itself (PAGE_TYPES section 0).
        */}
        {!isLoading && schedulableSubscriptions.length > 0 && (
          <CheckoutStickyFooter>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-full md:flex-none md:px-8"
                onClick={() => navigate("/my-subscriptions")}
              >
                Cancel
              </Button>
              <Button
                className="h-12 flex-[2] gap-2 rounded-full md:ml-auto md:flex-none md:px-10"
                disabled={!canConfirm}
                loading={scheduleMutation.isPending}
                loadingText="Scheduling..."
                onClick={handleConfirmSchedule}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm schedule
              </Button>
            </div>
          </CheckoutStickyFooter>
        )}
      </div>
    </UserLayout>
  );
};

export default CleaningBook;
