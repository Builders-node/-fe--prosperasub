import { LandPlot, LayoutDashboard, Package, Users, Wrench, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { PortalTabsView } from "@/components/provider/PortalTabsView";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";


import { FoodSubscriptionsList } from "@/components/food/FoodSubscriptionsList";
import { useMyRestaurants, type MyRestaurant } from "@/hooks/useMyRestaurants";

import type { MyProviderRow } from "@/hooks/useMyProviders";
import { CleaningSubscriptionsList } from "@/components/cleaning/CleaningSubscriptionsList";
import { useMyProviders } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

import BeachClubSubscriptionsPage from "@/pages/admin/BeachClubSubscriptions";
import BeachClubCourtsPage from "@/pages/admin/BeachClubCourts";

import { PlansTab } from "@/components/provider/plans/PlansTab";
import { OperationsTab } from "@/components/provider/OperationsTab";
import { useUniversalIdForLegacy as useUniversalId } from "@/lib/services/providerBridge";

/**
 * The options editor keyed by a LEGACY provider id.
 *
 * Offers live on the universal `providers` row, and the legacy portals only
 * ever hold the per-service id, so the bridge happens here rather than in the
 * editor — which should not have to know that two id-spaces exist.
 */
/**
 * The provider's day, on the universal occurrence table.
 *
 * It replaces three screens that asked the same question in three
 * vocabularies — food's delivery run, cleaning's bookings-and-reports page,
 * the beach's court grid. The per-service pages still exist at their own admin
 * URLs; this is what the workspace mounts.
 */
function LegacyOperations({ legacyId, sourceKey }: { legacyId: string; sourceKey: string }) {
  const { data: universalId, isLoading } = useUniversalId(sourceKey, legacyId);
  if (isLoading) return <TabsSkeleton />;
  if (!universalId) {
    return (
      <div className="rounded-radius-lg bg-card p-6 text-[16px] leading-[22px] text-muted-foreground">
        This business has no marketplace record yet, so its day can't be shown here.
      </div>
    );
  }
  return <OperationsTab providerId={universalId} />;
}

/**
 * Offerings for a legacy-backed provider.
 *
 * It used to be two pills — the per-service plan list, and an Options screen
 * that grouped six of those plans into one product. A provider selling one
 * thing in six sizes therefore met six tariffs plus a merging tool, and edited
 * a combination's price in whichever of the two owned that row. `PlansTab` is
 * a card per product; opening one gives the plan once, the axes, and a price
 * per combination, in a sheet.
 */
function LegacyOfferings({ legacyId, sourceKey }: { legacyId: string; sourceKey: string }) {
  const { data: universalId, isLoading } = useUniversalId(sourceKey, legacyId);
  if (isLoading) return <TabsSkeleton />;
  if (!universalId) {
    return (
      <div className="rounded-radius-lg bg-card p-6 text-[16px] leading-[22px] text-muted-foreground">
        This business has no marketplace record yet, so its plans can't be edited here.
      </div>
    );
  }
  return <PlansTab providerId={universalId} sourceKey={sourceKey} />;
}

// Identity/bridge lives in one place — re-exported here so portal code has a
// single import surface. See lib/services/providerBridge.ts for the id-space docs.
export { LEGACY_PORTAL_SOURCE_KEYS, useUniversalIdForLegacy, isLegacySource, legacyIdOf } from "@/lib/services/providerBridge";

// ── Tab definitions (single source of truth; legacy pages import these too) ──
// Every service uses the SAME five-slot shape so a provider learns the layout
// once and it transfers to any service they run:
//
//   Overview → Offerings → Bookings (injected) → Operations → Team
//
// Slot semantics:
//   Overview   = who you are (info + KPI widget — batch 4 merges the widget here)
//   Offerings  = what you sell (fleet / menu / plans / courts)
//   Bookings   = who booked what (injected from ProviderWorkspace as one merged
//                tab in batch 2 — currently still separate Calendar + subs)
//   Operations = daily work (add-ons / delivery / reports)
//   Team       = owner + managers
// Batch 2: the standalone Subscriptions tab is gone. Its contents are folded
// into the injected Bookings tab (LegacyOwnerPortal wires it as the "By
// customer" view) so a provider clicks Bookings once and toggles between the
// week calendar and the customer list. Bodies of the old subscription tabs are
// still rendered — just from a different mount point.
// Owner-facing subscription list — same compact grouped shape as the Cleaning
// provider workspace so a provider switching services keeps the same UI grammar.
// The full admin editor still lives at /admin/marketplace/subscriptions.
/** Shape of a `cleaning_providers` row as the owner hooks return it. */
export interface CleaningProviderRow extends MyProviderRow {
  location?: string | null;
  working_hours?: string | null;
  banner_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  status?: string | null;
  sort_order?: number | null;
  gallery_urls?: string[] | null;
}

export const FOOD_SUBSCRIPTIONS_TAB_BODY = (r: MyRestaurant) => <FoodSubscriptionsList providerId={r.id} />;
export const CLEANING_SUBSCRIPTIONS_TAB_BODY = (p: CleaningProviderRow) => <CleaningSubscriptionsList providerId={p.id} />;

export const FOOD_TABS: PortalTab<MyRestaurant>[] = [
  { value: "offerings",     label: "Offerings",  icon: Package,         render: (r) => (
    <LegacyOfferings legacyId={r.id} sourceKey="food" />
  ) },
  { value: "operations",    label: "Operations",  mobileLabel: "Ops.",  icon: Truck,           render: (r) => <LegacyOperations legacyId={r.id} sourceKey="food" /> },
];

export const CLEANING_TABS: PortalTab<CleaningProviderRow>[] = [
  // Pass providerId so the embedded admin pages scope every query + insert
  // to THIS provider's packages/subscriptions/bookings. Without this, one
  // cleaning owner's Offerings and Operations tabs displayed (and could edit)
  // every other provider's data.
  { value: "offerings",     label: "Offerings",  icon: Package,         render: (p) => (
    <LegacyOfferings legacyId={p.id} sourceKey="cleaning" />
  ) },
  { value: "operations",    label: "Operations", mobileLabel: "Ops.",   icon: Wrench,          render: (p) => <LegacyOperations legacyId={p.id} sourceKey="cleaning" /> },
];

// Beach club shares Cleaning's "admin pages embedded as tabs" pattern. Beach
// is platform-owned (there's only one provider) so we mount the same admin
// surfaces the platform admin uses.
export const BEACH_SUBSCRIPTIONS_TAB_BODY = () => <BeachClubSubscriptionsPage embedded />;

/**
 * The beach club was the last service still on its own screens, which is the
 * whole reason this bundle looked different from the other two.
 *
 * Its `id` IS the universal `providers.id` — beach never had a legacy provider
 * table — so Offerings and Operations mount the shared components directly,
 * no bridge needed.
 *
 * Courts stay their own tab, and that is not an exception being kept: a court
 * is a bookable RESOURCE, and managing resources (hours, slot length, the
 * calendar) is a different job from running the day's work. The proposal calls
 * this the `resource_hours` capability; any provider that gets one will get
 * this tab too.
 */
export const BEACH_TABS: PortalTab<{ id: string; admin_user_id?: string | null }>[] = [
  { value: "offerings",     label: "Offerings",  icon: Package,         render: (p) => <PlansTab providerId={p.id} sourceKey="beach" /> },
  { value: "operations",    label: "Operations", mobileLabel: "Ops.",  icon: Wrench,          render: (p) => <OperationsTab providerId={p.id} /> },
  { value: "resources",     label: "Courts",     icon: LandPlot,        render: () => <BeachClubCourtsPage embedded /> },
];

// ── Owner-scoped rich tabs, mounted inside the universal portal ───────────────
function TabsSkeleton() {
  return <div className="h-96 animate-pulse rounded-radius-lg bg-muted" />;
}

/**
 * Admin fallback: fetch the legacy provider row directly (admins aren't in the
 * owner-scoped useMy* hooks) so a super_admin gets the same rich tabs with full
 * access when managing a provider they don't personally own.
 */
function useAdminLegacyRow<T>(table: string, legacyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-legacy-provider-row", table, legacyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from(table).select("*").eq("id", legacyId).maybeSingle();
      if (error) throw error;
      return data ? ({ ...(data as Record<string, unknown>), myRole: "owner" } as T) : null;
    },
  });
}

