import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { StatusPill } from "@/components/patterns/StatusPill";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, isPendingPayment } from "@/lib/subscriptionApprove";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { WorkspaceCard, WorkspaceEmpty, WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { CustomerPhone, pickPhone } from "@/components/patterns/CustomerPhone";
import { SaleOriginBadge } from "@/components/patterns/SaleOrigin";
import { cancelCleaningBookings } from "@/lib/cleaning/cancelBooking";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";
import { MoreHorizontal, PauseCircle, PlayCircle, RefreshCcw, XCircle } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Who is subscribed to this business.
 *
 * The three services answered this question with three different screens: two
 * compact card lists written for the workspace, and — for the beach club — a
 * whole admin page with a data table, its own search and its own pagination
 * mounted inside a tab. Same question, same tab, colossally different answer
 * depending on which business an admin happened to open.
 *
 * One list for all of them. What differs per service is where the rows are
 * and what its status column is called — a table below, not a screen.
 */

/** Where a service keeps its subscriptions, and what it calls a status. */
const SHAPES: Record<string, { table: string; statusCol: string; approve: "cleaning" | "food" | "beach" }> = {
  cleaning: { table: "cleaning_subscriptions", statusCol: "subscription_status", approve: "cleaning" },
  food:     { table: "food_subscriptions",     statusCol: "status",              approve: "food" },
  beach:    { table: "provider_subscriptions", statusCol: "status",              approve: "beach" },
};
const shapeOf = (sourceKey: string) =>
  SHAPES[sourceKey === "beach_club" ? "beach" : sourceKey] ?? SHAPES.beach;

export interface SubscriberRow {
  id: string;
  /** What they bought. */
  plan: string;
  customerName: string | null;
  customerEmail: string | null;
  start: string | null;
  end: string | null;
  amountCents: number;
  /** Everything this subscription has been charged, renewals included. */
  lifetimeCents?: number;
  status: string;
  paymentStatus: string | null;
  /** One line of whatever this service cares about — a headcount, an address. */
  detail?: string | null;
  phone?: string | null;
  /** How long one paid period runs, in this service's own unit. */
  periodLength?: number;
  periodsPaid?: number;
  /** Tells a walk-in sale from a platform one — the badge reads it. */
  paymentReference?: string | null;
}

export function SubscribersList({ providerId, legacyId, sourceKey }: {
  /** Universal `providers.id` — where beach and universal rows hang. */
  providerId: string;
  /** Per-service id, for the services whose subscriptions still hang off it. */
  legacyId?: string;
  sourceKey: string;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [q, setQ] = useState("");
  const KEY = ["provider-subscribers", providerId, legacyId ?? "", sourceKey] as const;
  const shape = shapeOf(sourceKey);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!providerId,
    queryFn: () => fetchSubscribers(providerId, legacyId ?? providerId, sourceKey),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.customerName, r.customerEmail, r.plan].some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  /**
   * Three groups, because an owner reads this list with three questions: who
   * is running, whose period is about to lapse, and who is over. A flat list
   * hides the middle one, which is the only group that needs acting on.
   */
  const groups = useMemo(() => {
    const soon = addDaysISO(todayHN(), 7);
    const running: SubscriberRow[] = [];
    const ending: SubscriberRow[] = [];
    const past: SubscriberRow[] = [];
    for (const r of filtered) {
      if (r.status !== "active") { past.push(r); continue; }
      const end = (r.end ?? "").slice(0, 10);
      (end && end <= soon ? ending : running).push(r);
    }
    return [
      { key: "ending", label: "Ending within a week", rows: ending },
      { key: "active", label: "Active", rows: running },
      { key: "past", label: "Past", rows: past },
    ].filter((g) => g.rows.length);
  }, [filtered]);

  const approve = async (row: SubscriberRow) => {
    try {
      await approvePayment(shape.approve, row.id, { adminUserId: userData?.id });
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error((e as Error).message || "Could not mark it paid");
    }
  };

  /**
   * Off-platform renewal: somebody paid outside the platform and the period
   * has to move. Continuous by construction — the next period starts the day
   * after the last one ended, or today if that is already past, so a late
   * renewal never silently backdates access.
   *
   * It was written twice, once per service, differing only in which columns
   * carry the period.
   */
  const renew = async (row: SubscriberRow) => {
    const today = todayHN();
    const prevEnd = (row.end ?? "").slice(0, 10);
    const start = prevEnd && prevEnd >= today ? addDaysISO(prevEnd, 1) : today;
    const length = Math.max(row.periodLength || 1, 1);

    let patch: Record<string, unknown>;
    if (sourceKey === "cleaning") {
      const end = addMonthsISO(start, length);
      patch = {
        subscription_status: "active", is_active: true,
        payment_status: "paid", payment_method: "manual",
        service_start_date: start, service_end_date: end, paid_until: end, end_date: end,
      };
    } else if (sourceKey === "food") {
      patch = {
        status: "active", paused_at: null, cancelled_at: null,
        started_at: start, end_date: addDaysISO(start, length * 7),
        payment_status: "paid", payment_method: "manual",
        periods_paid: (row.periodsPaid || 1) + 1,
        updated_at: new Date().toISOString(),
      };
    } else {
      patch = {
        status: "active",
        payment_status: "paid", payment_method: "manual",
        start_date: start, end_date: addMonthsISO(start, length),
        periods_paid: (row.periodsPaid || 1) + 1,
        updated_at: new Date().toISOString(),
      };
    }

    const { error } = await supabaseDb.from(shape.table).update(patch).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renewed — payment recorded", sourceKey === "cleaning" ? {
      // The recurrence engine seeds visits on create, not on renew.
      description: "Add visits for the new period from the Bookings tab.",
    } : undefined);
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["provider-analytics"] });
    qc.invalidateQueries({ queryKey: ["unified-bookings"] });
  };

  /**
   * Pause, resume, cancel. The word for "running" is `active` in every one of
   * these tables; only the column it sits in differs, which is why this is one
   * function and not three screens.
   */
  const setStatus = async (row: SubscriberRow, next: "active" | "paused" | "cancelled") => {
    const patch: Record<string, unknown> = {
      [shape.statusCol]: next,
      updated_at: new Date().toISOString(),
    };
    // Food records WHEN it was paused, and clears that on resume.
    if (sourceKey === "food") patch.paused_at = next === "paused" ? todayHN() : null;

    const { error } = await supabaseDb.from(shape.table).update(patch).eq("id", row.id);
    if (error) { toast.error(error.message); return; }

    /**
     * Cancelling a cleaning subscription has to cancel the visits it booked.
     *
     * Each future visit is holding a seat in a slot; flipping the
     * subscription's status alone leaves them booked for ever and those slots
     * looking permanently full. This is why the cleaning list could not simply
     * be replaced by a generic one that writes a column.
     */
    if (next === "cancelled" && sourceKey === "cleaning") {
      const { data: future } = await supabaseDb
        .from("cleaning_bookings")
        .select("id, cleaning_available_slots!inner(date)")
        .eq("subscription_id", row.id)
        .eq("status", "booked")
        .gte("cleaning_available_slots.date", todayHN());
      const ids = (future ?? []).map((b: any) => b.id);
      if (ids.length) await cancelCleaningBookings(supabaseDb, ids);
    }
    toast.success(next === "cancelled" ? "Cancelled" : next === "paused" ? "Paused" : "Resumed");
    qc.invalidateQueries({ queryKey: KEY });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Subscribers"
        subtitle={`${rows.length} in total · ${rows.filter((r) => r.status === "active").length} active`}
        action={
          <div className="relative w-[200px] shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="h-9 pl-9"
            />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <WorkspaceCard>
          <WorkspaceEmpty>
            {rows.length === 0 ? "Nobody has subscribed yet." : "Nobody matches that."}
          </WorkspaceEmpty>
        </WorkspaceCard>
      ) : (
        groups.flatMap((g) => [
          <p key={g.key} className="px-1 pt-3 text-[14px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label} · {g.rows.length}
          </p>,
          ...g.rows.map((r) => (
          <article key={r.id} className="flex items-center gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold leading-[22px] text-foreground">
                  {r.customerName || r.customerEmail || "Customer"}
                </span>
                <StatusPill status={r.status} />
                <SaleOriginBadge paymentReference={r.paymentReference ?? null} />
                {isPendingPayment({ payment_status: r.paymentStatus }) && (
                  <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-[12px]"
                    onClick={() => approve(r)}>
                    Mark paid
                  </Button>
                )}
              </div>
              <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">
                {r.plan}
                {r.start && r.end && ` · ${formatDateHN(r.start)} → ${formatDateHN(r.end)}`}
              </p>
              {r.phone && <CustomerPhone phone={r.phone} className="mt-0.5" />}
              {r.detail && (
                <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">{r.detail}</p>
              )}
            </div>
            <span className="shrink-0 text-right">
              <span className="block text-[16px] font-semibold tabular-nums text-foreground">
                {formatUSD(r.amountCents)}
              </span>
              {/* Renewals, said once: the period above, the relationship here. */}
              {(r.periodsPaid ?? 1) > 1 && (
                <span className="block text-[12px] leading-[16px] tabular-nums text-muted-foreground">
                  ×{r.periodsPaid} · {formatUSD(r.lifetimeCents ?? r.amountCents * (r.periodsPaid ?? 1))} total
                </span>
              )}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => renew(r)}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Renew — paid off platform
                </DropdownMenuItem>
                {r.status === "active" && (
                  <DropdownMenuItem onClick={() => setStatus(r, "paused")}>
                    <PauseCircle className="mr-2 h-4 w-4" /> Pause
                  </DropdownMenuItem>
                )}
                {r.status === "paused" && (
                  <DropdownMenuItem onClick={() => setStatus(r, "active")}>
                    <PlayCircle className="mr-2 h-4 w-4" /> Resume
                  </DropdownMenuItem>
                )}
                {r.status !== "cancelled" && (
                  <DropdownMenuItem className="text-destructive" onClick={() => setStatus(r, "cancelled")}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </article>
          )),
        ])
      )}
    </div>
  );
}

