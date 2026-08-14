import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ExternalLink, Package, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { providerHref } from "@/lib/services/serviceUrls";
import {
  ALL_CAPABILITIES, CAPABILITIES, ComingSoonTab, INFO_TAB_META,
  type CapabilityKey, type CapabilityMeta,
} from "@/components/provider/capabilities";
import { UniversalInfoTab, type UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { UniversalPlansTab } from "@/components/provider/UniversalPlansTab";
import { InnerPillTabs } from "@/components/provider/InnerPillTabs";
import { BookingsTab } from "@/components/provider/BookingsTab";
import { ProviderTeamTab } from "@/components/provider/ProviderTeamTab";
import { ScheduleAccordion } from "@/components/provider/ScheduleAccordion";
import { LegacyOwnerPortal, FOOD_SUBSCRIPTIONS_TAB_BODY, CLEANING_SUBSCRIPTIONS_TAB_BODY, BEACH_SUBSCRIPTIONS_TAB_BODY } from "@/components/provider/legacyPortalTabs";
import { ProviderAnalyticsWidget } from "@/components/provider/ProviderAnalyticsWidget";
import { ProviderReviewsPanel } from "@/components/provider/ProviderReviewsPanel";
import { ProviderEarningsTab } from "@/components/provider/ProviderEarningsTab";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { LEGACY_PORTAL_SOURCE_KEYS, legacyIdOf } from "@/lib/services/providerBridge";

/**
 * The single provider management view — banner + header + tab dispatch. Layout-
 * agnostic on purpose: the user portal wraps it in UserLayout, the admin detail
 * page wraps it in SuperAdminLayout. For legacy-backed providers it mounts the
 * rich per-service tabs (admins get them too via the admin fallback in
 * legacyPortalTabs); otherwise it shows the universal capability tabs. Every
 * provider gets a Schedule tab.
 */
export function ProviderWorkspace({ providerId, publicHref, backHref = "/my-business" }: {
  providerId: string;
  /**
   * Where "View Public" goes. Defaults to this provider's own public page,
   * derived from the row we already load.
   *
   * It used to default to "/discovery", and NEITHER caller passed anything —
   * so the button on every provider workspace opened the platform's home
   * listing instead of the business it sits on. It looked broken because it
   * was pointed at nothing in particular.
   */
  publicHref?: string;
  backHref?: string;
}) {
  const navigate = useNavigate();
  const { archetypes } = useServiceArchetypes(false);

  const { data: provider, isLoading } = useQuery({
    queryKey: ["universal-provider", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("*").eq("id", providerId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as UniversalProviderRow | null;
    },
  });

  /**
   * The provider's own public page. `providerHref` builds
   * /services/<slug>/providers/<universal id>, which resolves for every
   * service — the shared provider page hands off to a legacy one where a
   * bespoke page exists (food redirects to /services/food/<legacy id>).
   */
  const resolvedPublicHref =
    publicHref
    ?? (provider?.archetype_key ? providerHref(provider.archetype_key, provider.id) : "/discovery");

  const capabilityTabs = useMemo(() => {
    if (!provider?.capabilities) return [];
    // Any capabilities not in ALL_CAPABILITIES (e.g. retired `hourly_bookings`
    // / `date_range_booking` still living in old DB rows) get silently skipped.
    return ALL_CAPABILITIES
      .filter((c) => provider.capabilities!.includes(c.key))
      .map((c) => ({ key: c.key as CapabilityKey, meta: c }));
  }, [provider]);

  // `showBookings` retired — the unified Calendar tab covers every service.
  // Kept the memo signature-hole out so the CapabilityPortal prop drop below
  // is a compile error if anyone re-adds a per-tab bookings view.

  if (isLoading) {
    return (
      <div className="app-container space-y-4 py-6">
        <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-semibold text-foreground">Provider not found</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been removed, or you don't have access.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(backHref)}>Back</Button>
      </div>
    );
  }

  const archetype = archetypes.find((a) => a.key === provider.archetype_key);
  const sourceKey = provider.source_service_key ?? "";
  const legacyId = legacyIdOf(provider);
  // Use LEGACY_PORTAL_SOURCE_KEYS (includes beach/beach_club) so beach owners
  // get BEACH_TABS. isLegacySource() only covers cars|food|cleaning; picking
  // it here left the beach workspace on the empty CapabilityPortal.
  const isLegacyPortal = LEGACY_PORTAL_SOURCE_KEYS.has(sourceKey);

  // Bookings tab — single answer to "who booked what?" backed by two views:
  //   • By day       → week calendar (UnifiedBookingCalendar)
  //   • By customer  → subscription list, service-specific body (undefined for
  //     cars, where booking IS the subscription so the toggle would be nonsense)
  const byCustomer = (() => {
    if (sourceKey === "food") {
      // FoodSubs component wants the MyRestaurant row shape — we pass legacyId
      // which is the food_providers.id; it looks up the rest itself.
      return FOOD_SUBSCRIPTIONS_TAB_BODY({ id: legacyId } as any);
    }
    if (sourceKey === "cleaning") {
      return CLEANING_SUBSCRIPTIONS_TAB_BODY({ id: legacyId } as any);
    }
    if (sourceKey === "beach" || sourceKey === "beach_club") {
      return BEACH_SUBSCRIPTIONS_TAB_BODY();
    }
    return undefined; // cars → calendar-only
  })();

  const bookingsTab: PortalTab<unknown> = {
    value: "bookings",
    label: "Bookings",
    icon: CalendarClock,
    render: () => <BookingsTab providerId={legacyId} sourceKey={sourceKey} byCustomer={byCustomer} />,
  };

  // Batches 3 + 4: dedicated Schedule tab and floating KPI strip both retired.
  //   • ScheduleAccordion rides above Offerings — the rules apply to what's below.
  //   • ProviderAnalyticsWidget rides above Overview — the KPIs are what "who I am" is measured by.
  // One uniform tab-prefix mechanism in LegacyOwnerPortal/CapabilityPortal drives both.
  const tabPrefixes: Record<string, React.ReactNode> = {
    info: (
      <div className="mb-6 space-y-3">
        <ProviderAnalyticsWidget providerId={provider.id} legacyId={legacyId} sourceKey={sourceKey} />
        {/* Reputation belongs with "how am I doing", right under the number it
            explains — the KPI strip's Rating card. Renders nothing until
            somebody has actually rated the business. */}
        <ProviderReviewsPanel providerId={provider.id} />
      </div>
    ),
    offerings: <ScheduleAccordion provider={provider} />,
  };

  // Money — what came in, what the platform kept, what has been paid out.
  // Owner-only: the payout ledger is the owner's, and the endpoint behind it
  // refuses a manager, so showing the tab to one would render an error card.
  const moneyTab: PortalTab<unknown> = {
    value: "money",
    label: "Money",
    icon: Wallet,
    ownerOnly: true,
    render: () => (
      <ProviderEarningsTab providerId={provider.id} legacyId={legacyId} sourceKey={sourceKey} />
    ),
  };
  const extraTabs: PortalTab<any>[] = [moneyTab];

  /**
   * Team — one tab for every service now that `provider_members` exists.
   * Built here rather than inside each service's bundle because it needs the
   * UNIVERSAL provider id, which the legacy bundles never carry.
   */
  const teamTab: PortalTab<unknown> = {
    value: "team",
    label: "Team",
    icon: Users,
    ownerOnly: true,
    render: () => (
      <ProviderTeamTab providerId={provider.id} ownerUserId={provider.admin_user_id ?? null} />
    ),
  };
  const tailTabs: PortalTab<any>[] = [teamTab];

  const capabilityPortal = (
    <CapabilityPortal
      provider={provider}
      capabilityTabs={capabilityTabs}
      bookingsTab={bookingsTab}
      tabPrefixes={tabPrefixes}
      extraTabs={extraTabs}
      tailTabs={tailTabs}
    />
  );

  return (
    <>
      {provider.banner_url && (
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-transparent md:h-56">
          <img src={provider.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="app-container space-y-6 py-6">
        <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-card p-4 sm:gap-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:h-14 sm:w-14">
            {provider.avatar_url ? (
              <img src={provider.avatar_url} alt={provider.name} className="h-full w-full object-cover" />
            ) : archetype ? (
              <div className="flex h-full items-center justify-center"><archetype.Icon className="h-6 w-6 text-muted-foreground/40" /></div>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{provider.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {provider.status && (
                <StatusPill status={provider.status} />
              )}
              {archetype && (
                <Badge className={`rounded-full text-xs ${archetype.accent} text-white`}>{archetype.label}</Badge>
              )}
              {/* Capability chips are meaningful only for universal-only providers
                  (where they actually gate which tabs render). For legacy-backed
                  providers the tab set comes from CAR_TABS/FOOD_TABS/CLEANING_TABS/
                  BEACH_TABS — showing "Delivery / Catalog" chips there implies a
                  toggle that has no effect. Hide them for legacy sources. */}
              {!isLegacyPortal && provider.capabilities?.map((cap) => {
                const meta = CAPABILITIES[cap as CapabilityKey];
                if (!meta) return null;
                return <Badge key={cap} variant="outline" className="rounded-full text-[10px]">{meta.label}</Badge>;
              })}
            </div>
            {provider.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{provider.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="order-last w-full shrink-0 gap-1.5 rounded-full sm:order-none sm:w-auto"
            onClick={() => window.open(resolvedPublicHref, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5" /> View Public
          </Button>
        </div>

        {isLegacyPortal
          ? <LegacyOwnerPortal sourceKey={sourceKey} legacyId={legacyId} fallback={capabilityPortal} bookingsTab={bookingsTab} tabPrefixes={tabPrefixes} extraTabs={extraTabs} tailTabs={tailTabs} />
          : capabilityPortal}
      </div>
    </>
  );
}

/**
 * Universal portal for providers with no legacy table.
 *
 * It used to name its tabs after capabilities — "Subscription plans",
 * "Catalog", "Delivery" — while all four legacy portals used
 * Overview / Offerings / Operations / Team. The owner of a massage business
 * therefore met a different structure from the owner of a cleaning business,
 * for no reason a provider could see. INFO_TAB_META's own comment already
 * asked for the legacy shape; the capability tabs just never followed it.
 *
 * Now the shape is identical and the capabilities become sub-tabs INSIDE
 * Offerings, the same way cars put Insurance / Extras / Delivery inside
 * Operations. One capability collapses to no sub-tabs at all, so a simple
 * provider sees a plain Plans editor rather than a pill row of one.
 */
function CapabilityPortal({ provider, capabilityTabs, bookingsTab, tabPrefixes = {}, extraTabs = [], tailTabs = [] }: {
  provider: UniversalProviderRow;
  capabilityTabs: { key: CapabilityKey; meta: CapabilityMeta }[];
  bookingsTab: PortalTab<unknown>;
  tabPrefixes?: Record<string, React.ReactNode>;
  /** Same extras the legacy portals get, so a universal provider isn't a
   *  second-class one — see legacyPortalTabs.assembleTabs. */
  extraTabs?: PortalTab<any>[];
  /** Appended last — Team, the same tab every service now gets. */
  tailTabs?: PortalTab<any>[];
}) {
  const InfoIcon = INFO_TAB_META.icon;
  const BookingsIcon = bookingsTab.icon;

  const renderCapability = (key: CapabilityKey, meta: CapabilityMeta) =>
    key === "subscription_plans"
      ? <UniversalPlansTab providerId={provider.id} />
      : <ComingSoonTab capability={meta} />;

  const offerings = capabilityTabs.length === 1
    ? renderCapability(capabilityTabs[0].key, capabilityTabs[0].meta)
    : (
      <InnerPillTabs
        items={capabilityTabs.map(({ key, meta }) => ({
          key: meta.tabValue,
          label: meta.tabLabel,
          render: () => renderCapability(key, meta),
        }))}
      />
    );

  return (
    <Tabs defaultValue={INFO_TAB_META.tabValue}>
      <TabsList equalWidth className="mb-6 w-full">
        <TabsTrigger value={INFO_TAB_META.tabValue} equalWidth className="gap-2 px-2 sm:px-space-4">
          <InfoIcon className="hidden h-4 w-4 sm:block" />
          <span className="hidden sm:inline">{INFO_TAB_META.tabLabel}</span>
          <span className="sm:hidden">{INFO_TAB_META.tabMobileLabel}</span>
        </TabsTrigger>
        {capabilityTabs.length > 0 && (
          <TabsTrigger value="offerings" equalWidth className="gap-2 px-2 sm:px-space-4">
            <Package className="hidden h-4 w-4 sm:block" />
            <span>Offerings</span>
          </TabsTrigger>
        )}
        <TabsTrigger value={bookingsTab.value} equalWidth className="gap-2 px-2 sm:px-space-4">
          <BookingsIcon className="hidden h-4 w-4 sm:block" />
          <span className="hidden sm:inline">{bookingsTab.label}</span>
          <span className="sm:hidden">{bookingsTab.mobileLabel ?? bookingsTab.label}</span>
        </TabsTrigger>
        {[...extraTabs, ...tailTabs].map((t) => {
          const ExtraIcon = t.icon;
          return (
            <TabsTrigger key={t.value} value={t.value} equalWidth className="gap-2 px-2 sm:px-space-4">
              <ExtraIcon className="hidden h-4 w-4 sm:block" />
              <span>{t.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value={INFO_TAB_META.tabValue}>
        {tabPrefixes[INFO_TAB_META.tabValue]}
        <UniversalInfoTab provider={provider} />
      </TabsContent>

      {capabilityTabs.length > 0 && (
        <TabsContent value="offerings">
          {tabPrefixes.offerings}
          {offerings}
        </TabsContent>
      )}

      <TabsContent value={bookingsTab.value}>
        {bookingsTab.render(null as never, true)}
      </TabsContent>

      {[...extraTabs, ...tailTabs].map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.render(null as never, true)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
