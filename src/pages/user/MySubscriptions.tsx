import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Clock,
  CreditCard,
  DoorOpen,
  Loader2,
  SparklesIcon,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, supabase, supabaseDb } from "@/integrations/supabase/client";
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
  const { isAuthenticated, isLoading: authLoading, userData } = useAuth();
  const [paymentDialog, setPaymentDialog] = useState<any>(null);
  const userUuid = useUserUuid();
  const { openAuthModal } = useAuthModal();
  const queryClient = useQueryClient();
  const navigate    = useNavigate();

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: cleaningSubscriptions, isLoading: cleaningSubsLoading } = useQuery({
    queryKey: ["my-cleaning-subscriptions-all", userUuid],
    queryFn: async () => {
      if (!userUuid) return [];
      let { data: subs, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("*")
        .eq("user_id", userUuid)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fallback: if no subs found by user_id, try matching via users.email
      // (handles cases where the subscription was created with a different user_id format)
      if (!subs?.length && userData?.email) {
        const { data: userRow } = await supabaseDb
          .from("users")
          .select("id")
          .eq("email", userData.email)
          .maybeSingle();
        if (userRow?.id && userRow.id !== userUuid) {
          const { data: fallbackSubs } = await supabaseDb
            .from("cleaning_subscriptions")
            .select("*")
            .eq("user_id", userRow.id)
            .order("created_at", { ascending: false });
          subs = fallbackSubs ?? [];
        }
      }

      if (!subs?.length) return [];

      // Manual join for packages (no FK constraint)
      const pkgIds = [...new Set(subs.map((s: any) => s.package_id).filter(Boolean))];
      const { data: pkgs } = await supabaseDb
        .from("cleaning_packages")
        .select("id, name, cleanings_per_month, frequency_unit, frequency_count, custom_frequency_label")
        .in("id", pkgIds);
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p]));

      return subs.map((s: any) => ({
        ...s,
        cleaning_packages: pkgMap.get(s.package_id) || null,
      }));
    },
    enabled: isAuthenticated && !!userUuid,
  });

  // Fetch client explicitly linked to this user account via the admin Clients panel.
  // Only uses cleaning_clients.user_id — never email match (too broad, causes cross-account leaks).
  const { data: linkedClient } = useQuery({
    queryKey: ["my-linked-client", userUuid],
    queryFn: async () => {
      if (!userUuid) return null;
      const { data, error } = await supabaseDb
        .from("cleaning_clients")
        .select("id, company_name, status")
        .eq("user_id", userUuid)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: isAuthenticated && !!userUuid,
  });

  // Fetch custom plans for the linked client — no FK joins (they fail silently on type mismatch)
  const { data: linkedClientPlans = [], isLoading: linkedPlansLoading } = useQuery({
    queryKey: ["my-linked-client-plans", linkedClient?.id],
    queryFn: async () => {
      if (!linkedClient?.id) return [];
      const { data, error } = await supabaseDb
        .from("cleaning_custom_plans")
        .select("id, plan_name, status, frequency_unit, frequency_count, custom_frequency_label, days_of_week, client_id, service_frequency")
        .eq("client_id", linkedClient.id);
      if (error) throw error;
      // Exclude only explicitly archived or cancelled plans (default null = active)
      return (data ?? []).filter((p: any) => {
        const s = String(p.status ?? "active").toLowerCase();
        return s !== "archived" && s !== "cancelled";
      });
    },
    enabled: !!linkedClient?.id,
  });

  // Fetch subscriptions linked by client_id (private/custom plans may be in cleaning_subscriptions, not custom_plans)
  const { data: linkedClientSubscriptions = [] } = useQuery({
    queryKey: ["my-linked-client-subscriptions", linkedClient?.id],
    queryFn: async () => {
      if (!linkedClient?.id) return [];
      // Fetch all subscriptions for this client — no server-side filters (avoid missing column errors)
      const { data, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id, subscription_status, payment_status, is_active, package_id, cleanings_remaining, recurring_day_of_week, recurring_time, apartment_note, admin_notes, client_id")
        .eq("client_id", linkedClient.id);
      if (error) throw error;
      if (!data?.length) return [];

      // Client-side filter: exclude only cancelled/expired
      const active = data.filter((s: any) => {
        const st = (s.subscription_status ?? "").toLowerCase();
        return st !== "cancelled" && st !== "expired";
      });
      if (!active.length) return [];

      // Manually fetch packages (no FK join — type mismatch)
      const pkgIds = [...new Set(active.map((s: any) => s.package_id).filter(Boolean))];
      const { data: pkgs } = pkgIds.length
        ? await supabaseDb.from("cleaning_packages").select("id, name, cleanings_per_month, frequency_unit, frequency_count, custom_frequency_label").in("id", pkgIds)
        : { data: [] };
      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p]));
      return active.map((s: any) => ({ ...s, cleaning_packages: pkgMap.get(s.package_id) || null }));
    },
    enabled: !!linkedClient?.id,
  });

  // Fetch user's cleaning preferences (access instructions + reminder settings)
  const { data: cleaningPrefs } = useQuery({
    queryKey: ["my-cleaning-prefs", userUuid],
    queryFn: async () => {
      const { data, error } = await accountApi("/account/preferences/cleaning");
      if (error) return null;
      return data as { reminder_enabled: boolean; reminder_method: string; reminder_minutes_before: number; access_instructions: string | null } | null;
    },
    enabled: isAuthenticated && !!userUuid,
  });

  const { data: cleaningBookings, isLoading: cleaningBookingsLoading } = useQuery({
    queryKey: ["my-cleaning-bookings", userUuid, linkedClient?.id],
    queryFn: async () => {
      const sortByDate = (rows: any[]) => rows.sort((a, b) => {
        const dtA = `${a.cleaning_available_slots?.date ?? "9999"}T${a.cleaning_available_slots?.start_time ?? "00:00:00"}`;
        const dtB = `${b.cleaning_available_slots?.date ?? "9999"}T${b.cleaning_available_slots?.start_time ?? "00:00:00"}`;
        return dtA < dtB ? -1 : dtA > dtB ? 1 : 0;
      });

      // Priority: if this user has a linked client, show ONLY that client's bookings.
      // This prevents mixing bookings from different accounts (e.g. admin's own bookings).
      if (linkedClient?.id) {
        const { data, error } = await supabaseDb
          .from("cleaning_bookings")
          .select("*, cleaning_available_slots(date, start_time, end_time)")
          .eq("client_id", linkedClient.id);
        if (error) throw error;
        return sortByDate(data ?? []);
      }

      // Fallback: no linked client — show only the user's OWN direct bookings
      // (filter client_id IS NULL to exclude admin-created client bookings that use admin's user_id)
      if (!userUuid) return [];
      const { data, error } = await supabaseDb
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(date, start_time, end_time)")
        .eq("user_id", userUuid)
        .is("client_id", null);
      if (error) throw error;
      return sortByDate(data ?? []);
    },
    enabled: isAuthenticated && (!!linkedClient?.id || !!userUuid),
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

  const payMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await accountApi(`/account/subscriptions/${subscriptionId}/invoice`, { method: "POST" });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.status === "paid") {
        toast.success("Subscription is already paid!");
        queryClient.invalidateQueries({ queryKey: ["my-linked-client-subscriptions"] });
      } else if (data?.payment_request) {
        setPaymentDialog(data);
      } else {
        toast.info("Payment is not available yet. Please contact support.");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Failed to generate payment"),
  });

  // ── Derived data ─────────────────────────────────────────────────────────

  const pendingScheduleCleaningSubs = cleaningSubscriptions?.filter(
    (s) => s.payment_status === "paid" && s.subscription_status === "pending_schedule",
  ) || [];
  const activeCleaningSubs = cleaningSubscriptions?.filter(
    (s) => s.payment_status === "paid" && s.subscription_status === "active" && s.is_active,
  ) || [];

  const byDateTime = (a: any, b: any) => {
    const dtA = `${a.cleaning_available_slots?.date ?? "9999"}T${a.cleaning_available_slots?.start_time ?? "00:00:00"}`;
    const dtB = `${b.cleaning_available_slots?.date ?? "9999"}T${b.cleaning_available_slots?.start_time ?? "00:00:00"}`;
    return dtA < dtB ? -1 : dtA > dtB ? 1 : 0;
  };

  // Upcoming: booked + not yet past end-of-day — sorted nearest first
  const upcomingCleaningBookings = (cleaningBookings?.filter(
    (b) => b.status === "booked" && !isPast(new Date((b as any).cleaning_available_slots?.date + "T23:59:59")),
  ) || []).sort(byDateTime);

  // Past: completed / cancelled / past date — sorted newest first (most recent cleaning at top)
  const pastCleaningBookings = (cleaningBookings?.filter(
    (b) => b.status !== "booked" || isPast(new Date((b as any).cleaning_available_slots?.date + "T23:59:59")),
  ) || []).sort((a, b) => -byDateTime(a, b));

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
            description="Track your cleaning plans and bookings."
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
                  disabled={activeCleaningSubs.length === 0 && linkedClientPlans.length === 0 && linkedClientSubscriptions.length === 0}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-foreground py-3 text-sm font-bold text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CalendarDays className="h-4 w-4" />
                  Edit Schedule
                </button>
              )}
            </div>

            {cleaningSubsLoading || cleaningBookingsLoading || linkedPlansLoading ? (
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
                {(activeCleaningSubs.length > 0 || linkedClientPlans.length > 0 || linkedClientSubscriptions.length > 0) && (
                  <section className="space-y-2">
                    <p className="type-overline text-muted-foreground">
                      Active plan · {activeCleaningSubs.length + linkedClientPlans.length + linkedClientSubscriptions.length}
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
                    {linkedClientPlans.map((plan: any) => {
                      const hasWeeklySchedule =
                        plan.frequency_unit === "week" ||
                        plan.frequency_unit === "weekly" ||
                        (plan.days_of_week && plan.days_of_week.length > 0) ||
                        (plan.service_frequency ?? "").toLowerCase().includes("week");
                      return (
                        <div key={plan.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                              <SparklesIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground">{plan.plan_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {hasWeeklySchedule ? "Weekly schedule active" : plan.custom_frequency_label || "Active plan"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {linkedClientSubscriptions.map((sub: any) => {
                      const isPending = sub.payment_status !== "paid";
                      return (
                        <div key={sub.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                <SparklesIcon className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-foreground">
                                  {sub.cleaning_packages?.name ?? "Cleaning plan"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {sub.recurring_day_of_week != null
                                    ? "Weekly schedule active"
                                    : isPending
                                      ? "Payment pending"
                                      : sub.cleanings_remaining != null
                                        ? `${sub.cleanings_remaining} cleanings remaining`
                                        : "Active plan"}
                                </p>
                              </div>
                            </div>
                            {isPending && (
                              <Button
                                size="sm"
                                onClick={() => payMutation.mutate(sub.id)}
                                loading={payMutation.isPending && payMutation.variables === sub.id}
                                className="shrink-0"
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                Pay now
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}

                {/* ── Door-access reminder alert ── */}
                {(activeCleaningSubs.length > 0 || linkedClientPlans.length > 0 || linkedClientSubscriptions.length > 0) && (
                  <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                      <DoorOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">
                        Cleaning day reminder
                      </p>
                      {cleaningPrefs?.access_instructions ? (
                        // Custom instructions set by the user
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {cleaningPrefs.access_instructions}
                        </p>
                      ) : (
                        // Generic fallback
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          On your cleaning day, please make sure the apartment door is{" "}
                          <span className="font-semibold text-foreground">unlocked or accessible</span>{" "}
                          so the cleaning team can enter.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── No plan empty state ── */}
                {activeCleaningSubs.length === 0 && pendingScheduleCleaningSubs.length === 0 && linkedClientPlans.length === 0 && linkedClientSubscriptions.length === 0 && (
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
      {/* ── Lightning payment dialog ── */}
      <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Pay with Lightning
            </DialogTitle>
            <DialogDescription>
              Scan the QR code or copy the invoice to pay with any Bitcoin Lightning wallet.
            </DialogDescription>
          </DialogHeader>
          {paymentDialog && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-xl bg-white p-4">
                <QRCodeSVG value={paymentDialog.payment_request} size={200} />
              </div>
              <div className="space-y-2 text-center">
                <p className="text-sm font-semibold text-foreground">
                  {paymentDialog.plan_name ?? "Cleaning plan"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {paymentDialog.amount_cents != null
                    ? `$${(paymentDialog.amount_cents / 100).toFixed(2)}`
                    : paymentDialog.amount_sats != null
                      ? `${paymentDialog.amount_sats.toLocaleString()} sats`
                      : ""}
                </p>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(paymentDialog.payment_request);
                  toast.success("Invoice copied to clipboard");
                }}
              >
                Copy invoice
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
};

export default MySubscriptions;
