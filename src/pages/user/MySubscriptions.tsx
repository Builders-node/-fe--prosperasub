import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { CleaningRateAndTip } from "@/components/cleaning/CleaningRateAndTip";
import { PaymentMethodBadge } from "@/components/admin/PaymentMethodBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import {
  CalendarDays,
  Clock,
  CreditCard,
  DoorOpen,
  SparklesIcon,
  UtensilsCrossed,
  Car,
  ChefHat,
  ArrowRight,
  RefreshCw,
  X,
  Eye,
  CalendarClock,
  Waves,
  LandPlot,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, supabase, supabaseDb } from "@/integrations/supabase/client";
import { useUserUuid } from "@/hooks/useUserUuid";
import { format, isPast, addWeeks, parseISO } from "date-fns";
import { todayHN } from "@/lib/timezone";
import { UserLayout } from "@/components/layout/UserLayout";
import { TodaysMeals } from "@/components/food/TodaysMeals";
import { PullToRefresh } from "@/components/PullToRefresh";
import { RenewPreviewDialog } from "@/components/subscriptions/RenewPreviewDialog";
import { SubscriptionCard } from "@/components/subscriptions/SubscriptionCard";
import {
  TabHeaderCTA, SectionGroup, TabEmptyState, SectionOverline,
} from "@/components/subscriptions/MySubsPrimitives";
import { RateProviderButton } from "@/components/reviews/RateProviderButton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Compute what the server-side renewal will land on: continuous period,
 * next_start = max(today, prev_end + 1). Client-side preview only — server is
 * authoritative and will overwrite by ±1 day if the user opens the dialog on
 * one date and confirms after midnight.
 */
