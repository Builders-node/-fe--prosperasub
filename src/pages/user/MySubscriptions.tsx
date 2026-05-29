import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  Clock,
  HelpCircle,
  Loader2,
  Plus,
  SparklesIcon,
  Utensils,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MySubscriptionCard } from "@/components/MySubscriptionCard";
import { HowItWorksSheet } from "@/components/HowItWorksSheet";
import { MealDeadlineBanner } from "@/components/CutoffIndicator";
import { addDays, format, isPast, startOfDay } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { UserLayout } from "@/components/layout/UserLayout";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "meal" | "cleaning";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cleaningStatusColor = (status: string) => {
  switch (status) {
    case "booked":    return "default";
    case "completed": return "secondary";
    case "cancelled": return "destructive";
    default:          return "outline";
  }
};

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl({
  activeTab,
  onTabChange,
  mealCount,
  cleaningCount,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  mealCount: number;
  cleaningCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
      {(
        [
          { id: "meal" as Tab,     label: "Meal Plan", icon: Utensils,      count: mealCount     },
          { id: "cleaning" as Tab, label: "Cleaning",  icon: SparklesIcon,  count: cleaningCount },
        ] as const
      ).map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150",
            activeTab === id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
          {count > 0 && (
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                activeTab === id
                  ? "bg-primary text-black"
                  : "bg-border text-muted-foreground",
              )}
            >
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Section skeleton ─────────────────────────────────────────────────────────

function Skeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-border bg-card p-4">
          <div className="flex gap-4">
            <div className="h-12 w-12 rounded-xl bg-muted" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Booking row ─────────────────────────────────────────────────────────────

function CleaningBookingRow({
  booking,
  upcoming,
  onCancel,
  cancelling,
}: {
  booking: any;
  upcoming: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const slot = booking.cleaning_available_slots;
  const dateStr = slot?.date
    ? format(new Date(slot.date + "T00:00:00"), upcoming ? "EEE, MMM d" : "MMM d, yyyy")
    : "—";
  const timeStr = slot?.start_time
    ? `${slot.start_time.slice(0, 5)} – ${slot.end_time?.slice(0, 5) ?? ""}`
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3",
        !upcoming && "opacity-60",
      )}
    >
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <CalendarDays className="h-5 w-5 text-primary" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{dateStr}</p>
        {timeStr && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeStr}
          </p>
        )}
      </div>

      {/* Right side */}
      {upcoming && onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          aria-label="Cancel booking"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          {cancelling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </button>
      ) : (
        <Badge variant={cleaningStatusColor(booking.status) as any} className="text-xs capitalize">
          {booking.status}
        </Badge>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const MySubscriptions = () => {
  const { userData, isAuthenticated, lightningPubkey, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const navigate    = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive active tab from URL param, default to "meal"
  const rawTab   = searchParams.get("tab");
  const activeTab: Tab = rawTab === "cleaning" ? "cleaning" : "meal";

  const setTab = (tab: Tab) => {
    setSearchParams(tab === "meal" ? {} : { tab });
  };

  // ── Queries (unchanged) ──────────────────────────────────────────────────

  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ["user-subscriptions", userData?.id, lightningPubkey],
    queryFn: async () => {
      const pubkey = userData?.lightning_pubkey || lightningPubkey;
      if (pubkey) await supabase.rpc("set_lightning_session", { p_pubkey: pubkey });
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, restaurants(name, logo_url), subscription_plans(name, meal_time)")
        .eq("user_id", userData?.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const { data: cleaningSubscriptions, isLoading: cleaningSubsLoading } = useQuery({
    queryKey: ["my-cleaning-subscriptions-all", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return [];
      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .select("*, cleaning_packages(name, cleanings_per_month)")
        .eq("user_id", userData.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const { data: cleaningBookings, isLoading: cleaningBookingsLoading } = useQuery({
    queryKey: ["my-cleaning-bookings", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return [];
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(date, start_time, end_time)")
        .eq("user_id", userData.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const { data: globalSettings } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("global_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: nextMeals } = useQuery({
    queryKey: ["next-meals", userData?.id, lightningPubkey],
    queryFn: async () => {
      if (!subscriptions?.length) return {};
      const pubkey   = userData?.lightning_pubkey || lightningPubkey;
      const tomorrow = format(addDays(startOfDay(nowHN()), 1), "yyyy-MM-dd");
      const map: Record<string, any> = {};
      for (const sub of subscriptions) {
        if (!sub.is_active) continue;
        const { data } = await supabase.rpc("get_daily_meal_choices_by_pubkey", {
          p_pubkey: pubkey,
          p_subscription_id: sub.id,
        });
        if (data?.length) {
          const upcoming = data
            .filter((m: any) => m.date >= tomorrow)
            .sort((a: any, b: any) => a.date.localeCompare(b.date));
          if (upcoming.length)
            map[sub.id] = {
              date:     upcoming[0].date,
              choice:   upcoming[0].choice,
              mealType: upcoming[0].meal_type,
            };
        }
      }
      return map;
    },
    enabled: !!subscriptions?.length,
  });

  const cancelCleaningMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc("cancel_cleaning_booking", {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Booking cancelled. Cleaning credit restored.");
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-all"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ── Derived data (unchanged) ─────────────────────────────────────────────

  const activeSubscriptions = subscriptions?.filter((s) => s.is_active) || [];
  const pastSubscriptions   = subscriptions?.filter((s) => !s.is_active) || [];

  const pendingScheduleCleaningSubs = cleaningSubscriptions?.filter(
    (s) => s.payment_status === "paid" && s.subscription_status === "pending_schedule",
  ) || [];
  const activeCleaningSubs = cleaningSubscriptions?.filter(
    (s) => s.payment_status === "paid" && s.subscription_status === "active" && s.is_active,
  ) || [];

  const upcomingCleaningBookings = cleaningBookings?.filter(
    (b) => b.status === "booked" && !isPast(new Date((b as any).cleaning_available_slots?.date + "T23:59:59")),
  ) || [];
  const pastCleaningBookings = cleaningBookings?.filter(
    (b) => b.status !== "booked" || isPast(new Date((b as any).cleaning_available_slots?.date + "T23:59:59")),
  ) || [];

  // Badge counts for the segmented control
  const mealCount     = activeSubscriptions.length;
  const cleaningCount = activeCleaningSubs.length + pendingScheduleCleaningSubs.length + upcomingCleaningBookings.length;

  // ── Loading / auth gates ─────────────────────────────────────────────────

  if (authLoading) {
    return (
      <UserLayout title="My Bookings">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </UserLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title="My Bookings">
        <div className="flex items-center justify-center py-20">
          <EmptyState
            title="Sign in to view bookings"
            description="Track your meal plans and cleaning bookings."
            className="mx-4 max-w-sm"
            action={
              <Button asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
            }
          />
        </div>
      </UserLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <UserLayout title="My Bookings">
      <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:px-6">

        {/* ── Page header ── */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="type-overline text-primary">Account</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              My Bookings
            </h1>
          </div>
          <HowItWorksSheet
            trigger={
              <button
                type="button"
                aria-label="How it works"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            }
          />
        </div>

        {/* ── Segmented control ── */}
        <div className="sticky top-[60px] z-30 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6">
          <SegmentedControl
            activeTab={activeTab}
            onTabChange={setTab}
            mealCount={mealCount}
            cleaningCount={cleaningCount}
          />
        </div>

        {/* ═══════════════════════════════════════
            MEAL PLAN TAB
        ════════════════════════════════════════ */}
        {activeTab === "meal" && (
          <div className="mt-5 space-y-5">

            {/* Deadline banner */}
            {globalSettings && activeSubscriptions.length > 0 && (
              <MealDeadlineBanner
                cutoffHours={globalSettings.daily_choice_cutoff_hours || 3}
                mealTime="all"
              />
            )}

            {/* Browse CTA */}
            <button
              type="button"
              onClick={() => navigate("/restaurants")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Browse Plans &amp; Subscribe
            </button>

            {/* Content */}
            {subsLoading ? (
              <Skeleton rows={2} />
            ) : (subscriptions?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Utensils className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-base font-bold text-foreground">No meal subscriptions yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Subscribe to a meal plan and never worry about what to eat.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/restaurants")}
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-8 text-sm font-bold text-background transition-colors hover:bg-foreground/90"
                >
                  Browse Restaurants
                </button>
              </div>
            ) : (
              <>
                {activeSubscriptions.length > 0 && (
                  <section className="space-y-3">
                    <p className="type-overline text-muted-foreground">
                      Active · {activeSubscriptions.length}
                    </p>
                    {activeSubscriptions.map((sub: any) => (
                      <MySubscriptionCard
                        key={sub.id}
                        subscription={sub}
                        nextMeal={nextMeals?.[sub.id]}
                      />
                    ))}
                  </section>
                )}

                {pastSubscriptions.length > 0 && (
                  <section className="space-y-3">
                    <p className="type-overline text-muted-foreground">
                      Past · {pastSubscriptions.length}
                    </p>
                    <div className="space-y-3 opacity-70">
                      {pastSubscriptions.map((sub: any) => (
                        <MySubscriptionCard key={sub.id} subscription={sub} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════
            CLEANING TAB
        ════════════════════════════════════════ */}
        {activeTab === "cleaning" && (
          <div className="mt-5 space-y-5">

            {/* Browse + schedule CTAs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate("/cleaning")}
                className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <SparklesIcon className="h-4 w-4" />
                Browse Plans
              </button>

              {pendingScheduleCleaningSubs.length > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate(`/cleaning/book?subscriptionId=${pendingScheduleCleaningSubs[0].id}`)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-sm font-bold text-background transition-colors hover:bg-foreground/90"
                >
                  <CalendarDays className="h-4 w-4" />
                  Set Schedule
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      activeCleaningSubs[0]
                        ? `/cleaning/book?subscriptionId=${activeCleaningSubs[0].id}`
                        : "/cleaning/book",
                    )
                  }
                  disabled={activeCleaningSubs.length === 0}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-sm font-bold text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CalendarDays className="h-4 w-4" />
                  Edit Schedule
                </button>
              )}
            </div>

            {cleaningSubsLoading || cleaningBookingsLoading ? (
              <Skeleton rows={3} />
            ) : (
              <>
                {/* ── Pending schedule alert ── */}
                {pendingScheduleCleaningSubs.length > 0 && (
                  <section className="space-y-2">
                    <p className="type-overline text-warning">Action needed</p>
                    {pendingScheduleCleaningSubs.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {(sub as any).cleaning_packages?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Paid — set your weekly schedule to activate
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/cleaning/book?subscriptionId=${sub.id}`)}
                          className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-xs font-bold text-background"
                        >
                          Set schedule
                        </button>
                      </div>
                    ))}
                  </section>
                )}

                {/* ── Active plan ── */}
                {activeCleaningSubs.length > 0 && (
                  <section className="space-y-2">
                    <p className="type-overline text-muted-foreground">
                      Active plan · {activeCleaningSubs.length}
                    </p>
                    {activeCleaningSubs.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <SparklesIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">
                              {(sub as any).cleaning_packages?.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(sub as any).recurring_day_of_week != null
                                ? "Weekly schedule active"
                                : `${sub.cleanings_remaining ?? 0} cleanings remaining`}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/cleaning/book?subscriptionId=${sub.id}`)}
                          className="shrink-0 rounded-full border border-border bg-background px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </section>
                )}

                {/* ── No plan empty state ── */}
                {activeCleaningSubs.length === 0 && pendingScheduleCleaningSubs.length === 0 && (
                  <div className="rounded-2xl border border-border bg-card p-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <SparklesIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-base font-bold text-foreground">No active cleaning plan</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose a cleaning plan to start booking weekly sessions.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate("/cleaning")}
                      className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-8 text-sm font-bold text-background transition-colors hover:bg-foreground/90"
                    >
                      View Cleaning Plans
                    </button>
                  </div>
                )}

                {/* ── Upcoming bookings ── */}
                <section className="space-y-2">
                  <p className="type-overline text-muted-foreground">
                    Upcoming · {upcomingCleaningBookings.length}
                  </p>
                  {upcomingCleaningBookings.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
                      No upcoming cleaning sessions
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {upcomingCleaningBookings.map((booking) => (
                        <CleaningBookingRow
                          key={booking.id}
                          booking={booking}
                          upcoming
                          onCancel={() => cancelCleaningMutation.mutate(booking.id)}
                          cancelling={cancelCleaningMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* ── History (collapsed if long) ── */}
                {pastCleaningBookings.length > 0 && (
                  <section className="space-y-2">
                    <p className="type-overline text-muted-foreground">
                      History · {pastCleaningBookings.length}
                    </p>
                    <div className="space-y-2">
                      {pastCleaningBookings.slice(0, 5).map((booking) => (
                        <CleaningBookingRow
                          key={booking.id}
                          booking={booking}
                          upcoming={false}
                        />
                      ))}
                      {pastCleaningBookings.length > 5 && (
                        <p className="pt-1 text-center text-xs text-muted-foreground">
                          +{pastCleaningBookings.length - 5} older sessions
                        </p>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default MySubscriptions;
