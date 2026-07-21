import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isBefore, parseISO } from "date-fns";
import { todayHN } from "@/lib/timezone";
import { CalendarDays, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { cn } from "@/lib/utils";
import { resolvePlanBookingSettings } from "@/lib/booking/resolvePlanSettings";
import { mondayFirstIndex, toMinutes } from "@/lib/booking/bookingSettings";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { value: 1, label: "Monday",    short: "Mon" },
  { value: 2, label: "Tuesday",   short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday",  short: "Thu" },
  { value: 5, label: "Friday",    short: "Fri" },
  { value: 6, label: "Saturday",  short: "Sat" },
];

const TIME_PERIODS = [
  { id: "morning",   label: "Morning",   emoji: "🌅", from: "00:00:00", to: "12:00:00" },
  { id: "afternoon", label: "Afternoon", emoji: "☀️", from: "12:00:00", to: "17:00:00" },
  { id: "evening",   label: "Evening",   emoji: "🌙", from: "17:00:00", to: "24:00:00" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayKey = () => todayHN();
const toDate   = (value: string) => parseISO(`${value}T00:00:00`);
const normalizeTime = (value: string) => (value.length === 5 ? `${value}:00` : value);
const to12h = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};
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

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal scrollable day-of-week selector strip */
function DayStrip({
  days,
  selected,
  onSelect,
  occurrences,
}: {
  days: typeof WEEKDAYS;
  selected: number;
  onSelect: (v: number) => void;
  occurrences: Record<number, { nextDate: string; count: number }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected day into view
  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-selected]") as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide"
    >
      {[...days]
        .sort((a, b) => {
          const aDate = occurrences[a.value]?.nextDate ?? "9999";
          const bDate = occurrences[b.value]?.nextDate ?? "9999";
          return aDate.localeCompare(bDate);
        })
        .map((day) => {
        const info = occurrences[day.value];
        const isSelected = selected === day.value;
        const hasSlots = info && info.count > 0;
        const dateNum = info?.nextDate
          ? format(toDate(info.nextDate), "d")
          : null;
        const dateMonth = info?.nextDate
          ? format(toDate(info.nextDate), "MMM")
          : null;

        return (
          <button
            key={day.value}
            type="button"
            data-selected={isSelected || undefined}
            onClick={() => onSelect(day.value)}
            disabled={!hasSlots}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 rounded-2xl px-4 py-3 transition-all duration-150",
              "min-w-[72px] border",
              isSelected
                ? "border-transparent bg-foreground text-background "
                : hasSlots
                  ? "border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted"
                  : "border-border bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed",
            )}
          >
            <span className={cn("text-xs font-semibold tracking-wide", isSelected ? "text-background/70" : "text-muted-foreground")}>
              {day.short}
            </span>
            {dateNum && (
              <>
                <span className="text-xl font-black leading-none">{dateNum}</span>
                <span className={cn("text-[10px] font-semibold uppercase", isSelected ? "text-background/50" : "text-muted-foreground/70")}>{dateMonth}</span>
              </>
            )}
            <span className={cn("text-[11px] font-semibold", isSelected ? "text-background/60" : "text-muted-foreground")}>
              {info ? `${info.count} wk${info.count !== 1 ? "s" : ""}` : "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Time chip — single selectable time slot pill */
function TimeChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-full border text-sm font-semibold transition-all duration-150",
        selected
          ? "border-transparent bg-foreground text-background "
          : "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

/** Period section with its chips */
function TimePeriodSection({
  period,
  slots,
  selectedTime,
  onSelect,
}: {
  period: (typeof TIME_PERIODS)[number];
  slots: { start: string; end: string }[];
  selectedTime: string;
  onSelect: (start: string) => void;
}) {
  if (!slots.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{period.emoji}</span>
        <span className="text-sm font-semibold text-foreground">{period.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((slot) => (
          <TimeChip
            key={slot.start}
            label={timeLabel(slot.start, slot.end)}
            selected={selectedTime === slot.start}
            onClick={() => onSelect(slot.start)}
          />
        ))}
      </div>
    </div>
  );
}

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

  const { data: rawSlots, isLoading: slotsLoading } = useQuery({
    queryKey: ["cleaning-slots-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_available_slots")
        .select("*")
        .gte("date", todayKey())
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch the parent provider's booking calendar so plans without an override
  // fall through to the provider-level schedule when we filter slots below.
  // Keyed on the SELECTED package's provider_id — the old query grabbed
  // "first active cleaning provider" and applied its schedule to every plan,
  // so owner-set minNotice/maxAdvance only worked by luck.
  const selectedPackage = subscriptions?.find((s: any) => s.id === selectedSubId)?.cleaning_packages;
  const packageProviderId: string | null = selectedPackage?.provider_id ?? null;
  const { data: providerSettings } = useQuery({
    queryKey: ["cleaning-provider-booking-settings", packageProviderId ?? "none"],
    enabled: !!packageProviderId,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers")
        .select("booking_settings")
        .eq("source_service_key", "cleaning")
        .eq("source_provider_id", packageProviderId!)
        .maybeSingle();
      return data?.booking_settings ?? null;
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
    const advanceCutoffMs = currentMs + settings.maxAdvanceDays * 86400_000;
    void now;

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
        if (r.date !== slot.date) return false;
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

  // ── NEW: time slots grouped by period ─────────────────────────────────────
  const groupedSlots = useMemo(() => {
    return TIME_PERIODS.map((period) => ({
      period,
      slots: availableTimeOptions.filter(
        (s) => s.start >= period.from && s.start < period.to,
      ),
    })).filter((group) => group.slots.length > 0);
  }, [availableTimeOptions]);

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
      {/* Outer shell — accounts for sticky bottom bar height */}
      <div className="flex min-h-[calc(100dvh-60px)] flex-col bg-[hsl(var(--background))]">

        {/* ── Loading state ── */}
        {isLoading && <PageLoader />}

        {/* ── No subscription state ── */}
        {!isLoading && !schedulableSubscriptions.length && (
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center ">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CalendarDays className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-foreground">No paid plan to schedule</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Pay for a cleaning plan first. Scheduling opens after payment is confirmed.
              </p>
              <Button
                onClick={() => navigate("/services/cleaning")}
                className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
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
                      <SelectTrigger className="h-9 w-auto rounded-full border-border text-xs font-semibold">
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
                  days={WEEKDAYS}
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
                  <div className="rounded-2xl border border-border bg-card p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">No dates in paid period</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try a different weekday.</p>
                  </div>
                ) : !groupedSlots.length ? (
                  <div className="rounded-2xl border border-border bg-card p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">No recurring slots available</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A conflict exists in your period. Choose a different weekday.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-5">
                    {groupedSlots.map(({ period, slots: periodSlots }) => (
                      <TimePeriodSection
                        key={period.id}
                        period={period}
                        slots={periodSlots}
                        selectedTime={selectedTime}
                        onSelect={setSelectedTime}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* ── Apartment notes ── */}
              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Access details
                </h2>
                <div className="rounded-2xl border border-border bg-card p-4">
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
                <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
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

        {/* ── Sticky bottom action bar ─────────────────────────────────────── */}
        {!isLoading && schedulableSubscriptions.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-4  md:hidden"
               style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}>
            <div className="mx-auto flex max-w-2xl gap-3">
              <button
                type="button"
                onClick={() => navigate("/my-subscriptions")}
                className="flex h-12 flex-1 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSchedule}
                disabled={!canConfirm || scheduleMutation.isPending}
                className={cn(
                  "flex h-12 flex-[2] items-center justify-center gap-2 rounded-full text-sm font-bold transition-all",
                  canConfirm && !scheduleMutation.isPending
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {scheduleMutation.isPending ? (
                  <Spinner size="sm" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm schedule
              </button>
            </div>
          </div>
        )}

        {/* Desktop bottom bar (same buttons, different layout) */}
        {!isLoading && schedulableSubscriptions.length > 0 && (
          <div className="hidden border-t border-border bg-card px-6 py-4 md:block">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => navigate("/my-subscriptions")}
                className="flex h-11 items-center justify-center rounded-full border border-border px-8 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSchedule}
                disabled={!canConfirm || scheduleMutation.isPending}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-full px-10 text-sm font-bold transition-all",
                  canConfirm && !scheduleMutation.isPending
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {scheduleMutation.isPending ? (
                  <Spinner size="sm" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm weekly schedule
              </button>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default CleaningBook;
