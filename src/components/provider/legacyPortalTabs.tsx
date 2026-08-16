import { useQuery } from "@tanstack/react-query";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { PortalTabsView } from "@/components/provider/PortalTabsView";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { useMyRestaurants, type MyRestaurant } from "@/hooks/useMyRestaurants";

import type { MyProviderRow } from "@/hooks/useMyProviders";
import { useMyProviders } from "@/hooks/useMyProviders";
import { SERVICES as SERVICE_REGISTRY } from "@/lib/services/registry";

// Identity/bridge lives in one place — re-exported here so portal code has a
// single import surface. See lib/services/providerBridge.ts for the id-space docs.
export { LEGACY_PORTAL_SOURCE_KEYS, useUniversalIdForLegacy, isLegacySource, legacyIdOf } from "@/lib/services/providerBridge";

/**
 * All that is left of the per-service portals: the membership check.
 *
 * The tab strip is assembled once by ProviderWorkspace, and the tab bodies —
 * plans, the day's work, calendars, subscribers — are one component each for
 * every service. Nothing here was per-service any more except who is allowed
 * in, and that still is: a cleaning manager is a row in `cleaning_*`, not in
 * `provider_members`.
 */

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

function FoodOwnerTabs({ legacyId, tabs, isOwner, isMember }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { restaurants, isLoading } = useMyRestaurants();
  const owned = restaurants.find((p) => p.id === legacyId) ?? null;
  if (isLoading) return <TabsSkeleton />;
  if (!owned && !isMember && !isOwner && !isAdmin) return <AccessRevokedPanel />;
  return <PortalTabsView tabs={tabs} provider={null} isOwner={isOwner || isAdmin || owned?.myRole === "owner"} />;
}

const CLEANING_SERVICE = SERVICE_REGISTRY.cleaning as typeof SERVICE_REGISTRY.cleaning & {
  providers: NonNullable<typeof SERVICE_REGISTRY.cleaning["providers"]>;
};

function CleaningOwnerTabs({ legacyId, tabs, isOwner, isMember }: OwnerTabsProps) {
  const { isAdmin } = useAuth();
  const { providers, isLoading } = useMyProviders<CleaningProviderRow>(CLEANING_SERVICE);
  const owned = providers.find((p) => p.id === legacyId) ?? null;
  if (isLoading) return <TabsSkeleton />;
  if (!owned && !isMember && !isOwner && !isAdmin) return <AccessRevokedPanel />;
  return <PortalTabsView tabs={tabs} provider={null} isOwner={isOwner || isAdmin || owned?.myRole === "owner"} />;
}

interface OwnerTabsProps {
  legacyId: string;
  /** The strip, already assembled by ProviderWorkspace for every service. */
  tabs: PortalTab<unknown>[];
  /** Ownership as the universal row sees it — `providers.admin_user_id`. */
  isOwner: boolean;
  /** A row in `provider_members` — what the Team tab writes. */
  isMember: boolean;
}

/**
 * The only thing a legacy-backed provider still needs of its own: may this
 * person be in here, and are they the owner?
 *
 * It used to answer a third question — WHICH tabs — with a per-service bundle,
 * while universal providers got a different component that built a different
 * row and forgot to hide the owner-only ones. The strip is assembled once by
 * ProviderWorkspace now and simply passed through.
 *
 * Membership lives in the per-service manager tables, which is why this is
 * still per-service: a cleaning manager is a row in `cleaning_*`, not in
 * `provider_members`, and dropping this check would hand them Money and Team.
 */
export function LegacyOwnerPortal({ sourceKey, legacyId, tabs, isOwner, isMember }: {
  sourceKey: string;
  legacyId: string;
  tabs: PortalTab<unknown>[];
  isOwner: boolean;
  isMember: boolean;
}) {
  const props = { legacyId, tabs, isOwner, isMember };
  if (sourceKey === "food") return <FoodOwnerTabs {...props} />;
  if (sourceKey === "cleaning") return <CleaningOwnerTabs {...props} />;
  // The beach has no per-service provider table and therefore no per-service
  // membership: the universal row's owner IS its owner, which the caller has
  // already worked out.
  return <PortalTabsView tabs={tabs} provider={null} isOwner={isOwner} />;
}
