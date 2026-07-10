import { Info, CarFront, PlusCircle, Users, BookOpen, CreditCard, Truck, ClipboardList, Wrench, Waves } from "lucide-react";
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
import { RestaurantSubscriptionsTab } from "@/components/food/admin/RestaurantSubscriptionsTab";
import { RestaurantOperationsTab } from "@/components/food/admin/RestaurantOperationsTab";
import { RestaurantStaffTab } from "@/components/food/admin/RestaurantStaffTab";
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
// Cars — Insurance / Extras / Delivery collapsed into one "Add-ons" combo tab
// so the outer bar shows 4 real business surfaces instead of 6. Reservations
// dropped earlier — unified Calendar covers it.
export const CAR_TABS: PortalTab<MyCarRental>[] = [
  { value: "info",     label: "Info",    icon: Info,       render: (p) => <ProviderInfoTab provider={p} /> },
  { value: "fleet",    label: "Fleet",   icon: CarFront,   render: (p) => <ProviderVehiclesTab providerId={p.id} /> },
  { value: "add-ons",  label: "Add-ons", icon: PlusCircle, render: (p) => (
    <InnerPillTabs
      items={[
        { key: "insurance", label: "Insurance", render: () => <ProviderInsuranceTab providerId={p.id} /> },
        { key: "extras",    label: "Extras",    render: () => <ProviderExtrasTab providerId={p.id} /> },
        { key: "delivery",  label: "Delivery",  render: () => <ProviderDeliveryTab providerId={p.id} /> },
      ]}
    />
  ) },
  { value: "staff",    label: "Staff",   icon: Users, ownerOnly: true, render: (p) => <ProviderStaffTab provider={p} /> },
];

// Food — Meal Plans + Weekly Menus collapsed into one "Menu" combo tab (owners
// edit them as a pair anyway).
export const FOOD_TABS: PortalTab<MyRestaurant>[] = [
  { value: "info",          label: "Information",   mobileLabel: "Info",   icon: Info,       render: (r) => <RestaurantInfoTab restaurant={r} /> },
  { value: "menu",          label: "Menu",                                 icon: BookOpen,   render: (r) => (
    <InnerPillTabs
      items={[
        { key: "plans", label: "Meal plans",   render: () => <RestaurantMealPlansTab providerId={r.id} /> },
        { key: "weeks", label: "Weekly menus", render: () => <RestaurantWeeklyMenusTab providerId={r.id} providerName={r.name} /> },
      ]}
    />
  ) },
  { value: "subscriptions", label: "Subscriptions", mobileLabel: "Subs",   icon: CreditCard, render: (r) => <RestaurantSubscriptionsTab providerId={r.id} /> },
  { value: "operations",    label: "Delivery",      mobileLabel: "Deliv.", icon: Truck,      render: (r) => <RestaurantOperationsTab providerId={r.id} /> },
  { value: "staff",         label: "Staff",                                icon: Users, ownerOnly: true, render: (r) => <RestaurantStaffTab restaurant={r} /> },
];

export const CLEANING_TABS: PortalTab<CleaningProviderRow>[] = [
  { value: "info",          label: "Information",   mobileLabel: "Info",  icon: Info,          render: (p) => <CleaningInfoTab provider={p} /> },
  { value: "plans",         label: "Plans",         mobileLabel: "Plans", icon: CreditCard,    render: () => <CleaningPlansPage embedded /> },
  { value: "subscriptions", label: "Subscriptions", mobileLabel: "Subs",  icon: ClipboardList, render: (p) => <CleaningSubscriptionsList providerId={p.id} /> },
  { value: "operations",    label: "Reports",       mobileLabel: "Rep.",  icon: Wrench,        render: () => <CleaningOperationsPage embedded /> },
  { value: "staff",         label: "Staff",                               icon: Users, ownerOnly: true, render: (p) => <CleaningStaffTab provider={p} /> },
];