/**
 * Where the subscriptions are. Beach memberships and universal plans both live
 * on `provider_subscriptions`; the difference is only which rows belong to
 * this business.
 */
async function fetchSubscribers(providerId: string, legacyId: string, sourceKey: string): Promise<SubscriberRow[]> {
  if (sourceKey === "cleaning") return fetchCleaning(legacyId);
  if (sourceKey === "food") return fetchFood(legacyId);
  return fetchUniversal(providerId, sourceKey);
}

/** Cleaning: the subscription hangs off the package, the package off the provider. */
async function fetchCleaning(legacyProviderId: string): Promise<SubscriberRow[]> {
  const { data: pkgs } = await supabaseDb
    .from("cleaning_packages").select("id,name").eq("provider_id", legacyProviderId);
  const names = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));
  if (!names.size) return [];
  const { data } = await supabaseDb
    .from("cleaning_subscriptions")
    .select("id,package_id,user_id,subscription_status,payment_status,payment_reference,customer_whatsapp,total_price_cents,billing_period_months,service_start_date,service_end_date,paid_until,start_date,end_date,apartment_note")
    .in("package_id", [...names.keys()])
    .order("service_start_date", { ascending: false });
  const rows = (data ?? []) as any[];
  const users = await fetchUsersByIds(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const u = users.get(String(r.user_id));
    return {
      id: r.id,
      plan: names.get(r.package_id) ?? "Cleaning plan",
      customerName: u?.display_name ?? u?.name ?? null,
      customerEmail: u?.email ?? null,
      start: r.service_start_date ?? r.start_date ?? null,
      // Renewal continues from what has actually been paid for.
      end: r.paid_until ?? r.service_end_date ?? r.end_date ?? null,
      amountCents: r.total_price_cents ?? 0,
      status: String(r.subscription_status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: r.apartment_note ?? null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
      periodLength: Number(r.billing_period_months) || 1,
    };
  });
}

