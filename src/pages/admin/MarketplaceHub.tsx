import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, CreditCard, Inbox, Plus, Building2 } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { ServiceArchetypeDialog } from "@/components/admin/ServiceArchetypeDialog";
import { cn } from "@/lib/utils";

/** Sentinel bucket for rows whose `archetype_key` is null. */
const UNASSIGNED = "__unassigned";

/**
 * Marketplace landing page — the entry point to the drill-down IA:
 *
 *     Service  →  Categories · Providers · Plans · Applications
 *
 * Replaces four flat sidebar entries (Services / Providers / Plans /
 * Applications) that each re-filtered the same archetype dropdown. Managing one
 * service used to mean four visits to four lists; now it's one card away.
 *
 * Creating a service happens HERE too (the button by the grid) — the flat
 * /admin/services CRUD is retired and redirects to this page. Editing, hiding
 * and deleting a service live on its own drill-down page, where the admin can
 * see what the change affects.
 *
 * The cross-service lists still exist and are linked from the footer — they're
 * the only way to reach rows the tree can't show (see the Unassigned card).
 */
export default function MarketplaceHub() {
  const [creating, setCreating] = useState(false);
  // Experiences only, Booking.com-style: transport is its own layer with its
  // own sidebar section, mirroring the storefront's family tabs. Filtered by
  // FAMILY, not by key — a future boats archetype files under Transport with
  // no code change here.
  const { archetypes: allArchetypes, isLoading: archesLoading } = useServiceArchetypes(false);
  const archetypes = useMemo(
    () => allArchetypes.filter((a) => a.family !== "transport"),
    [allArchetypes],
  );

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["marketplace-hub-counts"],
    staleTime: 60_000,
    queryFn: async () => {
      // Paged — every one of these is tallied into a card count.
      const [cats, providerRows, plans, apps] = await Promise.all([
        fetchAllRows<{ archetype_key: string | null }>(() => supabaseDb
          .from("service_categories").select("archetype_key").order("key")),
        fetchAllRows<{ id: string; archetype_key: string | null; status: string }>(() => supabaseDb
          .from("providers").select("id, archetype_key, status").order("id")),
        fetchAllRows<{ provider_id: string }>(() => supabaseDb
          .from("provider_plans").select("provider_id, status").order("id")),
        fetchAllRows<{ archetype_key: string | null }>(() => supabaseDb
          .from("provider_applications").select("archetype_key").eq("status", "pending").order("id")),
      ]);

      const archetypeOfProvider = new Map(providerRows.map((p) => [p.id, p.archetype_key]));

      const tally = <T,>(rows: T[], keyOf: (r: T) => string | null) => {
        const m: Record<string, number> = {};
        rows.forEach((r) => {
          const k = keyOf(r) ?? UNASSIGNED;
          m[k] = (m[k] ?? 0) + 1;
        });
        return m;
      };

      return {
        categories: tally(cats, (r) => r.archetype_key),
        providers: tally(providerRows, (r) => r.archetype_key),
        providersActive: tally(providerRows.filter((p) => p.status === "active"), (r) => r.archetype_key),
        plans: tally(plans, (r) => archetypeOfProvider.get(r.provider_id) ?? null),
        pendingApps: tally(apps, (r) => r.archetype_key),
      };
    },
  });

  const at = (m: Record<string, number> | undefined, k: string) => m?.[k] ?? 0;

  /**
   * `providers.archetype_key` is `ON DELETE SET NULL`, so deleting a service
   * orphans its providers and plans instead of cascading them away. A pure tree
   * would make those rows unreachable — this card is their door.
   */
  const orphans = useMemo(() => ({
    providers: at(counts?.providers, UNASSIGNED),
    plans: at(counts?.plans, UNASSIGNED),
    categories: at(counts?.categories, UNASSIGNED),
  }), [counts]);
  const hasOrphans = orphans.providers + orphans.plans + orphans.categories > 0;

  const totalPending = useMemo(
    () => Object.values(counts?.pendingApps ?? {}).reduce((a, b) => a + b, 0),
    [counts],
  );

  const loading = archesLoading || countsLoading;

  return (
    <SuperAdminLayout
      title="Marketplace"
      subtitle="Pick a service to manage its categories, providers and plans"
    >
      <div className="space-y-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-36 animate-pulse rounded-radius-md bg-muted" />)}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archetypes.map((a) => {
              const pending = at(counts?.pendingApps, a.key);
              return (
                <Link
                  key={a.key}
                  to={`/admin/marketplace/service/${a.key}`}
                  className={cn(
                    // min-w-0: a grid item will not shrink below its content without it,
                    // and then nothing inside can truncate — which is how these
                    // cards grew wider than a phone.
                    "group flex min-w-0 flex-col gap-4 rounded-radius-md bg-card p-5 transition-colors hover:bg-muted/40",
                    !a.is_active && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md", a.accent)}>
                      <a.Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-black text-foreground">{a.label}</p>
                        {!a.is_active && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {a.description || `${at(counts?.providersActive, a.key)} active of ${at(counts?.providers, a.key)} providers`}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <HubStat label="Categories" value={at(counts?.categories, a.key)} />
                    <HubStat label="Providers" value={at(counts?.providers, a.key)} />
                    <HubStat label="Plans" value={at(counts?.plans, a.key)} />
                  </dl>

                  {pending > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                      <Inbox className="h-3.5 w-3.5" />
                      {pending} application{pending !== 1 ? "s" : ""} waiting
                    </div>
                  )}
                </Link>
              );
            })}

            {/* Creating a service starts where services live — not on a
                separate flat page the admin has to know about. */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="group flex min-h-[144px] flex-col items-center justify-center gap-2 rounded-radius-md border border-dashed border-border bg-transparent p-5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-radius-md bg-muted">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold">New service</span>
            </button>

            {hasOrphans && (
              <Link
                to="/admin/marketplace/service/unassigned"
                className="group flex flex-col gap-4 rounded-radius-md border border-dashed border-amber-500/40 bg-card p-5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md bg-amber-500/15">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-black text-foreground">Unassigned</p>
                    <p className="text-xs text-muted-foreground">
                      Not attached to any service — reassign or remove them.
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <HubStat label="Categories" value={orphans.categories} />
                  <HubStat label="Providers" value={orphans.providers} />
                  <HubStat label="Plans" value={orphans.plans} />
                </dl>
              </Link>
            )}
          </div>
        )}

        {/* Cross-service lists — the escape hatch out of the tree. */}
        <div className="rounded-radius-md bg-card p-5">
          <h2 className="text-caption font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Across all services
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <FlatLink to="/admin/marketplace/providers" icon={Building2} label="All providers" />
            <FlatLink to="/admin/marketplace/plans" icon={CreditCard} label="All plans" />
            <FlatLink
              to="/admin/marketplace/providers/applications"
              icon={Inbox}
              label="Applications"
              badge={totalPending}
            />
          </div>
        </div>
      </div>

      <ServiceArchetypeDialog
        open={creating}
        onOpenChange={(v) => !v && setCreating(false)}
        archetype={creating ? "new" : null}
        invalidateKeys={[["marketplace-hub-counts"]]}
      />
    </SuperAdminLayout>
  );
}

function HubStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-radius-md bg-[hsl(var(--app-rail))] px-3 py-2">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-lg font-black tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function FlatLink({
  to, icon: Icon, label, badge,
}: {
  to: string;
  icon: React.FC<{ className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}>
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {label}
        {badge != null && badge > 0 && (
          <Badge className="ml-1.5 h-5 min-w-[20px] rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
            {badge}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
