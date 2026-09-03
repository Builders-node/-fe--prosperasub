import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { effectiveCleaningStatus, effectiveFoodStatus } from "@/lib/subscriptionLifecycle";
import { QueryError } from "@/components/patterns/QueryError";
import { StatusPill } from "@/components/patterns/StatusPill";
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
  CalendarPlus,
  Waves,
  LandPlot,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  CarFront,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, supabase, supabaseDb } from "@/integrations/supabase/client";
import { useUserUuid } from "@/hooks/useUserUuid";
import { format, isPast, addWeeks, parseISO } from "date-fns";
import { addDaysISO, addMonthsISO, addWeeksISO, formatDateHN, formatRangeHN, todayHN } from "@/lib/timezone";
import { formatUSD } from "@/lib/pricing";
import { UserLayout } from "@/components/layout/UserLayout";
import { PullToRefresh } from "@/components/patterns/PullToRefresh";
import { RenewPreviewDialog } from "@/components/subscriptions/RenewPreviewDialog";
import { SubscriptionCard } from "@/components/subscriptions/SubscriptionCard";
import { SubscriptionDetailSheet, type PurchaseDetail } from "@/components/subscriptions/SubscriptionDetailSheet";
import {
  SectionGroup, TabEmptyState, SectionOverline,
} from "@/components/subscriptions/MySubsPrimitives";
import { RateProviderButton } from "@/components/reviews/RateProviderButton";
import { ReviewPromptCard } from "@/components/reviews/ReviewPromptCard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { to12h as format12h } from "@/lib/booking/bookingSettings";
import { carPath } from "@/features/vehicles";

/**
 * Compute what the server-side renewal will land on: continuous period,
 * next_start = max(today, prev_end + 1). Client-side preview only — server is
 * authoritative and will overwrite by ±1 day if the user opens the dialog on
 * one date and confirms after midnight.
 */
