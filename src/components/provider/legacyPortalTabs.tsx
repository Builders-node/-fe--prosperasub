import { LayoutDashboard, Package, Users, Wrench, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { PortalTabsView } from "@/components/provider/PortalTabsView";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { ProviderInfoTab } from "@/components/rental/admin/ProviderInfoTab";
import { ProviderVehiclesTab } from "@/components/rental/admin/ProviderVehiclesTab";
import { ProviderInsuranceTab } from "@/components/rental/admin/ProviderInsuranceTab";
import { ProviderExtrasTab } from "@/components/rental/admin/ProviderExtrasTab";
import { ProviderDeliveryTab } from "@/components/rental/admin/ProviderDeliveryTab";
import { ProviderStaffTab } from "@/components/rental/admin/ProviderStaffTab";
import { useMyCarRentals, type MyCarRental } from "@/hooks/useMyCarRentals";

import { RestaurantInfoTab } from "@/components/food/admin/RestaurantInfoTab";
import { RestaurantMealPlansTab } from "@/components/food/admin/RestaurantMealPlansTab";
import { RestaurantWeeklyMenusTab } from "@/components/food/admin/RestaurantWeeklyMenusTab";
import { RestaurantOperationsTab } from "@/components/food/admin/RestaurantOperationsTab";
import { RestaurantStaffTab } from "@/components/food/admin/RestaurantStaffTab";
import { FoodSubscriptionsList } from "@/components/food/FoodSubscriptionsList";
import { useMyRestaurants, type MyRestaurant } from "@/hooks/useMyRestaurants";

import { CleaningInfoTab, type CleaningProviderRow } from "@/components/cleaning/CleaningInfoTab";
import { CleaningStaffTab } from "@/components/cleaning/CleaningStaffTab";
import { CleaningSubscriptionsList } from "@/components/cleaning/CleaningSubscriptionsList";
import { useMyProviders } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";
import CleaningPlansPage from "@/pages/admin/CleaningPlans";
import CleaningOperationsPage from "@/pages/admin/CleaningManagement";

import BeachClubPlansPage from "@/pages/admin/BeachClubPlans";
import BeachClubSubscriptionsPage from "@/pages/admin/BeachClubSubscriptions";
import BeachClubCourtsPage from "@/pages/admin/BeachClubCourts";

import { InnerPillTabs } from "@/components/provider/InnerPillTabs";
import { UniversalInfoTab } from "@/components/provider/UniversalInfoTab";
import { UniversalStaffTab } from "@/components/provider/UniversalStaffTab";

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
export const CAR_TABS: PortalTab<MyCarRental>[] = [
  { value: "info",       label: "Overview",   icon: LayoutDashboard, render: (p) => <ProviderInfoTab provider={p} /> },
  { value: "offerings",  label: "Offerings",  icon: Package,         render: (p) => <ProviderVehiclesTab providerId={p.id} /> },
  { value: "operations", label: "Operations", icon: Wrench,          render: (p) => (
    <InnerPillTabs
      items={[
        { key: "insurance", label: "Insurance", render: () => <ProviderInsuranceTab providerId={p.id} /> },
        { key: "extras",    label: "Extras",    render: () => <ProviderExtrasTab providerId={p.id} /> },
        { key: "delivery",  label: "Delivery",  render: () => <ProviderDeliveryTab providerId={p.id} /> },
      ]}
    />
  ) },
  { value: "team",       label: "Team",       icon: Users, ownerOnly: true, render: (p) => <ProviderStaffTab provider={p} /> },
];

// Batch 2: the standalone Subscriptions tab is gone. Its contents are folded
// into the injected Bookings tab (LegacyOwnerPortal wires it as the "By
// customer" view) so a provider clicks Bookings once and toggles between the
// week calendar and the customer list. Bodies of the old subscription tabs are
// still rendered — just from a different mount point.
// Owner-facing subscription list — same compact grouped shape as the Cleaning
// provider workspace so a provider switching services keeps the same UI grammar.
// The full admin editor still lives at /admin/marketplace/subscriptions.
export const FOOD_SUBSCRIPTIONS_TAB_BODY = (r: MyRestaurant) => <FoodSubscriptionsList providerId={r.id} />;
export const CLEANING_SUBSCRIPTIONS_TAB_BODY = (p: CleaningProviderRow) => <CleaningSubscriptionsList providerId={p.id} />;

export const FOOD_TABS: PortalTab<MyRestaurant>[] = [
  { value: "info",          label: "Overview",   icon: LayoutDashboard, render: (r) => <RestaurantInfoTab restaurant={r} /> },
  { value: "offerings",     label: "Offerings",  icon: Package,         render: (r) => (
    <InnerPillTabs
      items={[
        { key: "plans", label: "Meal plans",   render: () => <RestaurantMealPlansTab providerId={r.id} /> },
        { key: "weeks", label: "Weekly menus", render: () => <RestaurantWeeklyMenusTab providerId={r.id} providerName={r.name} /> },
      ]}
    />
  ) },
  { value: "operations",    label: "Operations",  mobileLabel: "Ops.",  icon: Truck,           render: (r) => <RestaurantOperationsTab providerId={r.id} /> },
  { value: "team",          label: "Team",                                icon: Users, ownerOnly: true, render: (r) => <RestaurantStaffTab restaurant={r} /> },
];

export const CLEANING_TABS: PortalTab<CleaningProviderRow>[] = [
  { value: "info",          label: "Overview",   icon: LayoutDashboard, render: (p) => <CleaningInfoTab provider={p} /> },
  { value: "offerings",     label: "Offerings",  icon: Package,         render: () => <CleaningPlansPage embedded /> },
  { value: "operations",    label: "Operations", mobileLabel: "Ops.",   icon: Wrench,          render: () => <CleaningOperationsPage embedded /> },
  { value: "team",          label: "Team",                               icon: Users, ownerOnly: true, render: (p) => <CleaningStaffTab provider={p} /> },
];

// Beach club shares Cleaning's "admin pages embedded as tabs" pattern. Beach
// is platform-owned (there's only one provider) so we mount the same admin
// surfaces the platform admin uses. Info + Staff are the universal
// tabs — Info uses UniversalInfoTab against the `providers` row, Staff
// uses UniversalStaffTab against the new `beach_provider_managers` table.
export const BEACH_SUBSCRIPTIONS_TAB_BODY = () => <BeachClubSubscriptionsPage embedded />;

export const BEACH_TABS: PortalTab<{ id: string; admin_user_id?: string | null }>[] = [
  { value: "info",          label: "Overview",   icon: LayoutDashboard, render: (p) => <UniversalInfoTab provider={p as any} /> },
  { value: "offerings",     label: "Offerings",  icon: Package,         render: () => <BeachClubPlansPage embedded /> },
  { value: "operations",    label: "Operations", mobileLabel: "Ops.",  icon: Wrench,          render: () => <BeachClubCourtsPage embedded /> },
  { value: "team",          label: "Team",                               icon: Users, ownerOnly: true, render: (p) => (
    <UniversalStaffTab
      providerId={p.id}
      ownerUserId={p.admin_user_id ?? null}
      providerTable="providers"
      managerTable="beach_provider_managers"
      entityLabel="beach club"
      auditEntityProvider="provider"
      auditEntityManager="beach_provider_manager"
      hasRoleColumn
      invalidateKeysOnOwnerChange={[["admin-legacy-provider-row"]]}
    />
  ) },
];

// ── Owner-scoped rich tabs, mounted inside the universal portal ───────────────
function TabsSkeleton() {
  return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
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
): PortalTab<T>[] {
  const withPrefixes: PortalTab<T>[] = baseTabs.map((t) => {
    const prefix = tabPrefixes[t.value];
    if (!prefix) return t;
    const originalRender = t.render;
    return {
      ...t,
      render: (row: T) => (
        <>
          {prefix}
          {originalRender(row)}
        </>
      ),
    };
  });

  if (!bookingsTab) return [...withPrefixes, ...extraTabs];
  const overviewIdx = withPrefixes.findIndex((t) => t.value === "info");
  const offeringsIdx = withPrefixes.findIndex((t) => t.value === "offerings");
  const insertAfter = offeringsIdx >= 0 ? offeringsIdx : overviewIdx;
  const result = [...withPrefixes];
  result.splice(insertAfter + 1, 0, bookingsTab as PortalTab<T>);
  return [...result, ...(extraTabs as PortalTab<T>[])];
}

function CarsOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { providers, isLoading } = useMyCarRentals();
  const owned = providers.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<MyCarRental>("rental_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return <>{fallback}</>;
  return <PortalTabsView tabs={assembleTabs(CAR_TABS, bookingsTab, extraTabs, tabPrefixes)} provider={row} isOwner={owned ? owned.myRole === "owner" : true} />;
}

function FoodOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { restaurants, isLoading } = useMyRestaurants();
  const owned = restaurants.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<MyRestaurant>("food_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return <>{fallback}</>;
  return <PortalTabsView tabs={assembleTabs(FOOD_TABS, bookingsTab, extraTabs, tabPrefixes)} provider={row} isOwner={owned ? owned.myRole === "owner" : true} />;
}

const CLEANING_SERVICE = SERVICE_REGISTRY.cleaning as typeof SERVICE_REGISTRY.cleaning & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cleaning["providers"]>;
};

function CleaningOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { providers, isLoading } = useMyProviders<CleaningProviderRow>(CLEANING_SERVICE);
  const owned = providers.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<CleaningProviderRow>("cleaning_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return <>{fallback}</>;
  return <PortalTabsView tabs={assembleTabs(CLEANING_TABS, bookingsTab, extraTabs, tabPrefixes)} provider={row} isOwner={owned ? (owned.myRole === "owner") : true} />;
}

// Beach is unique: it lives on the *universal* `providers` row itself (no
// per-service beach_providers table), so we look up the row by universal id.
function BeachOwnerTabs({ legacyId, fallback, bookingsTab, tabPrefixes, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  // For beach, `legacyId` is the universal providers.id — that's the only id
  // that exists for this service. Admins get access via `isAdmin`; anyone
  // else falls through to `fallback` (the universal capability portal).
  const admin = useAdminLegacyRow<{ id: string }>("providers", legacyId, isAdmin);
  if (isAdmin && admin.isLoading) return <TabsSkeleton />;
  if (!isAdmin) return <>{fallback}</>;
  const row = admin.data ?? { id: legacyId };
  return <PortalTabsView tabs={assembleTabs(BEACH_TABS, bookingsTab, extraTabs, tabPrefixes)} provider={row} isOwner={true} />;
}

interface OwnerTabsProps {
  legacyId: string;
  fallback: ReactNode;
  /** The single injected Bookings tab (replaces old Calendar + Subscriptions). Spliced after Offerings. */
  bookingsTab?: PortalTab<any>;
  /** Map of tab-value → ReactNode to prepend to that tab's body. Currently used for
   * the ProviderAnalyticsWidget above Overview + the ScheduleAccordion above Offerings. */
  tabPrefixes?: Record<string, ReactNode>;
  /** Extra tabs appended after the service tabs. */
  extraTabs: PortalTab<any>[];
}

/**
 * Render the rich legacy tabs for a legacy-backed provider inside the universal
 * portal. If the current user doesn't own/manage the provider (e.g. an admin
 * previewing it), `fallback` is rendered instead — that keeps admin preview on
 * the universal capability view rather than showing an empty owner portal.
 * `extraTabs` are appended for every service (Booking setup, etc.).
 */
export function LegacyOwnerPortal({ sourceKey, legacyId, fallback, bookingsTab, tabPrefixes, extraTabs = [] }: {
  sourceKey: string; legacyId: string; fallback: ReactNode;
  bookingsTab?: PortalTab<any>;
  tabPrefixes?: Record<string, ReactNode>;
  extraTabs?: PortalTab<any>[];
}) {
  const props = { legacyId, fallback, bookingsTab, tabPrefixes, extraTabs };
  if (sourceKey === "cars") return <CarsOwnerTabs {...props} />;
  if (sourceKey === "food") return <FoodOwnerTabs {...props} />;
  if (sourceKey === "cleaning") return <CleaningOwnerTabs {...props} />;
  if (sourceKey === "beach" || sourceKey === "beach_club")
    return <BeachOwnerTabs {...props} />;
  return <>{fallback}</>;
}
