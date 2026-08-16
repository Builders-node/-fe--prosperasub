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
import { todayHN } from "@/lib/timezone";
import { MoreHorizontal, PauseCircle, PlayCircle, XCircle } from "lucide-react";
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
  status: string;
  paymentStatus: string | null;
  /** One line of whatever this service cares about — a headcount, an address. */
  detail?: string | null;
  phone?: string | null;
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

  const active = filtered.filter((r) => r.status === "active");
  const rest = filtered.filter((r) => r.status !== "active");

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
        [...active, ...rest].map((r) => (
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
            <span className="shrink-0 text-[16px] font-semibold tabular-nums text-foreground">
              {formatUSD(r.amountCents)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
        ))
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
    .select("id,package_id,user_id,subscription_status,payment_status,payment_reference,customer_whatsapp,total_price_cents,service_start_date,service_end_date,start_date,end_date,apartment_note")
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
      end: r.service_end_date ?? r.end_date ?? null,
      amountCents: r.total_price_cents ?? 0,
      status: String(r.subscription_status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: r.apartment_note ?? null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
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
    const weeks = (r.commitment_weeks || 1) * (r.periods_paid || 1);
    return {
      id: r.id,
      plan: names.get(r.meal_plan_id) ?? "Meal plan",
      customerName: r.customer_name ?? u?.display_name ?? u?.name ?? null,
      customerEmail: u?.email ?? null,
      start: r.started_at ?? null,
      end: r.end_date ?? null,
      amountCents: (r.weekly_price_cents ?? 0) * weeks,
      status: String(r.status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: r.delivery_address ?? null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
    };
  });
}

async function fetchUniversal(providerId: string, sourceKey: string): Promise<SubscriberRow[]> {
  const isBeach = sourceKey === "beach" || sourceKey === "beach_club";
  let query = supabaseDb
    .from("provider_subscriptions")
    .select("id, user_id, status, payment_status, payment_reference, customer_whatsapp, start_date, end_date, price_cents, metadata, provider_plans(name)")
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
    };
  });
}