/**
 * Splice the bookings tab into position 2 (after "offerings") so every service
 * has the same visual order:
 *   Overview → Offerings → Bookings → Operations → Team.
 *
 * `tabPrefixes` is a map of tab value → ReactNode that gets prepended to that
 * tab's rendered body. Currently used to inject the ScheduleAccordion above
 * Offerings and the ProviderAnalyticsWidget above Overview — one uniform
 * mechanism, no per-service render forks.
 */
function assembleTabs<T>(
  baseTabs: PortalTab<T>[],
  bookingsTab: PortalTab<any> | undefined,
  extraTabs: PortalTab<any>[],
  tabPrefixes: Record<string, ReactNode> = {},
  /** Appended last — Team is the owner-only tail of every strip. */
  tailTabs: PortalTab<any>[] = [],
  /**
   * Prepended — Overview. It is built by ProviderWorkspace rather than by each
   * service bundle because it edits the UNIVERSAL `providers` row, which the
   * legacy bundles never carry. That is what let the three per-service Info
   * tabs be deleted outright instead of merely deduplicated.
   */
  headTabs: PortalTab<any>[] = [],
): PortalTab<T>[] {
  const withPrefixes: PortalTab<T>[] = baseTabs.map((t) => {
    const prefix = tabPrefixes[t.value];
    if (!prefix) return t;
    const originalRender = t.render;
    return {
      ...t,
      render: (row: T, isOwner: boolean) => (
        <>
          {prefix}
          {originalRender(row, isOwner)}
        </>
      ),
    };
  });

  // Extras go next to Bookings, not after Team: Money answers the question
  // Bookings raises ("who booked what" → "so what am I owed"), and Team is the
  // owner-only tail of every service's tab strip.
  if (!bookingsTab) {
    const opsIdx = withPrefixes.findIndex((t) => t.value === "operations");
    const at = opsIdx >= 0 ? opsIdx : withPrefixes.length;
    const out = [...withPrefixes];
    out.splice(at, 0, ...(extraTabs as PortalTab<T>[]));
    return [...(headTabs as PortalTab<T>[]), ...out, ...(tailTabs as PortalTab<T>[])];
  }
  const overviewIdx = withPrefixes.findIndex((t) => t.value === "info");
  const offeringsIdx = withPrefixes.findIndex((t) => t.value === "offerings");
  const insertAfter = offeringsIdx >= 0 ? offeringsIdx : overviewIdx;
  const result = [...withPrefixes];
  result.splice(insertAfter + 1, 0, bookingsTab as PortalTab<T>, ...(extraTabs as PortalTab<T>[]));
  return [...(headTabs as PortalTab<T>[]), ...result, ...(tailTabs as PortalTab<T>[])];
}

