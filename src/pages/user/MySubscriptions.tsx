import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  Clock,
  Loader2,
  SparklesIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useUserUuid } from "@/hooks/useUserUuid";
import { format, isPast } from "date-fns";
import { UserLayout } from "@/components/layout/UserLayout";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cleaningStatusColor = (status: string) => {
  switch (status) {
    case "booked":    return "default";
    case "completed": return "secondary";
    case "cancelled": return "destructive";
    default:          return "outline";
  }
};

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
  const to12h = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  const timeStr = slot?.start_time
    ? `${to12h(slot.start_time)} – ${to12h(slot.end_time ?? "")}`
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const userUuid = useUserUuid();
  const { openAuthModal } = useAuthModal();
  const queryClient = useQueryClient();
  const navigate    = useNavigate();

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: cleaningSubscriptions, isLoading: cleaningSubsLoading } = useQuery({
    queryKey: ["my-cleaning-subscriptions-all", userUuid],
    queryFn: async () => {
      if (!userUuid) return [];
      const { data: subs, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("*")
        .eq("user_id", userUuid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!subs?.length) return [];

      // Manual join for packages (no FK constraint)
      const pkgIds = [...new Set(subs.map((s: any) => s.package_id).filter(Boolean))];
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages")
        .select("id, name, cleanings_per_month")
        .in("id", pkgIds);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p]));

      return subs.map((s: any) => ({
        ...s,
        cleaning_packages: pkgMap.get(s.package_id) || null,
      }));
    },
    enabled: isAuthenticated && !!userUuid,
  });

  const { data: cleaningBookings, isLoading: cleaningBookingsLoading } = useQuery({
    queryKey: ["my-cleaning-bookings", userUuid],
    queryFn: async () => {
      if (!userUuid) return [];
      const { data, error } = await supabaseDb
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(date, start_time, end_time)")
        .eq("user_id", userUuid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && !!userUuid,
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

  // ── Derived data ─────────────────────────────────────────────────────────

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
              <Button onClick={() => openAuthModal("login", "/my-subscriptions")}>
                Sign In
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
        <div className="mb-5">
          <p className="type-overline text-primary">Account</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            My Bookings
          </h1>
        </div>

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
      </div>
    </UserLayout>
  );
};

export default MySubscriptions;
