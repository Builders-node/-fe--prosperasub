import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, ChevronRight, ExternalLink } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { useTableSort } from "@/lib/table/useTableSort";
import { SortHeader } from "@/components/ui/sort-header";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/patterns/StatusPill";
import { formatUSD } from "@/lib/pricing";

interface Provider { id: string; name: string; archetype_key: string | null; }
interface Plan {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  period: string;
  status: string;
  sort_order: number;
  source_service_key: string | null;
  /** Set on a variant — the offer it belongs to. */
  parent_plan_id: string | null;
  /** Which value this variant picks on each of its offer's axes. */
  option_keys: Record<string, string> | null;
}

export interface MarketplacePlansProps {
  /** Mounted as a tab inside the service detail page — skip the page chrome. */
  embedded?: boolean;
  /** Locks the list to one service. The service filter is hidden when set. */
  archetypeKey?: string;
}

/**
 * Universal admin list of every subscription/membership/meal plan. Filters by
 * SERVICE (the archetype) and provider — categories were retired.
 */
const MarketplacePlans = ({ embedded = false, archetypeKey }: MarketplacePlansProps = {}) => {
  const { archetypes } = useServiceArchetypes(false);
  // When scoped by the parent route the archetype isn't the admin's to change,
  // so it's derived rather than state — otherwise navigating between two
  // services would keep showing the first one's plans.
  const [serviceFilter, setServiceFilter] = useState("all");
  const service = archetypeKey ?? serviceFilter;
  const [providerId, setProviderId] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: providers = [] } = useQuery({
    queryKey: ["marketplace-providers-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers")
        .select("id, name, archetype_key").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Provider[];
    },
  });
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const providersInService = useMemo(() => (
    service === "all" ? providers : providers.filter((p) => p.archetype_key === service)
  ), [providers, service]);

  const { data: plans = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["marketplace-plans"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_plans")
        // Hard cap at 200 rows — cheap safety net until real pagination lands.
        .select("*").order("sort_order", { ascending: true }).order("name", { ascending: true })
        .range(0, 199);
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  /** plan id → how many variants hang off it. */
  const variantCounts = plans.reduce<Record<string, number>>((acc, plan) => {
    if (plan.parent_plan_id) acc[plan.parent_plan_id] = (acc[plan.parent_plan_id] ?? 0) + 1;
    return acc;
  }, {});

  // `"unassigned"` = the plans of providers whose archetype_key went null when a
  // service was deleted (FK is ON DELETE SET NULL). Matching it against
  // archetype_key directly would never hit, hiding those plans entirely.
  const matchesService = (prov: Provider | undefined) => (
    service === "all" ? true
      : service === "unassigned" ? !prov?.archetype_key
      : prov?.archetype_key === service
  );

  /**
   * An offer and its variants are one product: the list shows the offer, and
   * its variants open under it on the arrow. They used to be rows of their
   * own, so "Meal Plan" and its six combinations read as seven products.
   */
  const byId = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Plan[]>();
    for (const p of plans) {
      // A variant whose offer is gone stays a row of its own rather than vanish.
      if (!p.parent_plan_id || !byId.has(p.parent_plan_id)) continue;
      const list = m.get(p.parent_plan_id) ?? [];
      list.push(p);
      m.set(p.parent_plan_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.price_cents - b.price_cents);
    return m;
  }, [plans, byId]);

  const q = search.trim().toLowerCase();
  const matches = (p: Plan) => {
    const prov = providerById.get(p.provider_id);
    if (!matchesService(prov)) return false;
    if (providerId !== "all" && p.provider_id !== providerId) return false;
    if (status !== "all" && p.status !== status) return false;
    if (q && !(p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (prov?.name ?? "").toLowerCase().includes(q))) return false;
    return true;
  };

  /** Top-level rows: a plan, or an offer that matches itself or through a variant. */
  const visible = useMemo(() => plans.filter((p) => {
    if (p.parent_plan_id && byId.has(p.parent_plan_id)) return false;
    return matches(p) || (childrenOf.get(p.id) ?? []).some(matches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [plans, byId, childrenOf, service, providerId, status, search, providerById]);

  /** Which variants to list under an open offer: all of them, unless a filter narrows. */
  const shownChildren = (parent: Plan) => {
    const kids = childrenOf.get(parent.id) ?? [];
    const narrowed = status !== "all" || (q && !matches(parent));
    return narrowed ? kids.filter(matches) : kids;
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // A search that hits only a variant opens its offer, or the hit stays hidden.
  const isOpen = (p: Plan) => expanded.has(p.id) || (!!q && !matches(p) && (childrenOf.get(p.id) ?? []).some(matches));

  /** An offer's own price is often 0 — what it sells for is its cheapest variant. */
  const fromCents = (p: Plan) => {
    const prices = (childrenOf.get(p.id) ?? []).map((c) => c.price_cents).filter((c) => c > 0);
    return prices.length ? Math.min(...prices) : null;
  };

  const sort = useTableSort(visible, {
    plan: (p) => p.name,
    provider: (p) => providerById.get(p.provider_id)?.name ?? null,
    service: (p) => {
      const key = providerById.get(p.provider_id)?.archetype_key;
      return archetypes.find((a) => a.key === key)?.label ?? null;
    },
    price: (p) => fromCents(p) ?? p.price_cents,
    status: (p) => (p.status === "active" ? 0 : p.status === "inactive" ? 1 : 2),
  // Its own key: this list is also a tab of a service's drill-down, and a
  // shared ?sort= would follow the admin from tab to tab.
  }, { param: "plans_sort" });

  // Client-side: the filters already have every row in hand.
  const pager = usePagination(sort.sorted, 25);

  const formatPeriod = (period: string) => period.replace(/_/g, " ");

  const filters = (
    <>
      {!archetypeKey && (
        <Select value={service} onValueChange={(v) => { setServiceFilter(v); setProviderId("all"); }}>
          <SelectTrigger inputSize="sm" className="w-40 rounded-full"><SelectValue placeholder="All services" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={providerId} onValueChange={setProviderId}>
        <SelectTrigger inputSize="sm" className="w-44 rounded-full"><SelectValue placeholder="All providers" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All providers</SelectItem>
          {providersInService.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger inputSize="sm" className="w-32 rounded-full"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  // "No plans yet" vs "no results" is judged against the scope the admin is
  // looking at — inside a service, the other services' plans aren't relevant.
  const inScope = useMemo(() => (
    archetypeKey ? plans.filter((p) => matchesService(providerById.get(p.provider_id))) : plans
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [plans, archetypeKey, providerById, service]);

  const renderRow = (p: Plan, child = false) => {
    const prov = providerById.get(p.provider_id);
    const arche = prov ? archetypes.find((a) => a.key === prov.archetype_key) : undefined;
    const AIcon = arche?.Icon ?? Building2;

    const kids = child ? 0 : (childrenOf.get(p.id)?.length ?? 0);
    const open = kids > 0 && isOpen(p);
    const from = child ? null : fromCents(p);
    const planCell = (
      <div className={cn("flex min-w-0 items-center gap-3", child && "pl-10")}>
        {!child && (
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground transition-transform", open && "rotate-90", !kids && "invisible")} aria-hidden>
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-md bg-inset">
          <AIcon className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
            {p.name}
            {/* An offer and its variants both live in this table, so
                the list says which is which — otherwise "Meal Plan"
                and its six combinations read as seven products. */}
            {variantCounts[p.id] ? (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-meta font-semibold text-primary">
                {variantCounts[p.id]} options
              </span>
            ) : p.parent_plan_id ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-meta font-semibold text-muted-foreground">
                {Object.values(p.option_keys ?? {}).join(" · ") || "variant"}
              </span>
            ) : null}
          </p>
          {p.description && (
            <p className="truncate text-xs text-muted-foreground">{p.description}</p>
          )}
        </div>
      </div>
    );

    const priceCell = (
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums text-foreground">
          {from != null ? <><span className="text-meta font-normal text-muted-foreground">from </span>{formatUSD(from, p.currency)}</> : formatUSD(p.price_cents, p.currency)}
        </p>
        <p className="text-meta text-muted-foreground">
          /{formatPeriod(p.period)}
        </p>
      </div>
    );

    // Was a local green/grey pair printing the raw value; the rest of
    // the platform humanises statuses and uses one set of tones.
    const statusCell = <StatusPill status={p.status} />;

    const actionCell = prov ? (
      <div className="flex justify-end">
        <Link
          onClick={(e) => e.stopPropagation()}
          to={`/admin/marketplace/providers/${prov.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Open ${prov.name}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    ) : null;

    return (
      <div
        key={p.id}
        // An offer's whole row opens it; the arrow says so.
        role={kids ? "button" : undefined}
        tabIndex={kids ? 0 : undefined}
        aria-expanded={kids ? open : undefined}
        onClick={kids ? () => toggle(p.id) : undefined}
        onKeyDown={kids ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); } } : undefined}
        className={cn("group px-space-5 py-space-3 transition-colors hover:bg-muted/30", kids && "cursor-pointer", child && "bg-inset/40")}
      >
        {/* Desktop grid row */}
        <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_120px_minmax(0,1fr)_80px_80px] items-center gap-4 md:grid">
          {planCell}
          <div className="min-w-0 truncate text-sm text-muted-foreground">{prov?.name ?? "—"}</div>
          <div>
            {arche ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {arche.label}
              </span>
            ) : <span className="text-xs text-muted-foreground">—</span>}
          </div>
          {priceCell}
          <div>{statusCell}</div>
          {actionCell}
        </div>

        {/* Mobile card layout */}
        <div className="space-y-2 md:hidden">
          <div className="flex items-start justify-between gap-3">
            {planCell}
            {statusCell}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {prov?.name ?? "—"}{arche ? ` · ${arche.label}` : ""}
            </span>
            <span className="font-bold tabular-nums text-foreground">
              {from != null ? `from ${formatUSD(from, p.currency)}` : formatUSD(p.price_cents, p.currency)}
              <span className="ml-1 text-meta text-muted-foreground">
                /{formatPeriod(p.period)}
              </span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const body = (
      <AdminListShell
        search={search} onSearch={setSearch} searchPlaceholder="Search plans, providers…"
        filters={filters}
        isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
        isEmpty={inScope.length === 0}
        isNoResults={inScope.length > 0 && visible.length === 0} count={visible.length}
        emptyTitle="No plans yet" emptySubtitle="Providers can create plans in their portal."
        onClearFilters={() => { setSearch(""); setServiceFilter("all"); setProviderId("all"); setStatus("all"); }}
      >
        <div className="overflow-hidden rounded-radius-md bg-card">
          {/* Desktop header row */}
          <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_120px_minmax(0,1fr)_80px_80px] items-center gap-4 border-b border-border/40 px-space-5 py-space-3 text-meta font-semibold text-muted-foreground md:grid">
            <div aria-sort={sort.ariaSort("plan")}><SortHeader {...sort.headerProps("plan")}>Plan</SortHeader></div>
            <div aria-sort={sort.ariaSort("provider")}><SortHeader {...sort.headerProps("provider")}>Provider</SortHeader></div>
            <div aria-sort={sort.ariaSort("service")}><SortHeader {...sort.headerProps("service")}>Service</SortHeader></div>
            <div className="flex justify-end" aria-sort={sort.ariaSort("price")}><SortHeader {...sort.headerProps("price")} align="right">Price</SortHeader></div>
            <div aria-sort={sort.ariaSort("status")}><SortHeader {...sort.headerProps("status")}>Status</SortHeader></div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-border/40">
            {pager.paged.map((p) => {
              const open = (childrenOf.get(p.id)?.length ?? 0) > 0 && isOpen(p);
              return (
                <Fragment key={p.id}>
                  {renderRow(p)}
                  {open && shownChildren(p).map((c) => renderRow(c, true))}
                </Fragment>
              );
            })}
          </div>
        </div>
        <TablePagination {...pager} onPage={pager.setPage} />
      </AdminListShell>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Plans" subtitle="Every subscription plan offered by every provider">
      {body}
    </SuperAdminLayout>
  );
};

export default MarketplacePlans;