// Access-revoked panel — shown to a non-admin whose owner/manager row was
// removed while the workspace was open. Rendering the universal CapabilityPortal
// (the old `fallback`) let them keep writing to `provider_plans` against a
// business they no longer have any relationship to.
function AccessRevokedPanel() {
  return (
    <div className="rounded-radius-lg bg-card p-8 text-center">
      <p className="font-semibold text-foreground">Access to this workspace was removed</p>
      <p className="mt-1 text-sm text-muted-foreground">
        The owner may have revoked your manager role. Refresh or head back to My business.
      </p>
    </div>
  );
}

function FoodOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs, tailTabs, headTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { restaurants, isLoading } = useMyRestaurants();
  const owned = restaurants.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<MyRestaurant>("food_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return isAdmin ? <>{fallback}</> : <AccessRevokedPanel />;
  return <PortalTabsView tabs={assembleTabs(FOOD_TABS, bookingsTab, extraTabs, tabPrefixes, tailTabs, headTabs)} provider={row} isOwner={owned ? owned.myRole === "owner" : true} />;
}

const CLEANING_SERVICE = SERVICE_REGISTRY.cleaning as typeof SERVICE_REGISTRY.cleaning & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cleaning["providers"]>;
};

function CleaningOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs, tailTabs, headTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { providers, isLoading } = useMyProviders<CleaningProviderRow>(CLEANING_SERVICE);
  const owned = providers.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<CleaningProviderRow>("cleaning_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return isAdmin ? <>{fallback}</> : <AccessRevokedPanel />;
  return <PortalTabsView tabs={assembleTabs(CLEANING_TABS, bookingsTab, extraTabs, tabPrefixes, tailTabs, headTabs)} provider={row} isOwner={owned ? (owned.myRole === "owner") : true} />;
}