/** Food: the subscription names its provider and its meal plan directly. */
async function fetchFood(legacyProviderId: string): Promise<SubscriberRow[]> {
  const { data } = await supabaseDb
    .from("food_subscriptions")
    .select("id,meal_plan_id,user_id,status,payment_status,payment_reference,customer_whatsapp,weekly_price_cents,commitment_weeks,periods_paid,started_at,end_date,delivery_address,customer_name")
    .eq("provider_id", legacyProviderId)
    .order("started_at", { ascending: false });
  const rows = (data ?? []) as any[];
  const planIds = [...new Set(rows.map((r) => r.meal_plan_id).filter(Boolean))];
  const { data: plans } = planIds.length
    ? await supabaseDb.from("food_meal_plans").select("id,name").in("id", planIds)
    : { data: [] as any[] };
  const names = new Map((plans ?? []).map((p: any) => [p.id, p.name]));
  const users = await fetchUsersByIds(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const u = users.get(String(r.user_id));
    /**
     * What this row is worth, and what it charged.
     *
     * The list showed lifetime value — weekly × committed weeks × periods paid
     * — next to the dates of ONE period, so a renewed week-long subscription
     * read "$270 · Aug 4 → Aug 11" for a week that cost $135. The figure is the
     * period's now; the total follows it when there has been more than one.
     */
    const periods = Math.max(Number(r.periods_paid) || 1, 1);
    const perPeriodCents = (r.weekly_price_cents ?? 0) * (r.commitment_weeks || 1);
    return {
      id: r.id,
      plan: names.get(r.meal_plan_id) ?? "Meal plan",
      customerName: r.customer_name ?? u?.display_name ?? u?.name ?? null,
      customerEmail: u?.email ?? null,
      start: r.started_at ?? null,
      end: r.end_date ?? null,
      amountCents: perPeriodCents,
      lifetimeCents: perPeriodCents * periods,
      status: String(r.status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: r.delivery_address ?? null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
      periodLength: Number(r.commitment_weeks) || 1,
      periodsPaid: Number(r.periods_paid) || 1,
    };
  });
}