type RenewExtend = { weeks?: number; months?: number; days?: number };
function computeRenewPreview(currentEnd: string | null | undefined, extend: RenewExtend) {
  if (!currentEnd) return null;
  // All ISO-string arithmetic in Honduras terms. The previous version built
  // local-midnight Dates and serialised with toISOString(), which shifts a day
  // for any browser east of UTC — so the dialog promised a period the server
  // would never write.
  const today = todayHN();
  const prevEndPlus1 = addDaysISO(currentEnd, 1);
  const newStart = prevEndPlus1 > today ? prevEndPlus1 : today;
  let newEnd = newStart;
  if (extend.months) newEnd = addMonthsISO(newEnd, extend.months);
  if (extend.weeks) newEnd = addWeeksISO(newEnd, extend.weeks);
  if (extend.days) newEnd = addDaysISO(newEnd, extend.days);
  return { newStart, newEnd };
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

// ─── Section skeleton ─────────────────────────────────────────────────────────

/**
 * Active / Past segmented control.
 *
 * Same treatment as the service tab strip above it (DESIGN.md §7): a
 * `bg-muted/50` track, the selected segment filled, inactive segments carrying
 * no border and no fill.
 */
/**
 * Active/Past, and the way out to the catalogue, on one line.
 *
 * These used to be two full-width rows stacked under the service tabs — a
 * "Browse plans" block and a segmented control — so a phone showed four rows
 * of chrome (prompt, tabs, buttons, toggle) before the first subscription.
 * The browse action is a link at the end of the same line now: it is how you
 * leave this page, not the thing the page is for.
 */
function ListControls({
  scope, onChange, browse,
}: {
  /** Active/Past toggle. Omitted now that the page header owns scope; the
      component keeps the prop so any standalone caller still works. */
  scope?: "active" | "past";
  onChange?: (s: "active" | "past") => void;
  browse?: { label: string; onClick: () => void };
}) {
  if (!scope && !browse) return null;
  return (
    <div className={cn("flex items-center gap-3", scope ? "justify-between" : "justify-end")}>
      {scope && onChange && <ScopeToggle scope={scope} onChange={onChange} />}
      {browse && (
        <button
          type="button"
          onClick={browse.onClick}
          className="shrink-0 text-[13px] font-semibold tracking-[-0.02em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {browse.label} →
        </button>
      )}
    </div>
  );
}

function ScopeToggle({
  scope, onChange,
}: {
  scope: "active" | "past";
  onChange: (s: "active" | "past") => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-inset p-1">
      {([["active", "Active"], ["past", "Past"]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={scope === key}
          onClick={() => onChange(key)}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold tracking-[-0.02em] transition-colors ${
            scope === key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Skeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-radius-md bg-card p-4">
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
  planName,
}: {
  booking: any;
  upcoming: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
  onView?: () => void;
  onReschedule?: () => void;
  /** Which plan this visit belongs to — a customer can hold more than one. */
  planName?: string | null;
}) {
  const slot = booking.cleaning_available_slots;
  const dateStr = slot?.date
    ? format(new Date(slot.date + "T00:00:00"), upcoming ? "EEE, MMM d" : "MMM d, yyyy")
    : "—";
  const timeStr = slot?.start_time
    ? `${format12h(slot.start_time)} – ${format12h(slot.end_time ?? "")}`
    : null;

  return (
    <div
      className={cn(
        // Same shape/spacing language as SubscriptionCard: rounded-radius-md bg-card
        // p-4, no border. Icon tile matches h-11 w-11 rounded-xl bg-primary/10.
        "flex items-center gap-3 rounded-radius-md bg-card p-4",
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
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {timeStr && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeStr}
            </span>
          )}
          {/* Which plan this visit is for. Someone with a cleaning plan AND a
              car wash saw two identical lists of dates and times with nothing
              to tell them apart — and cancelling the wrong one is a real
              mistake to make. */}
          {planName && (
            <span className="truncate font-semibold text-foreground/80">{planName}</span>
          )}
        </p>
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
            <StatusPill status={booking.status} />
          )
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * A tab is an archetype key, straight from service_archetypes — not a fixed
 * list. The four labels used to be hard-coded here, so the tab still said
 * "Beach" long after an admin renamed that archetype to "Lifestyle", and a new
 * archetype got no tab at all.
 *
 * The tab CONTENT is still per-service: each legacy table has its own columns
 * and its own card. What is data-driven is which tabs exist, what they are
 * called, their icons and their order.
 */
type ServiceTab = string;

/** Old `?tab=` values, so links and bookmarks keep landing where they did. */
const LEGACY_TAB_ALIASES: Record<string, string> = {
  beach: "entertainment",
  "beach-club": "entertainment",
  other: "entertainment",
};

/**
 * `provider_subscriptions.user_id` is a `uuid` column (cleaning/food are `text`).
 * Passing a Google-sub id like "google-oauth2|123" into a `.in()`/`.eq()` on it
 * makes PostgREST 400 the WHOLE query ("invalid input syntax for type uuid"),
 * which is what turned the beach section into "Couldn't load your memberships".
 * Filter ids to real UUIDs before querying that table.
 */
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

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

  // ── Service tabs, driven by service_archetypes ─────────────────────────
  const { archetypes } = useServiceArchetypes(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") ?? "";
  const [activeTab, setActiveTab] = useState<ServiceTab>(
    LEGACY_TAB_ALIASES[rawTab] ?? rawTab ?? "",
  );

  // The archetype list arrives async, so the first render has no tabs to
  // validate against. Settle on the first archetype once they land, and only
  // if the current selection isn't one of them.
  useEffect(() => {
    if (!archetypes.length) return;
    if (archetypes.some((a) => a.key === activeTab)) return;
    setActiveTab(archetypes[0].key);
  }, [archetypes, activeTab]);
  /**
   * Active / Past. Food, Cars and Beach rendered one flat list each with live
   * and long-dead rows intermixed and no way to separate them — a customer
   * with a year of history scrolled past everything to find what's running.
   * Cleaning already sectioned itself, so it keeps its own layout and ignores
   * this.
   */
  const [scope, setScope] = useState<"active" | "past">("active");
  /** Tapping a card opens the purchase — the tariff taken and how it was paid. */
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  /** Search across the visible cards — the design's search pill. */
  const [query, setQuery] = useState("");
  /**
   * A row matches when the words typed appear anywhere in it — plan name,
   * provider, customer, dates. Crude by design: a subscriptions list is small
   * and a person types "beach" or a name, not a column.
   */
  const matchesQuery = (row: unknown): boolean => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    try { return JSON.stringify(row).toLowerCase().includes(q); }
    catch { return true; }
  };

  const changeTab = (t: ServiceTab) => {
    setActiveTab(t);
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp);
      next.set("tab", t);
      return next;
    }, { replace: true });
  };

  // ── Food subscriptions for the current user ─────────────────────────────
  const {
    data: foodSubscriptions = [], isLoading: foodSubsLoading,
    isError: foodError, refetch: refetchFood,
  } = useQuery({
    queryKey: ["my-food-subscriptions", userUuid, userData?.id],
    queryFn: async () => {
      // Match both the canonical UUID and the raw auth id (Google logins were
      // historically stored as "google-xxx" rather than the resolved UUID).
      const ids = [userUuid, userData?.id].filter(Boolean) as string[];
      if (ids.length === 0) return [];
      const { data, error } = await supabaseDb
        .from("food_subscriptions")
        .select("*, food_meal_plans(name), food_providers(name)")
        .in("user_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: (!!userUuid || !!userData?.id),
  });


  // ── Beach Club memberships for the current user ─────────────────────────
  const {
    data: beachSubs = [], isLoading: beachSubsLoading,
    isError: beachError, refetch: refetchBeach,
  } = useQuery({
    queryKey: ["my-beach-subs", userUuid, userData?.id],
    queryFn: async () => {
      // provider_subscriptions.user_id is uuid — only real UUIDs, or the whole
      // query 400s and the beach section shows "Couldn't load your memberships".
      const ids = [userUuid, userData?.id].filter(isUuid);
      if (!ids.length) return [];
      // The membership itself is a universal subscription now. It is read
      // back under the names this card already uses — including the legacy
      // subscription and plan ids, because renewing and rating still speak
      // those, and a screen is the wrong place to start a second vocabulary.
      const { data, error } = await supabaseDb
        .from("provider_subscriptions")
        .select("*, provider_plans(source_plan_id)")
        .eq("source_service_key", "beach")
        .in("user_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        id: r.source_subscription_id ?? r.id,
        plan_id: r.provider_plans?.source_plan_id ?? r.plan_id,
        plan_name: r.metadata?.plan_name ?? "Beach Club Membership",
        people: Number(r.metadata?.people) || 1,
        total_cents: r.price_cents ?? 0,
      }));
    },
    enabled: (!!userUuid || !!userData?.id),
  });

  /**
   * Subscriptions to providers that have no legacy table of their own — the
   * universal provider_subscriptions row written by UniversalPlanCheckout.
   * A provider like Massage has no legacy table, so none of the per-service
   * queries above would ever return its rows and a customer could pay and then
   * not see what they bought.
   *
   * All archetypes now that the list is one — no tab to scope it to. Legacy-
   * backed rows are still excluded (`source_service_key IS NULL`) so a beach or
   * cleaning subscription the per-service query already shows does not appear a
   * second time.
   */
  const {
    data: universalSubs = [],
    isError: universalError, refetch: refetchUniversal,
  } = useQuery({
    queryKey: ["my-universal-subscriptions", userUuid],
    queryFn: async () => {
      // uuid column — a non-UUID id would 400 the query (see isUuid).
      if (!isUuid(userUuid)) return [];
      const { data, error } = await supabaseDb
        .from("provider_subscriptions")
        .select("*, providers!inner(name, archetype_key), provider_plans(name, period)")
        .eq("user_id", userUuid)
        // Legacy-backed rows mirror a row the per-service query already shows;
        // without this filter a beach or cleaning subscription appears twice.
        .is("source_service_key", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userUuid,
  });

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: cleaningSubscriptions, isLoading: cleaningSubsLoading,
    isError: cleaningError, refetch: refetchCleaning,
  } = useQuery({
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

  /**
   * Car rentals.
   *
   * They are booked rather than subscribed and live in rental_bookings, sold by
   * their own section of the app — but a customer does not think in sections.
   * They bought something from EverySub, so it belongs on the page listing what
   * they bought. `user_id` is text here and holds whatever the account is keyed
   * by, so it is matched as-is rather than cast.
   */
  const {
    data: rentalBookings = [],
    isLoading: rentalsLoading,
    isError: rentalsError,
    refetch: refetchRentals,
  } = useQuery({
    queryKey: ["my-rental-bookings-subs", userData?.id],
    enabled: !!userData?.id,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("*, rental_vehicles(name, image_url)")
        .eq("user_id", userData!.id)
        .is("deleted_at", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
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

  // ── Cancellation ───────────────────────────────────────────────────────────
  // Cancelling stops the NEXT period; access runs to end_date and the decision
  // can be undone until then, so the confirm dialog says the date out loud and
  // the card keeps a Resume button afterwards. Four services, one endpoint —
  // the slug is what the backend maps to a table.
  const [cancelTarget, setCancelTarget] = useState<
    { service: string; id: string; name: string; endsOn: string | null } | null
  >(null);

  const cancelMutation = useMutation({
    mutationFn: async ({ service, id, resume }: { service: string; id: string; resume?: boolean }) => {
      const { data, error } = await accountApi(
        `/account/${service}/subscriptions/${id}/${resume ? "resume" : "cancel"}`,
        { method: "POST" },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.resume ? "Subscription resumed." : "Subscription won't renew.");
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-all"] });
      queryClient.invalidateQueries({ queryKey: ["my-food-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["my-beach-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["my-universal-subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update the subscription."),
  });

  /**
   * The Cancel (or Resume) button for one subscription, as a card action.
   * Returns an array so a call site can spread it and get nothing when the
   * subscription is in a state where stopping means nothing.
   */
  const cancelAction = (service: string, sub: any, planName: string) => {
    const cancelled = Boolean(sub?.cancel_at_period_end);
    if (cancelled) {
      return [{
        key: "resume",
        label: "Resume",
        icon: RefreshCw,
        variant: "secondary" as const,
        onClick: () => cancelMutation.mutate({ service, id: sub.id, resume: true }),
      }];
    }
    return [{
      key: "cancel",
      label: "Cancel",
      icon: X,
      // Nobody opens this page to cancel — it stays reachable, not prominent.
      variant: "ghost" as const,
      onClick: () => setCancelTarget({
        service,
        id: sub.id,
        name: planName,
        endsOn: sub.end_date ?? sub.service_end_date ?? null,
      }),
    }];
  };

  /**
   * The same Cancel / Resume, shaped for the purchase sheet: a single quiet
   * action at the bottom instead of a pill on the card. Closes the sheet first
   * so the confirm dialog is not stacked behind it.
   */
  const cancelSheetAction = (service: string, sub: any, planName: string) => {
    const cancelled = Boolean(sub?.cancel_at_period_end);
    if (cancelled) {
      return {
        label: "Resume subscription",
        onClick: () => { setDetail(null); cancelMutation.mutate({ service, id: sub.id, resume: true }); },
      };
    }
    return {
      label: "Cancel subscription",
      destructive: true,
      onClick: () => {
        setDetail(null);
        setCancelTarget({
          service, id: sub.id, name: planName,
          endsOn: sub.end_date ?? sub.service_end_date ?? null,
        });
      },
    };
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

  // `subscription_status` is a LAGGING indicator — a nightly cron flips it.
  // Judging "active" by the raw column meant an expired package plan kept
  // showing "Active plan" with an Edit Schedule button until the cron ran, and
  // then vanished from the page completely the moment it did, taking the only
  // route to renewing it with it. `effectiveCleaningStatus` compares the
  // period end against Honduras today, which is what the admin surfaces
  // already use.
  /**
   * Subscription id → plan name, for the visit rows.
   *
   * Both cleaning subscription queries already attach `cleaning_packages`, so
   * this costs nothing; the rows just never used it. A customer holding a
   * cleaning plan and a car wash saw two lists of bare dates and times.
   */
  const cleaningPlanNameBySubId = useMemo(() => {
    const map = new Map<string, string>();
    [...(cleaningSubscriptions ?? []), ...(linkedClientSubscriptions ?? [])].forEach((s: any) => {
      const name = s?.cleaning_packages?.name;
      if (s?.id && name) map.set(String(s.id), String(name));
    });
    return map;
  }, [cleaningSubscriptions, linkedClientSubscriptions]);

  /** The plan a booking belongs to, whichever id column it carries. */
  const planNameForBooking = (b: any): string | null =>
    cleaningPlanNameBySubId.get(String(b?.subscription_id ?? b?.cleaning_subscription_id ?? "")) ?? null;

  const paidCleaningSubs = (cleaningSubscriptions ?? []).filter(
    (s) => s.payment_status === "paid" && !isOneTimeComplete(s),
  );
  /**
   * Started and never paid for.
   *
   * Everything else on this page begins from paidCleaningSubs, so these rows
   * existed in the database and nowhere in the customer's view: no record that
   * they had begun, and no way to finish. The backend has always been able to
   * issue a fresh invoice for one (/account/subscriptions/:id/invoice); only
   * admin-assigned client plans ever offered the button.
   */
  const unpaidCleaningSubs = (cleaningSubscriptions ?? []).filter((s: any) => {
    const status = String(s.subscription_status ?? "").toLowerCase();
    return s.payment_status !== "paid" && status !== "cancelled" && status !== "expired";
  });
  const activeCleaningSubs = paidCleaningSubs.filter(
    (s) => s.is_active && effectiveCleaningStatus(s) === "active",
  ).filter(matchesQuery);
  /** Ran their course but are still renewable — previously invisible. */
  const expiredCleaningSubs = paidCleaningSubs.filter(
    (s) => effectiveCleaningStatus(s) === "expired",
  ).filter(matchesQuery);

  // "Running" per service. Anything else is history.
  const isLiveFood = (s: any) => effectiveFoodStatus(s) === "active" || String(s.status).toLowerCase() === "paused";
  const isLiveBeach = (s: any) =>
    String(s.status).toLowerCase() === "active" && (!s.end_date || s.end_date >= todayHN());

  const inScope = <T,>(rows: T[], isLive: (r: T) => boolean) =>
    rows.filter((r) => (scope === "active" ? isLive(r) : !isLive(r))).filter(matchesQuery);

  const visibleFood   = inScope(foodSubscriptions as any[], isLiveFood);
  const visibleBeach  = inScope(beachSubs as any[], isLiveBeach);
  const isLiveUniversal = (s: any) =>
    String(s.status).toLowerCase() === "active" && (!s.end_date || s.end_date >= todayHN());
  const visibleUniversal = inScope(universalSubs as any[], isLiveUniversal);
  /**
   * A rental counts as live until the day it is due back — an unpaid one
   * included, because that is precisely the booking still asking to be acted on.
   */
  const isLiveRental = (b: any) =>
    String(b.status) !== "cancelled" && String(b.end_date ?? "") >= todayHN();
  const visibleRentals = inScope(rentalBookings as any[], isLiveRental);

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

  /**
   * A cleaning subscription's own visits, grouped for the purchase sheet —
   * Upcoming and History moved off the list and into the card's detail.
   */
  const upcomingBookingIds = new Set((upcomingCleaningBookings ?? []).map((b: any) => b.id));
  const bookingSessions = (subId: string) => {
    const mine = (cleaningBookings ?? []).filter(
      (b: any) => String(b?.subscription_id ?? b?.cleaning_subscription_id ?? "") === String(subId),
    );
    const dateOf = (b: any) => {
      const d = b.cleaning_available_slots?.date;
      return d ? format(new Date(d + "T00:00:00"), "EEE, MMM d, yyyy") : "—";
    };
    const timeOf = (b: any) => {
      const slot = b.cleaning_available_slots;
      return slot?.start_time ? `${format12h(slot.start_time)} – ${format12h(slot.end_time ?? "")}` : null;
    };
    const toItem = (b: any) => ({ id: String(b.id), date: dateOf(b), time: timeOf(b), status: String(b.status) });
    return [
      { label: "Upcoming", items: mine.filter((b: any) => upcomingBookingIds.has(b.id)).map(toItem) },
      { label: "History", items: mine.filter((b: any) => !upcomingBookingIds.has(b.id)).map(toItem) },
    ];
  };

  // ── One list, no tabs ────────────────────────────────────────────────────
  // The page shows every service's subscriptions together now. These roll up
  // whether anything is loading, anything errored, and whether there is any
  // content at all — so a single skeleton and a single empty state replace the
  // four per-service ones the tabs used to hide from each other.
  const hasCleaningContent =
    activeCleaningSubs.length > 0 || expiredCleaningSubs.length > 0 ||
    pendingScheduleCleaningSubs.length > 0 || unpaidCleaningSubs.length > 0 ||
    (linkedClientSubscriptions?.length ?? 0) > 0;
  const anyContent =
    visibleFood.length > 0 || visibleBeach.length > 0 ||
    visibleUniversal.length > 0 || hasCleaningContent || visibleRentals.length > 0;
  const anyLoading =
    foodSubsLoading || beachSubsLoading || cleaningSubsLoading || cleaningBookingsLoading || rentalsLoading;
  const anyError = foodError || beachError || universalError || rentalsError;

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

  // The header's search + filter row — welded to the mobile header by the
  // layout (see UserLayout headerExtra), the way the design draws it.
  const searchBar = (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-radius-md bg-inset px-3 py-2">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Subs"
          className="min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.32px] text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label={scope === "active" ? "Showing active — tap for past" : "Showing past — tap for active"}
        onClick={() => setScope(scope === "active" ? "past" : "active")}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          scope === "past" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <UserLayout title="My Subs" headerExtra={searchBar}>
      <PullToRefresh onRefresh={async () => {
        try {
          const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";
          await fetch(`${API_URL}/cron/reconcile-payments`, { method: "POST" });
        } catch { /* best effort */ }
        await queryClient.invalidateQueries();
      }}>
      <div className="app-container pb-28 pt-5">

        {/* Page title lives in the mobile header — no inline H1 needed. */}

        {/* Above the list on purpose: it is about a job that happened, not
            about one of the services below, and it disappears once answered. */}
        <div className="mb-5">
          <ReviewPromptCard />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold leading-[24px] tracking-[-0.4px] text-foreground">
            {scope === "active" ? "Plans" : "Past plans"}
          </h2>
        </div>

        {/* The tabs are gone, so the empties are one. A skeleton while the
            first rows land; a single empty state when a customer has nothing
            across every service. Each service block below hides itself when it
            has no rows, so this is the only empty state left. */}
        {anyLoading && !anyContent && <Skeleton rows={4} />}
        {!anyLoading && !anyContent && !anyError && (
          <TabEmptyState
            icon={LayoutGrid}
            title={query ? "Nothing matches your search"
              : scope === "active" ? "No active subscriptions" : "No past subscriptions"}
            subtitle={query ? "Try a different word, or clear the search."
              : scope === "active" ? "Subscribe to a plan and it shows up here."
              : "Plans that end or are cancelled show up here."}
            action={query ? undefined : { label: "Browse services", onClick: () => navigate("/discovery") }}
          />
        )}

        {/* ─── Meal plans ────────────────────────────────────────── */}
        {(foodError || visibleFood.length > 0) && (
          <div className="space-y-5">

            {foodSubsLoading ? (
              <Skeleton rows={3} />
            ) : foodError ? (
              <QueryError title="Couldn't load your meal plans" onRetry={() => refetchFood()} />
            ) : visibleFood.length === 0 ? (
              <TabEmptyState
                icon={ChefHat}
                title={scope === "active" ? "No active meal plans" : "No past meal plans"}
                subtitle={scope === "active"
                  ? "Subscribe to a weekly meal plan to see it here."
                  : "Plans that end or are cancelled show up here."}
                action={{ label: "Browse Restaurants", onClick: () => navigate("/services/food") }}
              />
            ) : (
              <SectionGroup>
                {visibleFood.map((s: any) => {
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
                        targetUrl: `/checkout/${s.meal_plan_id}?renew=${s.id}`,
                      });
                    } else {
                      navigate(`/checkout/${s.meal_plan_id}?renew=${s.id}`);
                    }
                  };
                  return (
                    <SubscriptionCard
                      key={s.id}
                      icon={UtensilsCrossed}
                      title={s.food_meal_plans?.name ?? "Meal plan"}
                      subtitle={s.started_at
                        ? formatRangeHN(s.started_at, foodEnd(s))
                        : undefined}
                      statusBadge={<StatusPill status={s.status} />}
                      metadata={<span className="tabular-nums">{formatUSD((s.weekly_price_cents || 0) * (s.commitment_weeks || 1))}</span>}
                      onClick={() => setDetail({
                        title: s.food_meal_plans?.name ?? "Meal plan",
                        provider: s.food_providers?.name ?? null,
                        status: s.status,
                        amountCents: (s.weekly_price_cents || 0) * (s.commitment_weeks || 1),
                        periodStart: s.started_at,
                        periodEnd: foodEnd(s)?.toISOString().slice(0, 10) ?? null,
                        paymentMethod: s.payment_method,
                        paymentReference: s.payment_reference,
                        purchasedAt: s.created_at,
                        facts: [
                          { label: "Commitment", value: `${s.commitment_weeks || 1} week${(s.commitment_weeks || 1) > 1 ? "s" : ""}` },
                          ...(s.weekly_price_cents ? [{ label: "Per week", value: formatUSD(s.weekly_price_cents) }] : []),
                        ],
                        cancel: cancelSheetAction("food", s, s.food_meal_plans?.name ?? "meal plan"),
                        tip: { service: "food", subscriptionRef: String(s.id), providerId: s.provider_id ?? null, providerName: s.food_providers?.name ?? null, customerName: s.customer_name ?? userData?.name ?? null },
                        review: { service: "food_provider", itemId: s.provider_id, subscriptionId: String(s.id), customerName: s.customer_name ?? userData?.name ?? null },
                        action: (s.provider_id && s.meal_plan_id)
                          ? { label: "View plan", onClick: () => navigate(`/services/food/${s.provider_id}/plans/${s.meal_plan_id}`) }
                          : undefined,
                      })}
                      actions={[
                        ...(foodCanRenew(s) ? [
                          { key: "renew", label: "Renew", icon: RefreshCw, onClick: openRenewDialog, variant: "secondary" as const },
                        ] : []),
                      ]}
                    />
                  );
                })}
              </SectionGroup>
            )}
          </div>
        )}


        {/* ─── Beach Club memberships ────────────────────────────── */}
        {(beachError || visibleBeach.length > 0) && (() => {
          const today = todayHN();
          return (
            <div className="mt-4 space-y-5">

              {beachSubsLoading ? (
                <Skeleton rows={3} />
              ) : beachError ? (
                <QueryError title="Couldn't load your memberships" onRetry={() => refetchBeach()} />
              ) : visibleBeach.length === 0 ? (
                <TabEmptyState
                  icon={Waves}
                  title={scope === "active" ? "No active memberships" : "No past memberships"}
                  subtitle={scope === "active"
                    ? "Subscribe to the Beach Club to access the gym, pools and courts."
                    : "Memberships that end or are cancelled show up here."}
                  action={{ label: "Browse Plans", onClick: () => navigate("/services/beach-club") }}
                />
              ) : (
                <SectionGroup>
                  {visibleBeach.map((s: any) => {
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
                          targetUrl: `/checkout/${s.plan_id}?renew=${s.id}`,
                        });
                      } else {
                        navigate(`/checkout/${s.plan_id}?renew=${s.id}`);
                      }
                    };

                    return (
                      <SubscriptionCard
                        key={s.id}
                        icon={Waves}
                        title={s.plan_name || "Beach Club Membership"}
                        subtitle={<>
                          {s.people || 1} {(s.people || 1) === 1 ? "person" : "people"}
                          {s.start_date && s.end_date && ` · ${formatRangeHN(s.start_date, s.end_date)}`}
                        </>}
                        metadata={<span className="tabular-nums">{formatUSD(s.total_cents || 0)}</span>}
                        onClick={() => setDetail({
                          title: s.plan_name || "Beach Club Membership",
                          provider: "Beach Club",
                          status: label,
                          amountCents: s.total_cents || 0,
                          periodStart: s.start_date,
                          periodEnd: s.end_date,
                          paymentMethod: s.payment_method,
                          paymentReference: s.payment_reference,
                          purchasedAt: s.created_at,
                          facts: [{ label: "Guests", value: `${s.people || 1} ${(s.people || 1) === 1 ? "person" : "people"}` }],
                          action: s.plan_id ? { label: "View plan", onClick: () => navigate(`/services/entertainment/plans/${s.plan_id}`) } : undefined,
                          cancel: cancelSheetAction("beach", s, s.plan_name ?? "membership"),
                          tip: { service: "beach", subscriptionRef: String(s.id), providerId: s.provider_id ?? null, providerName: "Beach Club", customerName: userData?.name ?? null },
                          review: { service: "beach", itemId: s.plan_id, subscriptionId: String(s.id), customerName: userData?.name ?? null },
                        })}
                        statusBadge={
                          <StatusPill status={label} />
                        }
                        actions={[
                          // Booking a court is something this membership lets
                          // you do — it was a page-wide button that appeared
                          // when any membership was active and said nothing
                          // about which one.
                          ...(st === "active" && !expired ? [
                            { key: "court", label: "Book a court", icon: LandPlot, onClick: () => navigate("/services/beach-club/courts"), variant: "primary" as const },
                          ] : []),
                          ...(canRenew ? [
                            { key: "renew", label: "Renew", icon: RefreshCw, onClick: openRenewDialog, variant: "secondary" as const },
                          ] : []),
                        ]}
                      />
                    );
                  })}
                </SectionGroup>
              )}
            </div>
          );
        })()}

        {/* ─── Universal provider_subscriptions for the open tab ─────
            Rendered under whichever service is open, not in a bucket of its
            own. Silent when there is nothing: every tab already has its own
            empty state, and a second one underneath reads as a fault. */}
        {(universalError || visibleUniversal.length > 0) && (
          <div className="mt-4 space-y-5">
            {universalError ? (
              <QueryError title="Couldn't load your subscriptions" onRetry={() => refetchUniversal()} />
            ) : (
              <SectionGroup>
                {visibleUniversal.map((s: any) => {
                  const today = todayHN();
                  const expired = s.end_date && s.end_date < today;
                  const st = String(s.status).toLowerCase();
                  const label = st === "active" && !expired ? "active" : expired ? "expired" : st;
                  // The joined rows are the live truth; metadata is the snapshot
                  // taken at purchase. Prefer live, fall back to the snapshot so
                  // a deleted plan still says what was bought.
                  const planName = s.provider_plans?.name ?? s.metadata?.plan_name ?? "Subscription";
                  const providerName = s.providers?.name ?? s.metadata?.provider_name ?? null;
                  return (
                    <SubscriptionCard
                      key={s.id}
                      icon={LayoutGrid}
                      title={planName}
                      subtitle={<>
                        {providerName}
                        {s.start_date && s.end_date && `${providerName ? " · " : ""}${formatRangeHN(s.start_date, s.end_date)}`}
                      </>}
                      metadata={<span className="tabular-nums">{formatUSD(s.price_cents || 0)}</span>}
                      onClick={() => setDetail({
                        title: planName,
                        provider: providerName,
                        status: label,
                        amountCents: s.price_cents || 0,
                        periodStart: s.start_date,
                        periodEnd: s.end_date,
                        paymentMethod: s.payment_method,
                        paymentReference: s.payment_reference,
                        purchasedAt: s.created_at,
                        facts: s.provider_plans?.period ? [{ label: "Billing", value: String(s.provider_plans.period) }] : [],
                        action: s.plan_id ? { label: "View plan", onClick: () => navigate(`/services/${s.providers?.archetype_key ?? "services"}/plans/${s.plan_id}`) } : undefined,
                        cancel: cancelSheetAction("plan", s, s.provider_plans?.name ?? "subscription"),
                        tip: { service: "plan", subscriptionRef: String(s.id), providerId: s.provider_id ?? s.providers?.id ?? null, providerName: providerName, customerName: userData?.name ?? null },
                        review: { service: "plan", subscriptionId: String(s.id), providerId: s.provider_id ?? s.providers?.id ?? null, customerName: userData?.name ?? null },
                      })}
                      statusBadge={<StatusPill status={label} />}
                      actions={st === "cancelled" ? [] : [
                        ...(s.plan_id ? [{
                          key: "renew",
                          label: "Renew",
                          icon: RefreshCw,
                          variant: "secondary" as const,
                          onClick: () => navigate(`/checkout/${s.plan_id}?renew=${s.id}`),
                        }] : []),
                      ]}
                    />
                  );
                })}
              </SectionGroup>
            )}
          </div>
        )}

        {/* ─── Car rentals ───────────────────────────────────────── */}
        {(rentalsError || visibleRentals.length > 0) && (
          <div className="mt-4 space-y-5">
            {rentalsError ? (
              <QueryError title="Couldn't load your car rentals" onRetry={() => refetchRentals()} />
            ) : (
              <SectionGroup>
                {visibleRentals.map((b: any) => {
                  const paid = b.payment_status === "paid";
                  const cancelled = String(b.status) === "cancelled";
                  const label = cancelled ? "cancelled" : paid ? "confirmed" : "pending";
                  const carName = b.rental_vehicles?.name ?? "Car rental";
                  // The car section is part of this app, so opening a rental
                  // is a route change — no reload, no lost scroll position.
                  const openBooking = () => navigate(carPath(`booking/${b.id}`));
                  return (
                    <SubscriptionCard
                      key={b.id}
                      icon={CarFront}
                      image={b.rental_vehicles?.image_url ?? null}
                      title={carName}
                      subtitle={<>
                        {formatRangeHN(b.start_date, b.end_date)}
                        {` · ${b.rental_days} day${b.rental_days > 1 ? "s" : ""}`}
                      </>}
                      metadata={<span className="tabular-nums">{formatUSD(b.total_cents || 0)}</span>}
                      statusBadge={<StatusPill status={label} />}
                      onClick={openBooking}
                      actions={cancelled ? [] : paid ? [] : [{
                        key: "pay",
                        label: "Complete payment",
                        variant: "primary" as const,
                        onClick: openBooking,
                      }]}
                    />
                  );
                })}
              </SectionGroup>
            )}
          </div>
        )}

        {/* ─── Cleaning ──────────────────────────────────────────── */}
        {hasCleaningContent && (
        <div className="mt-4 space-y-5">

            {/* Skeleton waits only on the SUBSCRIPTIONS query — not the
                bookings/sessions one. The cards don't need bookings to render
                (bookings only refine one-time-cleaning completion and feed the
                detail sheet's sessions), so gating the whole section on
                cleaningBookingsLoading left a paid cleaning subscription stuck
                as a skeleton whenever that secondary query was slow to settle. */}
            {cleaningSubsLoading ? (
              <Skeleton rows={3} />
            ) : cleaningError ? (
              <QueryError title="Couldn't load your cleaning plans" onRetry={() => refetchCleaning()} />
            ) : (
              <>
                {/* ── Pending schedule alert ── */}
                {pendingScheduleCleaningSubs.length > 0 && (
                  <section className="space-y-2">
                    <SectionOverline label="Action needed" tone="warning" />
                    {pendingScheduleCleaningSubs.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-4 rounded-radius-md border border-warning/30 bg-warning/5 px-4 py-3"
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

                {/* ── Payment never finished ──
                    These were invisible: every list on this page starts from
                    paidCleaningSubs, so a customer who closed the tab during an
                    on-chain payment saw no trace of the subscription they had
                    started — and the only "Pay now" on the page belonged to
                    admin-assigned client plans. Two were sitting like this for
                    nine days. */}
                {unpaidCleaningSubs.length > 0 && (
                  <section className="space-y-2">
                    <SectionOverline label="Waiting for payment" tone="warning" />
                    {unpaidCleaningSubs.map((sub: any) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-4 rounded-radius-md border border-warning/30 bg-warning/5 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">
                            {sub.cleaning_packages?.name ?? "Cleaning plan"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Payment wasn't completed — nothing has been charged.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="shrink-0"
                          onClick={() => payMutation.mutate(sub.id)}
                          loading={payMutation.isPending && payMutation.variables === sub.id}
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Finish payment
                        </Button>
                      </div>
                    ))}
                  </section>
                )}

                {/* ── Active plan ── */}
                {(activeCleaningSubs.length > 0 || linkedClientSubscriptions.length > 0) && (
                  <section className="space-y-2">
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
                            targetUrl: `/checkout/${sub.package_id}?renew=${sub.id}`,
                          });
                        } else {
                          navigate(`/checkout/${sub.package_id}?renew=${sub.id}`);
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
                          title={(sub as any).cleaning_packages?.name}
                          subtitle={(sub as any).recurring_day_of_week != null
                            ? "Weekly schedule active"
                            : `${sub.cleanings_remaining ?? 0} cleanings remaining`}
                          onClick={() => setDetail({
                            title: (sub as any).cleaning_packages?.name ?? "Cleaning plan",
                            status: effectiveCleaningStatus(sub),
                            amountCents: sub.total_price_cents
                              ?? (sub.monthly_price_cents || 0) * (sub.billing_period_months || 1),
                            periodStart: sub.service_start_date ?? sub.start_date,
                            periodEnd: sub.service_end_date ?? sub.end_date,
                            paymentMethod: (sub as any).payment_method,
                            paymentReference: (sub as any).payment_reference,
                            purchasedAt: sub.created_at,
                            facts: [
                              ...(sub.billing_period_months ? [{ label: "Billing", value: `${sub.billing_period_months} month${sub.billing_period_months > 1 ? "s" : ""}` }] : []),
                              ...(sub.cleanings_remaining != null ? [{ label: "Cleanings left", value: String(sub.cleanings_remaining) }] : []),
                            ],
                            cancel: cancelSheetAction("cleaning", sub, (sub as any).cleaning_packages?.name ?? "cleaning plan"),
                            tip: { service: "cleaning", subscriptionRef: String(sub.id), providerId: null, providerName: (sub as any).cleaning_packages?.name ?? null, customerName: userData?.name ?? null },
                            review: { service: "cleaning", itemId: sub.package_id, subscriptionId: String(sub.id), customerName: userData?.name ?? null },
                            action: sub.package_id ? { label: "View plan", onClick: () => navigate(`/services/cleaning/plans/${encodeURIComponent(sub.package_id)}`) } : undefined,
                            sessions: bookingSessions(sub.id),
                          })}
                          statusBadge={(sub as any).payment_method
                            ? <PaymentMethodBadge method={(sub as any).payment_method} />
                            : undefined}
                          actions={actions}
                        />
                      );
                    })}
                    {linkedClientSubscriptions.map((sub: any) => {
                      const isPending = sub.payment_status !== "paid";
                      return (
                        <SubscriptionCard
                          key={sub.id}
                          icon={SparklesIcon}
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

                {/* ── Expired plans ──
                    Cleaning was the only tab that hid expired rows: once the
                    nightly cron flipped the status they disappeared, and with
                    them the only route to renewing. Food and Beach have always
                    kept them visible with a Renew button. */}
                {expiredCleaningSubs.length > 0 && (
                  <section className="space-y-2">
                    <SectionOverline label="Expired" count={expiredCleaningSubs.length} />
                    {expiredCleaningSubs.map((sub) => {
                      const openRenewDialog = () => {
                        if (!sub.package_id) return;
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
                            targetUrl: `/checkout/${sub.package_id}?renew=${sub.id}`,
                          });
                        } else {
                          navigate(`/checkout/${sub.package_id}?renew=${sub.id}`);
                        }
                      };
                      return (
                        <SubscriptionCard
                          key={sub.id}
                          icon={SparklesIcon}
                          title={(sub as any).cleaning_packages?.name ?? "Cleaning plan"}
                          subtitle={sub.service_start_date || sub.start_date
                            ? formatRangeHN(sub.service_start_date || sub.start_date, sub.service_end_date || sub.end_date)
                            : undefined}
                          statusBadge={<StatusPill status="expired" />}
                          metadata={<span className="tabular-nums">{formatUSD((sub.monthly_price_cents || 0) * (sub.billing_period_months || 1))}</span>}
                          onClick={() => setDetail({
                            title: (sub as any).cleaning_packages?.name ?? "Cleaning plan",
                            status: "expired",
                            amountCents: sub.total_price_cents
                              ?? (sub.monthly_price_cents || 0) * (sub.billing_period_months || 1),
                            periodStart: sub.service_start_date ?? sub.start_date,
                            periodEnd: sub.service_end_date ?? sub.end_date,
                            paymentMethod: (sub as any).payment_method,
                            paymentReference: (sub as any).payment_reference,
                            purchasedAt: sub.created_at,
                            facts: sub.billing_period_months
                              ? [{ label: "Billing", value: `${sub.billing_period_months} month${sub.billing_period_months > 1 ? "s" : ""}` }]
                              : [],
                            action: sub.package_id ? { label: "View plan", onClick: () => navigate(`/services/cleaning/plans/${encodeURIComponent(sub.package_id)}`) } : undefined,
                            tip: { service: "cleaning", subscriptionRef: String(sub.id), providerId: null, providerName: (sub as any).cleaning_packages?.name ?? null, customerName: userData?.name ?? null },
                            review: { service: "cleaning", itemId: sub.package_id, subscriptionId: String(sub.id), customerName: userData?.name ?? null },
                            sessions: bookingSessions(sub.id),
                          })}
                          actions={sub.package_id ? [
                            { key: "renew", label: "Renew", icon: RefreshCw, onClick: openRenewDialog, variant: "primary" as const },
                          ] : []}
                        />
                      );
                    })}
                  </section>
                )}

                {/* ── Door-access reminder alert ── */}
                {(activeCleaningSubs.length > 0 || linkedClientSubscriptions.length > 0) && (
                  <div className="flex items-start gap-3 rounded-radius-md border border-primary/20 bg-primary/5 p-4">
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
                {activeCleaningSubs.length === 0 && expiredCleaningSubs.length === 0 && pendingScheduleCleaningSubs.length === 0 && unpaidCleaningSubs.length === 0 && linkedClientSubscriptions.length === 0 && (
                  <TabEmptyState
                    icon={SparklesIcon}
                    title="No active cleaning plan"
                    subtitle="Choose a cleaning plan to start booking weekly sessions."
                    action={{ label: "View Cleaning Plans", onClick: () => navigate("/services/cleaning") }}
                  />
                )}

                {/* ── Upcoming bookings ── */}
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
              <StatusPill status={viewBooking.status} />
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
              <CleaningRateAndTip
                bookingId={viewBooking.id}
                subscriptionId={viewBooking.subscription_id ?? viewBooking.cleaning_subscription_id ?? null}
                customerName={userData?.name ?? userData?.display_name}
              />
            )}
          </div>
        )}
      </ResponsiveDialog>

      {/* ── Cancel a subscription ──
          The date is the whole point of this dialog: "cancel" reads as "lose
          it now" unless we say otherwise, and the customer has paid through
          that day. */}
      <ResponsiveDialog
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title={<span className="flex items-center gap-2"><X className="h-5 w-5 text-destructive" />Cancel {cancelTarget?.name}?</span>}
        description={
          cancelTarget?.endsOn
            ? `It won't renew. You keep everything until ${formatDateHN(cancelTarget.endsOn)}, and you can undo this at any time before then.`
            : "It won't renew. You can undo this at any time before it ends."
        }
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCancelTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={cancelMutation.isPending}
              onClick={() => cancelTarget && cancelMutation.mutate({ service: cancelTarget.service, id: cancelTarget.id })}
            >
              {cancelMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Cancel subscription
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Nothing is charged again and nothing is refunded — this simply stops the next period.
        </p>
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
              min={todayHN()}
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
                    ? formatUSD(paymentDialog.amount_cents)
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
      <SubscriptionDetailSheet detail={detail} onClose={() => setDetail(null)} />
      </PullToRefresh>
    </UserLayout>
  );
};

export default MySubscriptions;
