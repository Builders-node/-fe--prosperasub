import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, ExternalLink } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { cn } from "@/lib/utils";

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
}

/**
 * Universal admin list of every subscription/membership/meal plan. Filters by
 * SERVICE (the archetype) and provider — categories were retired.
 */
const MarketplacePlans = () => {
  const { archetypes } = useServiceArchetypes(false);
  const [service, setService] = useState("all");
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

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["marketplace-plans"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("provider_plans")
        .select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      const prov = providerById.get(p.provider_id);
      if (service    !== "all" && prov?.archetype_key !== service)    return false;
      if (providerId !== "all" && p.provider_id       !== providerId) return false;
      if (status     !== "all" && p.status            !== status)     return false;
      if (q && !(p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (prov?.name ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [plans, service, providerId, status, search, providerById]);

  const formatPrice = (cents: number, currency: string) =>
    `${(cents / 100).toLocaleString("en-US", { style: "currency", currency: currency || "USD" })}`;
  const formatPeriod = (period: string) => period.replace(/_/g, " ");

  const filters = (
    <>
      <Select value={service} onValueChange={(v) => { setService(v); setProviderId("all"); }}>
        <SelectTrigger className="w-40 rounded-full"><SelectValue placeholder="All services" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All services</SelectItem>
          {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={providerId} onValueChange={setProviderId}>
        <SelectTrigger className="w-44 rounded-full"><SelectValue placeholder="All providers" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All providers</SelectItem>
          {providersInService.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-32 rounded-full"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  return (
    <SuperAdminLayout title="Plans" subtitle="Every subscription plan offered by every provider">
      <AdminListShell
        search={search} onSearch={setSearch} searchPlaceholder="Search plans, providers…"
        filters={filters}
        isLoading={isLoading} isEmpty={plans.length === 0}
        isNoResults={plans.length > 0 && visible.length === 0} count={visible.length}
        emptyTitle="No plans yet" emptySubtitle="Providers can create plans in their portal."
        onClearFilters={() => { setSearch(""); setService("all"); setProviderId("all"); setStatus("all"); }}
      >
        <div className="overflow-hidden rounded-2xl bg-card">
          {/* Desktop header row */}
          <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_120px_minmax(0,1fr)_80px_80px] items-center gap-4 border-b border-border/40 px-space-5 py-space-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <div>Plan</div>
            <div>Provider</div>
            <div>Service</div>
            <div className="text-right">Price</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-border/40">
            {visible.map((p) => {
              const prov = providerById.get(p.provider_id);
              const arche = prov ? archetypes.find((a) => a.key === prov.archetype_key) : undefined;
              const AIcon = arche?.Icon ?? Building2;

              const planCell = (
                <div className="flex min-w-0 items-center gap-3">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", arche?.accent ?? "bg-muted")}>
                    <AIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    {p.description && (
                      <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </div>
                </div>
              );

              const priceCell = (
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-foreground">
                    {formatPrice(p.price_cents, p.currency)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    /{formatPeriod(p.period)}
                  </p>
                </div>
              );

              const statusCell = (
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  p.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground",
                )}>{p.status}</span>
              );

              const actionCell = prov ? (
                <div className="flex justify-end">
                  <Link
                    to={`/admin/marketplace/providers/${prov.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Open ${prov.name}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : null;

              return (
                <div key={p.id} className="group px-space-5 py-space-3 transition-colors hover:bg-muted/30">
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
                        {formatPrice(p.price_cents, p.currency)}
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          /{formatPeriod(p.period)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AdminListShell>
    </SuperAdminLayout>
  );
};

export default MarketplacePlans;