async function fetchUniversal(providerId: string, sourceKey: string): Promise<SubscriberRow[]> {
  const isBeach = sourceKey === "beach" || sourceKey === "beach_club";
  let query = supabaseDb
    .from("provider_subscriptions")
    .select("id, user_id, status, payment_status, payment_reference, customer_whatsapp, start_date, end_date, price_cents, periods_paid, metadata, provider_plans(name)")
    .eq("provider_id", providerId)
    .order("start_date", { ascending: false });
  query = isBeach
    ? query.eq("source_service_key", "beach")
    // A universal-only business has no source at all; the rows that carry one
    // belong to a legacy service and are that service's business.
    : query.is("source_service_key", null);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const users = await fetchUsersByIds(rows.map((r) => r.user_id).filter(Boolean));

  return rows.map((r) => {
    const meta = r.metadata ?? {};
    const user = users.get(String(r.user_id));
    const people = Number(meta.people) || 0;
    return {
      id: r.id,
      plan: meta.plan_name ?? r.provider_plans?.name ?? "Subscription",
      customerName: meta.customer_name ?? user?.display_name ?? user?.name ?? null,
      customerEmail: meta.customer_email ?? user?.email ?? null,
      start: r.start_date ?? null,
      end: r.end_date ?? null,
      amountCents: r.price_cents ?? 0,
      status: String(r.status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: people > 1 ? `${people} people` : people === 1 ? "1 person" : null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
      // A membership runs a month at a time.
      periodLength: 1,
      periodsPaid: Number(r.periods_paid) || 1,
    };
  });
}