type RenewExtend = { weeks?: number; months?: number; days?: number };
function computeRenewPreview(currentEnd: string | null | undefined, extend: RenewExtend) {
  if (!currentEnd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const prevEnd = new Date(`${currentEnd}T00:00:00`);
  const prevEndPlus1 = new Date(prevEnd);
  prevEndPlus1.setDate(prevEndPlus1.getDate() + 1);
  const newStart = prevEndPlus1 > today ? prevEndPlus1 : today;
  const newEnd = new Date(newStart);
  if (extend.months) newEnd.setMonth(newEnd.getMonth() + extend.months);
  if (extend.weeks) newEnd.setDate(newEnd.getDate() + extend.weeks * 7);
  if (extend.days) newEnd.setDate(newEnd.getDate() + extend.days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { newStart: iso(newStart), newEnd: iso(newEnd) };
}

interface PendingRenewal {
  title: string;
  currentEndDate: string | null;
  newStartDate: string;
  newEndDate: string;
  amountCents: number;
  targetUrl: string;
}

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
        <div key={i} className="animate-pulse rounded-2xl bg-card p-4">
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
  onView,
  onReschedule,
}: {
  booking: any;
  upcoming: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
  onView?: () => void;
  onReschedule?: () => void;
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
        // Same shape/spacing language as SubscriptionCard: rounded-2xl bg-card
        // p-4, no border. Icon tile matches h-11 w-11 rounded-xl bg-primary/10.
        "flex items-center gap-3 rounded-2xl bg-card p-4",
        !upcoming && "opacity-70",
      )}
    >
      {/* Icon */}
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <CalendarDays className="h-5 w-5 text-primary" />
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-foreground">{dateStr}</p>
        {timeStr && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeStr}
          </p>
        )}
      </div>

      {/* Right side */}
      <div className="flex shrink-0 items-center gap-1">
        {onView && (
          <button
            type="button"
            onClick={onView}
            aria-label="View cleaning details"
            title="View details"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
        {upcoming && onReschedule && (
          <button
            type="button"
            onClick={onReschedule}
            aria-label="Reschedule cleaning"
            title="Reschedule"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <CalendarClock className="h-4 w-4" />
          </button>
        )}
        {upcoming && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            aria-label="Cancel booking"
            title="Cancel"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {cancelling ? <Spinner size="sm" /> : <X className="h-4 w-4" />}
          </button>
        ) : (
          !upcoming && (
            <Badge variant={cleaningStatusColor(booking.status) as any} className="text-xs capitalize">
              {booking.status}
            </Badge>
          )
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ServiceTab = "cleaning" | "food" | "cars" | "beach";

const MySubscriptions = () => {
  const { isAuthenticated, isLoading: authLoading, userData } = useAuth();
  const [paymentDialog, setPaymentDialog] = useState<any>(null);
  // One shared preview dialog for all three services' Renew buttons — click a
  // Renew → we set this state → dialog opens with dates + amount → on confirm
  // we navigate to the corresponding checkout URL with ?renew=<subId>.
  const [pendingRenewal, setPendingRenewal] = useState<PendingRenewal | null>(null);
  const userUuid = useUserUuid();
  const { openAuthModal } = useAuthModal();
  const queryClient = useQueryClient();
  const navigate    = useNavigate();

  // ── Service tab state (Cleaning / Food / Cars) ──────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as ServiceTab) || "cleaning";
  const [activeTab, setActiveTab] = useState<ServiceTab>(
    ["cleaning", "food", "cars", "beach"].includes(initialTab) ? initialTab : "cleaning",
  );
  const changeTab = (t: ServiceTab) => {
    setActiveTab(t);
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set("tab", t);
      return next;
    }, { replace: true });
  };

  // ── Food subscriptions for the current user ─────────────────────────────
  const { data: foodSubscriptions = [], isLoading: foodSubsLoading } = useQuery({
    queryKey: ["my-food-subscriptions", userUuid, userData?.id],
    queryFn: async () => {
      // Match both the canonical UUID and the raw auth id (Google logins were
      // historically stored as "google-xxx" rather than the resolved UUID).
      const ids = [userUuid, userData?.id].filter(Boolean) as string[];
      if (ids.length === 0) return [];
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("*")
        .in("user_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: (!!userUuid || !!userData?.id) && activeTab === "food",
  });

  // ── Car rental bookings for the current user ────────────────────────────
  const { data: rentalBookings = [], isLoading: rentalBookingsLoading } = useQuery({
    queryKey: ["my-rental-bookings", userUuid],
    queryFn: async () => {
      if (!userUuid) return [];
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*")
        .eq("user_id", userUuid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userUuid && activeTab === "cars",
  });

  // ── Beach Club memberships for the current user ─────────────────────────
  const { data: beachSubs = [], isLoading: beachSubsLoading } = useQuery({
    queryKey: ["my-beach-subs", userUuid, userData?.id],
    queryFn: async () => {
      const ids = [userUuid, userData?.id].filter(Boolean) as string[];
      if (!ids.length) return [];
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .select("*")
        .in("user_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: (!!userUuid || !!userData?.id) && activeTab === "beach",
  });

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

  // ── View / reschedule a single cleaning session ───────────────────────────
  const [viewBooking, setViewBooking] = useState<any | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlotId, setRescheduleSlotId] = useState("");

  const openReschedule = (booking: any) => {
    setRescheduleBooking(booking);
    setRescheduleDate(booking.cleaning_available_slots?.date ?? "");
    setRescheduleSlotId("");
  };

  // Active, non-full slots for the chosen date (excluding the booking's current slot).
  const { data: rescheduleSlots = [], isLoading: rescheduleSlotsLoading } = useQuery({
    queryKey: ["reschedule-slots", rescheduleDate],
    queryFn: async () => {
      if (!rescheduleDate) return [];
      const { data, error } = await supabaseDb
        .from("cleaning_available_slots")
        .select("id, date, start_time, end_time, current_bookings, max_bookings, is_active")
        .eq("date", rescheduleDate)
        .eq("is_active", true)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s: any) => (s.current_bookings ?? 0) < (s.max_bookings ?? 0));
    },
    enabled: !!rescheduleDate && !!rescheduleBooking,
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!rescheduleBooking || !rescheduleSlotId) throw new Error("Pick a new time slot.");
      const { error } = await accountApi(
        `/account/cleaning/bookings/${rescheduleBooking.id}/reschedule`,
        { method: "POST", body: JSON.stringify({ slot_id: rescheduleSlotId }) },
      );
      if (error) throw new Error(error.message || "Could not reschedule");
    },
    onSuccess: () => {
      toast.success("Cleaning rescheduled");
      setRescheduleBooking(null);
      setRescheduleSlotId("");
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fmtTime = (t?: string) => {
    if (!t) return "";
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  };

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

  // ── Food renewal ───────────────────────────────────────────────────────────
  const foodEnd = (s: any): Date =>
    s.end_date ? new Date(`${s.end_date}T00:00:00`) : addWeeks(parseISO(s.started_at), s.commitment_weeks || 1);

  const foodCanRenew = (s: any): boolean => {
    if (["cancelled"].includes(s.status)) return false;
    if (s.status === "expired") return true;
    const days = Math.ceil((foodEnd(s).getTime() - Date.now()) / 86_400_000);
    return days <= 2; // expiring soon (or already past)
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const pendingScheduleCleaningSubs = cleaningSubscriptions?.filter(
    (s) => s.payment_status === "paid" && s.subscription_status === "pending_schedule",
  ) || [];
  // One-time cleanings (no package/plan) should drop off the active list once the
  // single cleaning is done — its booking is completed/cancelled or the date passed.
  const oneTimeDoneSubIds = new Set(
    (cleaningBookings ?? [])
      .filter((b: any) => {
        const past = isPast(new Date(((b as any).cleaning_available_slots?.date ?? "9999") + "T23:59:59"));
        return b.status === "completed" || b.status === "cancelled" || past;
      })
      .map((b: any) => b.cleaning_subscription_id || b.subscription_id)
      .filter(Boolean),
  );
  const isOneTimeComplete = (s: any) =>
    !s.package_id && (
      (Number(s.cleanings_remaining) || 0) <= 0 ||
      oneTimeDoneSubIds.has(s.id) ||
      (s.end_date && s.end_date < todayHN())
    );

  const activeCleaningSubs = cleaningSubscriptions?.filter(
    (s) => s.payment_status === "paid" && s.subscription_status === "active" && s.is_active && !isOneTimeComplete(s),
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
      <UserLayout title="My Subs">
        <PageLoader />
      </UserLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title="My Subs">
        <div className="app-container py-8">
          <TabEmptyState
            icon={CalendarDays}
            title="Sign in to view bookings"
            subtitle="Track your subscriptions, bookings and payments."
            action={{ label: "Sign In", onClick: () => openAuthModal("login", "/my-subscriptions") }}
          />
        </div>
      </UserLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <UserLayout title="My Subs">
      <PullToRefresh onRefresh={async () => {
        try {
          const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";
          await fetch(`${API_URL}/cron/reconcile-payments`, { method: "POST" });
        } catch { /* best effort */ }
        await queryClient.invalidateQueries();
      }}>
      <div className="app-container pb-28 pt-5">

        {/* Page title lives in the mobile header — no inline H1 needed. */}

        {/* ── Service tabs ────────────────────────────────────────── */}
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-muted/50 p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {([
            { id: "cleaning" as const, label: "Cleaning", icon: SparklesIcon },
            { id: "food"     as const, label: "Food",     icon: UtensilsCrossed },
            { id: "cars"     as const, label: "Cars",     icon: Car },
            { id: "beach"    as const, label: "Beach",    icon: Waves },
          ]).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => changeTab(id)}
                className={`flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors sm:py-2.5 sm:text-sm ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* ─── FOOD tab content ──────────────────────────────────── */}
        {activeTab === "food" && (
          <div className="space-y-5">
            <TabHeaderCTA
              primary={{ label: "Browse Restaurants", icon: UtensilsCrossed, onClick: () => navigate("/services/food") }}
            />

            {foodSubscriptions
              .filter((s: any) => s.status === "active")
              .map((s: any) => (
                <TodaysMeals
                  key={`today-${s.id}`}
                  providerId={s.provider_id}
                  mealPlanId={s.meal_plan_id ?? null}
                />
              ))}

            {foodSubsLoading ? (
              <Skeleton rows={3} />
            ) : foodSubscriptions.length === 0 ? (
              <TabEmptyState
                icon={ChefHat}
                title="No food subscriptions yet"
                subtitle="Subscribe to a weekly meal plan to see it here."
                action={{ label: "Browse Restaurants", onClick: () => navigate("/services/food") }}
              />
            ) : (
              <SectionGroup label="Meal plans" count={foodSubscriptions.length}>
                {foodSubscriptions.map((s: any) => {
                  const endDate = foodEnd(s)?.toISOString().slice(0, 10) ?? null;
                  const openRenewDialog = () => {
                    if (!s.provider_id || !s.meal_plan_id) {
                      navigate(`/services/food/subscription/${s.id}`);
                      return;
                    }
                    const preview = computeRenewPreview(endDate, { weeks: s.commitment_weeks || 1 });
                    if (preview) {
                      setPendingRenewal({
                        title: `${s.customer_name ?? "Meal plan"} · ${s.commitment_weeks || 1} week${(s.commitment_weeks || 1) > 1 ? "s" : ""}`,
                        currentEndDate: endDate,
                        newStartDate: preview.newStart,
                        newEndDate: preview.newEnd,
                        amountCents: (s.weekly_price_cents || 0) * (s.commitment_weeks || 1),
                        targetUrl: `/services/food/${s.provider_id}/plans/${s.meal_plan_id}?renew=${s.id}`,
                      });
                    } else {
                      navigate(`/services/food/${s.provider_id}/plans/${s.meal_plan_id}?renew=${s.id}`);
                    }
                  };
                  return (
                    <SubscriptionCard
                      key={s.id}
                      icon={UtensilsCrossed}
                      iconTint="bg-emerald-500/15"
                      iconColor="text-emerald-600"
                      title={s.customer_name ?? "Weekly meal plan"}
                      subtitle={<span className="capitalize">{s.status}</span>}
                      metadata={s.started_at
                        ? `Started ${new Date(s.started_at).toLocaleDateString()} · Until ${foodEnd(s).toLocaleDateString()}`
                        : undefined}
                      onClick={() => navigate(`/services/food/subscription/${s.id}`)}
                      actions={foodCanRenew(s) ? [
                        { key: "renew", label: "Renew", icon: RefreshCw, onClick: openRenewDialog, variant: "secondary" },
                      ] : []}
                    />
                  );
                })}
              </SectionGroup>
            )}
          </div>
        )}

        {/* ─── CARS tab content ─────────────────────────────────── */}
        {activeTab === "cars" && (
          <div className="space-y-5">
            <TabHeaderCTA
              primary={{ label: "Browse Vehicles", icon: Car, onClick: () => navigate("/services/rental") }}
            />

            {rentalBookingsLoading ? (
              <Skeleton rows={3} />
            ) : rentalBookings.length === 0 ? (
              <TabEmptyState
                icon={Car}
                title="No car rentals yet"
                subtitle="Book a vehicle to see your rental history here."
                action={{ label: "Browse Vehicles", onClick: () => navigate("/services/rental") }}
              />
            ) : (
              <SectionGroup label="Rentals" count={rentalBookings.length}>
                {rentalBookings.map((b: any) => {
                  const canRate = ["completed", "paid", "confirmed"].includes(String(b.status).toLowerCase())
                    && b.end_date && b.end_date < new Date().toISOString().slice(0, 10);
                  return (
                    <SubscriptionCard
                      key={b.id}
                      icon={Car}
                      iconTint="bg-orange-500/15"
                      iconColor="text-orange-600"
                      title={`${new Date(b.start_date).toLocaleDateString()} → ${new Date(b.end_date).toLocaleDateString()}`}
                      subtitle={<span className="capitalize">{b.status} · {b.rental_days} day{b.rental_days !== 1 ? "s" : ""}</span>}
                      metadata={<span className="tabular-nums">${(b.total_cents / 100).toFixed(2)}</span>}
                      rate={canRate ? (
                        <RateProviderButton
                          service="rental"
                          itemId={b.vehicle_id}
                          subscriptionId={b.id}
                          customerName={userData?.name || userData?.display_name}
                        />
                      ) : undefined}
                    />
                  );
                })}
              </SectionGroup>
            )}
          </div>
        )}

        {/* ─── BEACH CLUB tab content ──────────────────────────── */}
        {activeTab === "beach" && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const hasActive = beachSubs.some((s: any) =>
            String(s.status).toLowerCase() === "active" && (!s.end_date || s.end_date >= today));
          return (
            <div className="space-y-5">
              <TabHeaderCTA
                primary={{ label: "Browse Plans", icon: Waves, onClick: () => navigate("/services/beach-club") }}
                secondary={hasActive ? { label: "Book a court", icon: LandPlot, onClick: () => navigate("/services/beach-club/courts") } : undefined}
              />

              {beachSubsLoading ? (
                <Skeleton rows={3} />
              ) : beachSubs.length === 0 ? (
                <TabEmptyState
                  icon={Waves}
                  title="No memberships yet"
                  subtitle="Subscribe to the Beach Club to access the gym, pools and courts."
                  action={{ label: "Browse Plans", onClick: () => navigate("/services/beach-club") }}
                />
              ) : (
                <SectionGroup label="Memberships" count={beachSubs.length}>
                  {beachSubs.map((s: any) => {
                    const expired = s.end_date && s.end_date < today;
                    const st = String(s.status).toLowerCase();
                    const label = st === "active" && !expired ? "active" : expired ? "expired" : st;
                    const canRenew = st !== "cancelled" && !!s.plan_id;
                    const canRate = (st === "active" || expired) && !!s.plan_id;

                    const openRenewDialog = () => {
                      const startIso = s.start_date;
                      const endIso = s.end_date;
                      const durationDays = startIso && endIso
                        ? Math.max(Math.round((Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86400000), 1)
                        : 30;
                      const preview = computeRenewPreview(endIso, { days: durationDays });
                      if (preview) {
                        setPendingRenewal({
                          title: `${s.plan_name || "Beach Club Membership"} · ${s.people || 1} ${(s.people || 1) === 1 ? "person" : "people"}`,
                          currentEndDate: endIso,
                          newStartDate: preview.newStart,
                          newEndDate: preview.newEnd,
                          amountCents: s.total_cents || 0,
                          targetUrl: `/services/beach-club/checkout/${s.plan_id}?renew=${s.id}`,
                        });
                      } else {
                        navigate(`/services/beach-club/checkout/${s.plan_id}?renew=${s.id}`);
                      }
                    };

                    return (
                      <SubscriptionCard
                        key={s.id}
                        icon={Waves}
                        iconTint="bg-cyan-500/15"
                        iconColor="text-cyan-400"
                        title={s.plan_name || "Beach Club Membership"}
                        subtitle={<>
                          {s.people || 1} {(s.people || 1) === 1 ? "person" : "people"}
                          {s.start_date && ` · ${new Date(`${s.start_date}T00:00:00`).toLocaleDateString()} → ${new Date(`${s.end_date}T00:00:00`).toLocaleDateString()}`}
                        </>}
                        metadata={<span className="tabular-nums">${((s.total_cents || 0) / 100).toFixed(2)}</span>}
                        statusBadge={
                          <Badge variant={cleaningStatusColor(label) as any} className="text-xs capitalize">
                            {label}
                          </Badge>
                        }
                        actions={canRenew ? [
                          { key: "renew", label: "Renew", icon: RefreshCw, onClick: openRenewDialog, variant: "secondary" },
                        ] : []}
                        rate={canRate ? (
                          <RateProviderButton
                            service="beach"
                            itemId={s.plan_id}
                            subscriptionId={s.id}
                            customerName={userData?.name || userData?.display_name}
                          />
                        ) : undefined}
                      />
                    );
                  })}
                </SectionGroup>
              )}
            </div>
          );
        })()}

        {/* ─── CLEANING tab content (existing) ─────────────────── */}
        {activeTab === "cleaning" && (
        <div className="space-y-5">
            <TabHeaderCTA
              primary={{ label: "Browse Plans", icon: SparklesIcon, onClick: () => navigate("/services/cleaning") }}
              secondary={pendingScheduleCleaningSubs.length > 0 ? {
                label: "Set Schedule",
                icon: CalendarDays,
                onClick: () => navigate(`/services/cleaning/book?subscriptionId=${pendingScheduleCleaningSubs[0].id}`),
              } : undefined}
            />

            {cleaningSubsLoading || cleaningBookingsLoading || linkedPlansLoading ? (
              <Skeleton rows={3} />
            ) : (
              <>
                {/* ── Pending schedule alert ── */}
                {pendingScheduleCleaningSubs.length > 0 && (
                  <section className="space-y-2">
                    <SectionOverline label="Action needed" tone="warning" />
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
                          onClick={() => navigate(`/services/cleaning/book?subscriptionId=${sub.id}`)}
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
                    <SectionOverline
                      label="Active plan"
                      count={activeCleaningSubs.length + linkedClientPlans.length + linkedClientSubscriptions.length}
                    />
                    {activeCleaningSubs.map((sub) => {
                      const openRenewDialog = () => {
                        const preview = computeRenewPreview(sub.end_date, {
                          months: sub.billing_period_months || 1,
                        });
                        if (preview) {
                          setPendingRenewal({
                            title: `Cleaning plan · ${sub.billing_period_months || 1} month${(sub.billing_period_months || 1) > 1 ? "s" : ""}`,
                            currentEndDate: sub.end_date,
                            newStartDate: preview.newStart,
                            newEndDate: preview.newEnd,
                            amountCents: (sub.monthly_price_cents || 0) * (sub.billing_period_months || 1),
                            targetUrl: `/services/cleaning/checkout/${sub.package_id}?renew=${sub.id}`,
                          });
                        } else {
                          navigate(`/services/cleaning/checkout/${sub.package_id}?renew=${sub.id}`);
                        }
                      };
                      const actions: any[] = [
                        {
                          key: "edit",
                          label: "Edit Schedule",
                          icon: CalendarDays,
                          variant: "primary" as const,
                          onClick: () => navigate(`/services/cleaning/book?subscriptionId=${sub.id}`),
                        },
                      ];
                      if (sub.package_id) actions.push({
                        key: "renew",
                        label: "Renew",
                        icon: RefreshCw,
                        variant: "secondary" as const,
                        onClick: openRenewDialog,
                      });
                      return (
                        <SubscriptionCard
                          key={sub.id}
                          icon={SparklesIcon}
                          iconTint="bg-primary/10"
                          iconColor="text-primary"
                          title={(sub as any).cleaning_packages?.name}
                          subtitle={(sub as any).recurring_day_of_week != null
                            ? "Weekly schedule active"
                            : `${sub.cleanings_remaining ?? 0} cleanings remaining`}
                          statusBadge={(sub as any).payment_method
                            ? <PaymentMethodBadge method={(sub as any).payment_method} />
                            : undefined}
                          actions={actions}
                          rate={sub.package_id ? (
                            <RateProviderButton
                              service="cleaning"
                              itemId={sub.package_id}
                              subscriptionId={sub.id}
                              customerName={userData?.name || userData?.display_name}
                            />
                          ) : undefined}
                        />
                      );
                    })}
                    {linkedClientPlans.map((plan: any) => {
                      const hasWeeklySchedule =
                        plan.frequency_unit === "week" ||
                        plan.frequency_unit === "weekly" ||
                        (plan.days_of_week && plan.days_of_week.length > 0) ||
                        (plan.service_frequency ?? "").toLowerCase().includes("week");
                      return (
                        <SubscriptionCard
                          key={plan.id}
                          icon={SparklesIcon}
                          iconTint="bg-primary/10"
                          iconColor="text-primary"
                          title={plan.plan_name}
                          subtitle={hasWeeklySchedule ? "Weekly schedule active" : plan.custom_frequency_label || "Active plan"}
                        />
                      );
                    })}
                    {linkedClientSubscriptions.map((sub: any) => {
                      const isPending = sub.payment_status !== "paid";
                      return (
                        <SubscriptionCard
                          key={sub.id}
                          icon={SparklesIcon}
                          iconTint="bg-primary/10"
                          iconColor="text-primary"
                          title={sub.cleaning_packages?.name ?? "Cleaning plan"}
                          subtitle={sub.recurring_day_of_week != null
                            ? "Weekly schedule active"
                            : isPending
                              ? "Payment pending"
                              : sub.cleanings_remaining != null
                                ? `${sub.cleanings_remaining} cleanings remaining`
                                : "Active plan"}
                          statusBadge={isPending ? (
                            <Button
                              size="sm"
                              onClick={() => payMutation.mutate(sub.id)}
                              loading={payMutation.isPending && payMutation.variables === sub.id}
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              Pay now
                            </Button>
                          ) : undefined}
                        />
                      );
                    })}
                  </section>
                )}

                {/* ── Door-access reminder alert ── */}
                {(activeCleaningSubs.length > 0 || linkedClientPlans.length > 0 || linkedClientSubscriptions.length > 0) && (
                  <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
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
                  <TabEmptyState
                    icon={SparklesIcon}
                    title="No active cleaning plan"
                    subtitle="Choose a cleaning plan to start booking weekly sessions."
                    action={{ label: "View Cleaning Plans", onClick: () => navigate("/services/cleaning") }}
                  />
                )}

                {/* ── Upcoming bookings ── */}
                <section className="space-y-2">
                  <SectionOverline label="Upcoming" count={upcomingCleaningBookings.length} />
                  {upcomingCleaningBookings.length === 0 ? (
                    <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
                      No upcoming cleaning sessions
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingCleaningBookings.map((booking) => (
                        <CleaningBookingRow
                          key={booking.id}
                          booking={booking}
                          upcoming
                          onView={() => setViewBooking(booking)}
                          onReschedule={booking.client_id ? undefined : () => openReschedule(booking)}
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
                    <SectionOverline label="History" count={pastCleaningBookings.length} />
                    <div className="space-y-3">
                      {pastCleaningBookings.slice(0, 5).map((booking) => (
                        <CleaningBookingRow
                          key={booking.id}
                          booking={booking}
                          upcoming={false}
                          onView={() => setViewBooking(booking)}
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

      {/* ── View cleaning session ── */}
      <ResponsiveDialog
        open={!!viewBooking}
        onOpenChange={(open) => !open && setViewBooking(null)}
        title={<span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Cleaning session</span>}
      >
        {viewBooking && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-semibold text-foreground">
                {viewBooking.cleaning_available_slots?.date
                  ? format(new Date(viewBooking.cleaning_available_slots.date + "T00:00:00"), "EEEE, MMM d, yyyy")
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Time</span>
              <span className="font-semibold text-foreground">
                {viewBooking.cleaning_available_slots?.start_time
                  ? `${fmtTime(viewBooking.cleaning_available_slots.start_time)} – ${fmtTime(viewBooking.cleaning_available_slots.end_time)}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={cleaningStatusColor(viewBooking.status) as any} className="text-xs capitalize">
                {viewBooking.status}
              </Badge>
            </div>
            {viewBooking.notes && (
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{viewBooking.notes}</p>
              </div>
            )}
            {viewBooking.status === "booked" && !isPast(new Date(viewBooking.cleaning_available_slots?.date + "T23:59:59")) && (
              <Button
                className="w-full"
                onClick={() => { const b = viewBooking; setViewBooking(null); openReschedule(b); }}
              >
                <CalendarClock className="h-4 w-4" />
                Reschedule this cleaning
              </Button>
            )}
            {viewBooking.status === "completed" && (
              <CleaningRateAndTip bookingId={viewBooking.id} customerName={userData?.name ?? userData?.display_name} />
            )}
          </div>
        )}
      </ResponsiveDialog>

      {/* ── Reschedule cleaning session ── */}
      <ResponsiveDialog
        open={!!rescheduleBooking}
        onOpenChange={(open) => { if (!open) { setRescheduleBooking(null); setRescheduleSlotId(""); } }}
        title={<span className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" />Reschedule cleaning</span>}
        description="Pick a new date and an available time slot. Your cleaning credit and calendar update automatically."
        footer={
          <Button
            className="w-full"
            disabled={!rescheduleSlotId || rescheduleMutation.isPending}
            onClick={() => rescheduleMutation.mutate()}
          >
            {rescheduleMutation.isPending && <Spinner size="sm" className="mr-2" />}
            Confirm reschedule
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Date</label>
            <input
              type="date"
              value={rescheduleDate}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleSlotId(""); }}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Available time slots</label>
            {rescheduleSlotsLoading ? (
              <div className="mt-2"><Spinner size="sm" /></div>
            ) : rescheduleSlots.length === 0 ? (
              <p className="mt-2 rounded-xl border border-border bg-card px-3 py-4 text-center text-sm text-muted-foreground">
                {rescheduleDate ? "No open slots on this date." : "Choose a date to see slots."}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {rescheduleSlots.map((slot: any) => {
                  const selected = rescheduleSlotId === slot.id;
                  const current = slot.id === (rescheduleBooking?.slot_id);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={current}
                      onClick={() => setRescheduleSlotId(slot.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      {fmtTime(slot.start_time)}
                      {current && <span className="block text-[10px] font-normal text-muted-foreground">current</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ResponsiveDialog>

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

      {/* Shared renewal confirmation dialog — shows current + new period + amount
          before we push the user into any service's checkout. */}
      {pendingRenewal && (
        <RenewPreviewDialog
          open={!!pendingRenewal}
          onOpenChange={(o) => { if (!o) setPendingRenewal(null); }}
          title={pendingRenewal.title}
          currentEndDate={pendingRenewal.currentEndDate}
          newStartDate={pendingRenewal.newStartDate}
          newEndDate={pendingRenewal.newEndDate}
          amountCents={pendingRenewal.amountCents}
          onConfirm={() => navigate(pendingRenewal.targetUrl)}
        />
      )}
      </PullToRefresh>
    </UserLayout>
  );
};

export default MySubscriptions;