// Beach club shares Cleaning's "admin pages embedded as tabs" pattern. Beach
// is platform-owned (there's only one provider) so we mount the same admin
// surfaces the platform admin uses. Info + Staff are the universal
// tabs — Info uses UniversalInfoTab against the `providers` row, Staff
// uses UniversalStaffTab against the new `beach_provider_managers` table.
export const BEACH_TABS: PortalTab<{ id: string; admin_user_id?: string | null }>[] = [
  { value: "info",          label: "Information",   mobileLabel: "Info",  icon: Info,          render: (p) => <UniversalInfoTab provider={p as any} /> },
  { value: "plans",         label: "Plans",         mobileLabel: "Plans", icon: CreditCard,    render: () => <BeachClubPlansPage embedded /> },
  { value: "subscriptions", label: "Subscriptions", mobileLabel: "Subs",  icon: ClipboardList, render: () => <BeachClubSubscriptionsPage embedded /> },
  { value: "courts",        label: "Courts",                              icon: Waves,         render: () => <BeachClubCourtsPage embedded /> },
  { value: "staff",         label: "Staff",                               icon: Users, ownerOnly: true, render: (p) => (
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

function CarsOwnerTabs({ legacyId, fallback, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { providers, isLoading } = useMyCarRentals();
  const owned = providers.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<MyCarRental>("rental_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return <>{fallback}</>;
  return <PortalTabsView tabs={[...CAR_TABS, ...extraTabs]} provider={row} isOwner={owned ? owned.myRole === "owner" : true} />;
}

function FoodOwnerTabs({ legacyId, fallback, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { restaurants, isLoading } = useMyRestaurants();
  const owned = restaurants.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<MyRestaurant>("food_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return <>{fallback}</>;
  return <PortalTabsView tabs={[...FOOD_TABS, ...extraTabs]} provider={row} isOwner={owned ? owned.myRole === "owner" : true} />;
}

const CLEANING_SERVICE = SERVICE_REGISTRY.cleaning as typeof SERVICE_REGISTRY.cleaning & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cleaning["providers"]>;
};

function CleaningOwnerTabs({ legacyId, fallback, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { providers, isLoading } = useMyProviders<CleaningProviderRow>(CLEANING_SERVICE);
  const owned = providers.find((p) => p.id === legacyId) ?? null;
  const needAdmin = isAdmin && !isLoading && !owned;
  const admin = useAdminLegacyRow<CleaningProviderRow>("cleaning_providers", legacyId, needAdmin);
  if (isLoading || (needAdmin && admin.isLoading)) return <TabsSkeleton />;
  const row = owned ?? admin.data ?? null;
  if (!row) return <>{fallback}</>;
  return <PortalTabsView tabs={[...CLEANING_TABS, ...extraTabs]} provider={row} isOwner={owned ? (owned.myRole === "owner") : true} />;
}

// Beach is unique: it lives on the *universal* `providers` row itself (no
// per-service beach_providers table), so we look up the row by universal id.
function BeachOwnerTabs({ legacyId, fallback, extraTabs }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  // For beach, `legacyId` is the universal providers.id — that's the only id
  // that exists for this service. Admins get access via `isAdmin`; anyone
  // else falls through to `fallback` (the universal capability portal).
  const admin = useAdminLegacyRow<{ id: string }>("providers", legacyId, isAdmin);
  if (isAdmin && admin.isLoading) return <TabsSkeleton />;
  if (!isAdmin) return <>{fallback}</>;
  const row = admin.data ?? { id: legacyId };
  return <PortalTabsView tabs={[...BEACH_TABS, ...extraTabs]} provider={row} isOwner={true} />;
}

interface OwnerTabsProps {
  legacyId: string;
  fallback: ReactNode;
  /** Extra tabs appended after the service tabs — their render ignores the legacy row (e.g. Booking setup, which uses the universal provider). */
  extraTabs: PortalTab<any>[];
}

/**
 * Render the rich legacy tabs for a legacy-backed provider inside the universal
 * portal. If the current user doesn't own/manage the provider (e.g. an admin
 * previewing it), `fallback` is rendered instead — that keeps admin preview on
 * the universal capability view rather than showing an empty owner portal.
 * `extraTabs` are appended for every service (Booking setup, etc.).
 */
export function LegacyOwnerPortal({ sourceKey, legacyId, fallback, extraTabs = [] }: {
  sourceKey: string; legacyId: string; fallback: ReactNode; extraTabs?: PortalTab<any>[];
}) {
  if (sourceKey === "cars") return <CarsOwnerTabs legacyId={legacyId} fallback={fallback} extraTabs={extraTabs} />;
  if (sourceKey === "food") return <FoodOwnerTabs legacyId={legacyId} fallback={fallback} extraTabs={extraTabs} />;
  if (sourceKey === "cleaning") return <CleaningOwnerTabs legacyId={legacyId} fallback={fallback} extraTabs={extraTabs} />;
  if (sourceKey === "beach" || sourceKey === "beach_club")
    return <BeachOwnerTabs legacyId={legacyId} fallback={fallback} extraTabs={extraTabs} />;
  return <>{fallback}</>;
}