// Beach is unique: it lives on the *universal* `providers` row itself (no
// per-service beach_providers table), so we look up the row by universal id.
function BeachOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs, tailTabs, headTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  // For beach, `legacyId` is the universal providers.id — that's the only id
  // that exists for this service. Admins get access via `isAdmin`; anyone
  // else falls through to `fallback` (the universal capability portal).
  const admin = useAdminLegacyRow<{ id: string }>("providers", legacyId, isAdmin);
  if (isAdmin && admin.isLoading) return <TabsSkeleton />;
  if (!isAdmin) return <>{fallback}</>;
  const row = admin.data ?? { id: legacyId };
  return <PortalTabsView tabs={assembleTabs(BEACH_TABS, bookingsTab, extraTabs, tabPrefixes, tailTabs, headTabs)} provider={row} isOwner={true} />;
}

interface OwnerTabsProps {
  legacyId: string;
  fallback: ReactNode;
  /** The single injected Bookings tab (replaces old Calendar + Subscriptions). Spliced after Offerings. */
  bookingsTab?: PortalTab<any>;
  /** Map of tab-value → ReactNode to prepend to that tab's body. Currently used for
   * the ProviderAnalyticsWidget above Overview + the ScheduleAccordion above Offerings. */
  tabPrefixes?: Record<string, ReactNode>;
  /** Extra tabs, spliced in right after Bookings. */
  extraTabs: PortalTab<any>[];
  tailTabs: PortalTab<any>[];
  headTabs: PortalTab<any>[];
}

/**
 * Render the rich legacy tabs for a legacy-backed provider inside the universal
 * portal. If the current user doesn't own/manage the provider (e.g. an admin
 * previewing it), `fallback` is rendered instead — that keeps admin preview on
 * the universal capability view rather than showing an empty owner portal.
 * `extraTabs` are appended for every service (Booking setup, etc.).
 */
export function LegacyOwnerPortal({ sourceKey, legacyId, fallback, bookingsTab, tabPrefixes, extraTabs = [], tailTabs = [], headTabs = [] }: {
  sourceKey: string; legacyId: string; fallback: ReactNode;
  bookingsTab?: PortalTab<any>;
  tabPrefixes?: Record<string, ReactNode>;
  extraTabs?: PortalTab<any>[];
  /** Appended after the service's own tabs — Team, which is no longer one of them. */
  tailTabs?: PortalTab<any>[];
  headTabs?: PortalTab<any>[];
}) {
  const props = { legacyId, fallback, bookingsTab, tabPrefixes, extraTabs, tailTabs, headTabs };
  if (sourceKey === "food") return <FoodOwnerTabs {...props} />;
  if (sourceKey === "cleaning") return <CleaningOwnerTabs {...props} />;
  if (sourceKey === "beach" || sourceKey === "beach_club")
    return <BeachOwnerTabs {...props} />;
  return <>{fallback}</>;
}
