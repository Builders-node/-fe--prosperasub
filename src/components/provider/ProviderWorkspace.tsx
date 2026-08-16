import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ExternalLink, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkspaceTabsCard } from "@/components/provider/WorkspaceTabsCard";
import { useUserUuid } from "@/hooks/useUserUuid";
import { accountApi } from "@/integrations/supabase/client";
import { fetchProviderStats } from "@/components/provider/ProviderAnalyticsWidget";
import { formatUSD } from "@/lib/pricing";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { providerHref } from "@/lib/services/serviceUrls";
import {
  ALL_CAPABILITIES, ComingSoonTab, INFO_TAB_META,
  type CapabilityKey, type CapabilityMeta,
} from "@/components/provider/capabilities";
import { UniversalInfoTab, type UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { UniversalPlansTab } from "@/components/provider/UniversalPlansTab";
import { InnerPillTabs } from "@/components/provider/InnerPillTabs";
import { BookingsTab } from "@/components/provider/BookingsTab";
import { ProviderTeamTab } from "@/components/provider/ProviderTeamTab";
import { ScheduleAccordion } from "@/components/provider/ScheduleAccordion";
import { ServiceLocationsSection } from "@/components/food/admin/ServiceLocationsSection";
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

  /**
   * Whose business this is. The two numbers below are the owner's — a manager
   * runs the day but is not owed the money, and the payout endpoint refuses
   * them anyway, so asking for it on their behalf would render an error where
   * a figure should be.
   */
  const myUuid = useUserUuid();
  const isOwner = !!myUuid && !!provider?.admin_user_id && provider.admin_user_id === myUuid;

  const statsQ = useQuery({
    // Same key the analytics strip inside Overview uses, so the customer count
    // up here and the one down there are one fetch and can never disagree.
    queryKey: ["provider-analytics", provider?.source_service_key ?? "", legacyIdOf(provider ?? {} as never)],
    enabled: !!provider,
    staleTime: 60_000,
    queryFn: () => fetchProviderStats(provider!.source_service_key ?? "", legacyIdOf(provider!)),
  });

  const balanceQ = useQuery({
    // And the same key as the Money tab's own figure — "Balance" is what the
    // platform will actually release: earned all-time minus what has been
    // requested or already sent. Anything else under that word is a promise
    // the payout screen would then refuse.
    queryKey: ["provider-payout-available", provider?.id],
    enabled: isOwner && !!provider,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${provider!.id}/payouts/available`);
      if (error) throw new Error(String(error));
      return data as { availableCents: number };
    },
  });

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
    offerings: <ScheduleAccordion provider={provider} />,
  };

  /**
   * Overview — one tab, built once, for every service.
   *
   * Food, cleaning and the beach each used to ship their own Info tab writing
   * the same six fields to their own legacy table. They are gone: the profile
   * lives on `providers`, so the tab is built here (where the universal row
   * is) and injected into whichever portal renders. Food keeps its service
   * locations through the `extra` slot — the one thing that was never generic.
   */
  const overviewTab: PortalTab<unknown> = {
    value: INFO_TAB_META.tabValue,
    label: INFO_TAB_META.tabLabel,
    mobileLabel: INFO_TAB_META.tabMobileLabel,
    icon: INFO_TAB_META.icon,
    render: () => (
      <>
        <div className="mb-6 space-y-3">
          <ProviderAnalyticsWidget providerId={provider.id} legacyId={legacyId} sourceKey={sourceKey} />
          {/* Reputation belongs with "how am I doing", right under the number it
              explains — the KPI strip's Rating card. Renders nothing until
              somebody has actually rated the business. */}
          <ProviderReviewsPanel providerId={provider.id} />
        </div>
        <UniversalInfoTab
          provider={provider}
          extra={sourceKey === "food" && legacyId
            ? <ServiceLocationsSection providerId={legacyId} />
            : undefined}
        />
      </>
    ),
  };
  const headTabs: PortalTab<any>[] = [overviewTab];

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
      overviewTab={overviewTab}
    />
  );

  return (
    <>
      {/* The banner IS the header — 280 tall, its own bottom corners rounded,
          with the one control the design leaves off the cards floating on it. */}
      <div className="relative h-[280px] w-full overflow-hidden rounded-b-radius-lg bg-muted">
        {provider.banner_url
          ? <img src={provider.banner_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" />
        <button
          type="button"
          onClick={() => window.open(resolvedPublicHref, "_blank")}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/35 px-3.5 py-2 text-[14px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/50"
        >
          <ExternalLink className="h-4 w-4" /> View public
        </button>
      </div>

      <div className="app-container space-y-1 pb-8 pt-1">
        {/* Who this is. Name and description only, as in the frame: the avatar
            and the capability chips said nothing to the person who owns the
            business and already knows both. */}
        <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <h1 className="text-[24px] font-semibold leading-[29px] text-foreground">{provider.name}</h1>
          {provider.description && (
            <p className="mt-2 text-[16px] leading-[22px] text-muted-foreground">{provider.description}</p>
          )}
          {/* A business still under review needs telling; an approved one does
              not need a badge saying so on every visit. */}
          {provider.status && !["approved", "active"].includes(provider.status) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={provider.status} />
              {archetype && (
                <Badge className={`rounded-full text-xs ${archetype.accent} text-white`}>{archetype.label}</Badge>
              )}
            </div>
          )}
        </section>

        {/* How it is doing. */}
        <section className="flex gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          {isOwner && (
            <WorkspaceStat
              label="Balance"
              value={balanceQ.isPending ? "—" : formatUSD(balanceQ.data?.availableCents ?? 0)}
            />
          )}
          <WorkspaceStat
            label="Customers"
            value={statsQ.isPending ? "—" : String(statsQ.data?.active ?? 0)}
          />
        </section>

        {isLegacyPortal
          ? <LegacyOwnerPortal sourceKey={sourceKey} legacyId={legacyId} fallback={capabilityPortal} bookingsTab={bookingsTab} tabPrefixes={tabPrefixes} extraTabs={extraTabs} tailTabs={tailTabs} headTabs={headTabs} />
          : capabilityPortal}
      </div>
    </>
  );
}

/** One number on the inset fill: 16 of label over 24 of figure. */
function WorkspaceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col rounded-radius-md bg-inset p-3">
      <span className="text-[16px] leading-[22px] text-muted-foreground">{label}</span>
      <span className="mt-1 text-[24px] font-semibold leading-[29px] tabular-nums text-foreground">{value}</span>
    </div>
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
function CapabilityPortal({ provider, capabilityTabs, bookingsTab, tabPrefixes = {}, extraTabs = [], tailTabs = [], overviewTab }: {
  provider: UniversalProviderRow;
  capabilityTabs: { key: CapabilityKey; meta: CapabilityMeta }[];
  bookingsTab: PortalTab<unknown>;
  tabPrefixes?: Record<string, React.ReactNode>;
  /** Same extras the legacy portals get, so a universal provider isn't a
   *  second-class one — see legacyPortalTabs.assembleTabs. */
  extraTabs?: PortalTab<any>[];
  /** Appended last — Team, the same tab every service now gets. */
  tailTabs?: PortalTab<any>[];
  /** Built by the workspace so legacy and universal portals show one Overview. */
  overviewTab: PortalTab<unknown>;
}) {
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

  const stripTabs = [
    { value: INFO_TAB_META.tabValue, label: INFO_TAB_META.tabLabel },
    ...(capabilityTabs.length > 0 ? [{ value: "offerings", label: "Offerings" }] : []),
    { value: bookingsTab.value, label: bookingsTab.label },
    ...[...extraTabs, ...tailTabs].map((t) => ({ value: t.value, label: t.label })),
  ];

  return (
    <Tabs defaultValue={INFO_TAB_META.tabValue} className="space-y-1">
      <WorkspaceTabsCard tabs={stripTabs} />

      <TabsContent value={INFO_TAB_META.tabValue} className="mt-1">
        {overviewTab.render(null as never, true)}
      </TabsContent>

      {capabilityTabs.length > 0 && (
        <TabsContent value="offerings" className="mt-1">
          {tabPrefixes.offerings}
          {offerings}
        </TabsContent>
      )}

      <TabsContent value={bookingsTab.value} className="mt-1">
        {bookingsTab.render(null as never, true)}
      </TabsContent>

      {[...extraTabs, ...tailTabs].map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-1">
          {t.render(null as never, true)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
