import { Info, CarFront, Shield, PlusCircle, MapPin, Users, CalendarCheck, BookOpen, CalendarDays, CreditCard, Truck, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { PortalTabsView } from "@/components/provider/PortalTabsView";
import { Button } from "@/components/ui/button";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { ProviderInfoTab } from "@/components/rental/admin/ProviderInfoTab";
import { ProviderVehiclesTab } from "@/components/rental/admin/ProviderVehiclesTab";
import { ProviderReservationsTab } from "@/components/rental/admin/ProviderReservationsTab";
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
import { useMyProviders } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

// Identity/bridge lives in one place — re-exported here so portal code has a
// single import surface. See lib/services/providerBridge.ts for the id-space docs.
export { LEGACY_PORTAL_SOURCE_KEYS, useUniversalIdForLegacy, isLegacySource, legacyIdOf } from "@/lib/services/providerBridge";

// ── Tab definitions (single source of truth; legacy pages import these too) ──
export const CAR_TABS: PortalTab<MyCarRental>[] = [
  { value: "info",         label: "Info",         icon: Info,          render: (p) => <ProviderInfoTab provider={p} /> },
  { value: "vehicles",     label: "Vehicles",     icon: CarFront,      render: (p) => <ProviderVehiclesTab providerId={p.id} /> },
  { value: "reservations", label: "Reservations", mobileLabel: "Res.", icon: CalendarCheck, render: (p) => <ProviderReservationsTab providerId={p.id} /> },
  { value: "insurance",    label: "Insurance",    mobileLabel: "Ins.", icon: Shield,        render: (p) => <ProviderInsuranceTab providerId={p.id} /> },
  { value: "extras",       label: "Extras",                            icon: PlusCircle,    render: (p) => <ProviderExtrasTab providerId={p.id} /> },
  { value: "delivery",     label: "Delivery",                          icon: MapPin,        render: (p) => <ProviderDeliveryTab providerId={p.id} /> },
  { value: "staff",        label: "Staff",                             icon: Users, ownerOnly: true, render: (p) => <ProviderStaffTab provider={p} /> },
];

export const FOOD_TABS: PortalTab<MyRestaurant>[] = [
  { value: "info",          label: "Information",   mobileLabel: "Info",  icon: Info,         render: (r) => <RestaurantInfoTab restaurant={r} /> },
  { value: "meal-plans",    label: "Meal Plans",    mobileLabel: "Plans", icon: BookOpen,     render: (r) => <RestaurantMealPlansTab providerId={r.id} /> },
  { value: "menus",         label: "Weekly Menus",  mobileLabel: "Menus", icon: CalendarDays, render: (r) => <RestaurantWeeklyMenusTab providerId={r.id} providerName={r.name} /> },
  { value: "subscriptions", label: "Subscriptions", mobileLabel: "Subs",  icon: CreditCard,   render: (r) => <RestaurantSubscriptionsTab providerId={r.id} /> },
  { value: "operations",    label: "Operations",    mobileLabel: "Ops",   icon: Truck,        render: (r) => <RestaurantOperationsTab providerId={r.id} /> },
  { value: "staff",         label: "Staff",                                icon: Users, ownerOnly: true, render: (r) => <RestaurantStaffTab restaurant={r} /> },
];

function CleaningLinkTab({ label, href }: { label: string; href: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
      <p className="font-semibold">{label} live in a dedicated screen.</p>
      <p className="text-sm text-muted-foreground">
        Managed platform-wide for consistency across cleaning packages, slots, and calendars.
      </p>
      <Button asChild variant="outline" className="rounded-full"><Link to={href}>Open</Link></Button>
    </div>
  );
}

export const CLEANING_TABS: PortalTab<CleaningProviderRow>[] = [
  { value: "info",          label: "Information",   mobileLabel: "Info",  icon: Info,          render: (p) => <CleaningInfoTab provider={p} /> },
  { value: "plans",         label: "Plans",         mobileLabel: "Plans", icon: CreditCard,    render: () => <CleaningLinkTab label="Cleaning plans" href="/admin/cleaning/plans" /> },
  { value: "subscriptions", label: "Subscriptions", mobileLabel: "Subs",  icon: ClipboardList, render: () => <CleaningLinkTab label="Cleaning subscriptions" href="/admin/cleaning/subscriptions" /> },
  { value: "staff",         label: "Staff",                               icon: Users, ownerOnly: true, render: () => <CleaningLinkTab label="Staff management" href="/admin/cleaning/providers" /> },
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
  return <>{fallback}</>;
}
