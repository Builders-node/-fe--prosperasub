import { useNavigate } from "react-router-dom";
import { CalendarClock, CarFront, ExternalLink, LandPlot, Package, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkspaceTabsCard } from "@/components/provider/WorkspaceTabsCard";
import { WorkspaceStat } from "@/components/provider/WorkspaceUI";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useAuth } from "@/contexts/AuthContext";
import { accountApi } from "@/integrations/supabase/client";
import { useProviderKpis } from "@/components/provider/ProviderAnalyticsWidget";
import { formatUSD } from "@/lib/pricing";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { providerHref } from "@/lib/services/serviceUrls";
import { INFO_TAB_META } from "@/components/provider/capabilities";
import { UniversalInfoTab, type UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { ProfileCompletenessCard } from "@/components/provider/ProfileCompletenessCard";
import { PlansTab } from "@/components/provider/plans/PlansTab";
import { ProviderItemsPanel } from "@/components/provider/ProviderItemsPanel";
import { OperationsTab } from "@/components/provider/OperationsTab";
import { PortalTabsView } from "@/components/provider/PortalTabsView";
import { CalendarsTab } from "@/components/provider/CalendarsTab";
import { BookingsTab } from "@/components/provider/BookingsTab";
import { ProviderTeamTab } from "@/components/provider/ProviderTeamTab";
import { ScheduleAccordion } from "@/components/provider/ScheduleAccordion";
import { ServiceLocationsSection } from "@/components/food/admin/ServiceLocationsSection";
import { LegacyOwnerPortal } from "@/components/provider/legacyPortalTabs";
import { VehicleFleetTab } from "@/components/provider/VehicleFleetTab";
import { SubscribersList } from "@/components/provider/SubscribersList";
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
  const { userData, isAdmin } = useAuth();
  const myEmail = userData?.email ?? null;

  /**
   * The Team tab's own record of who runs this business.
   *
   * It has to be read here as well as in the ownership check, because a
   * manager added through that tab exists in `provider_members` and nowhere
   * else — the legacy portals ask their own per-service manager tables, and
   * would have shown this person "access was removed".
   */
  const membershipQ = useQuery({
    queryKey: ["provider-membership", provider?.id, myUuid, myEmail],
    enabled: !!provider && !!myUuid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_members")
        .select("role")
        .eq("provider_id", provider!.id)
        .or(myEmail ? `user_id.eq.${myUuid},user_email.eq.${myEmail}` : `user_id.eq.${myUuid}`)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { role: string | null } | null;
    },
  });
  const isMember = !!membershipQ.data;
  /**
   * Owner, or the platform acting as one.
   *
   * A platform-owned business — the beach club — has no `admin_user_id`, so an
   * admin looking at it saw a workspace with no Money and no Team while the
   * same admin saw both on a business that happens to name an owner. Same
   * person, same rights, two different pages.
   */
  const isOwner =
    isAdmin
    || (!!myUuid && !!provider?.admin_user_id && provider.admin_user_id === myUuid)
    || membershipQ.data?.role === "owner";

  /**
   * Which table this business's money is in.
   *
   * A different question from `sourceKey` below, which asks "does this provider
   * have a legacy twin" and drives the portal bundles and the id bridge. Cars
   * have no legacy key at all — they were never a legacy service — so their
   * revenue is matched on the archetype instead. Passing the legacy key here
   * would have shown every car business a balance of zero.
   */
  const financeKey = provider?.source_service_key ?? provider?.archetype_key ?? "";

  const kpis = useProviderKpis({
    providerId: provider?.id ?? "",
    legacyId: provider ? legacyIdOf(provider) : "",
    sourceKey: financeKey,
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
  // Whether this service keeps its managers in its own legacy table, which is
  // the only reason left to route through LegacyOwnerPortal — see
  // lib/services/providerBridge.ts.
  const isLegacyPortal = LEGACY_PORTAL_SOURCE_KEYS.has(sourceKey);

  // Schedule — one tab for the whole of time: today's work, the week, and who
  // is subscribed. Operations used to sit beside it as a tab of its own, and
  // the two were lists of the same occurrences an hour apart.
  // Who is subscribed — one list for every service. It used to be three: two
  // card lists and, for the beach, an entire admin page with a data table
  // mounted inside the tab.
  const byCustomer = (
    <SubscribersList providerId={provider.id} legacyId={legacyId} sourceKey={sourceKey} />
  );

  const scheduleTab: PortalTab<unknown> = {
    value: "bookings",
    label: "Schedule",
    icon: CalendarClock,
    render: () => (
      <BookingsTab
        providerId={legacyId}
        // `bookable_resources` is keyed by the universal id, and for a
        // legacy-backed provider that is not the id the rest of this tab uses.
        universalProviderId={provider.id}
        sourceKey={sourceKey}
        byCustomer={byCustomer}
        today={<OperationsTab providerId={provider.id} />}
      />
    ),
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
      <div className="space-y-1">
        {/* What is still missing from the public profile, first — every
            provider on the platform went live without contacts, and two
            without hours or an address. Renders nothing once it is complete. */}
        {isOwner && <ProfileCompletenessCard provider={provider} />}
        {/* Reputation, right under the header's Rating tile that it explains.
            Renders nothing until somebody has actually rated the business. */}
        <ProviderReviewsPanel providerId={provider.id} />
        <UniversalInfoTab
          provider={provider}
          extra={sourceKey === "food" && legacyId
            ? <ServiceLocationsSection providerId={legacyId} />
            : undefined}
        />
      </div>
    ),
  };

  // Money — what came in, what the platform kept, what has been paid out.
  //
  // A manager sees all of it. Running a business without being able to see
  // what it earned is not running it, and the reads behind this tab now allow
  // anyone on the team. Withdrawing is the part that stays the owner's, and
  // the server says who that is — the tab does not guess.
  const moneyTab: PortalTab<unknown> = {
    value: "money",
    label: "Money",
    icon: Wallet,
    render: () => (
      <ProviderEarningsTab providerId={provider.id} legacyId={legacyId} sourceKey={financeKey} />
    ),
  };

  /**
   * Team — one tab for every service now that `provider_members` exists.
   * Built here rather than inside each service's bundle because it needs the
   * UNIVERSAL provider id, which the legacy bundles never carry.
   */
  const teamTab: PortalTab<unknown> = {
    value: "team",
    label: "Team",
    icon: Users,
    render: () => (
      // Visible to the whole team, editable by the owner. Who your colleagues
      // are is not a secret from them; appointing one is the owner's call, and
      // the endpoints behind the buttons refuse a manager either way.
      <ProviderTeamTab
        providerId={provider.id}
        ownerUserId={provider.admin_user_id ?? null}
        canManage={isOwner}
      />
    ),
  };

  /**
   * The strip, in one place, for every service.
   *
   * It used to be assembled twice: a legacy provider got its service's bundle
   * spliced with head/extra/tail tabs, and a universal one got a separate
   * portal that built its own row and never applied `ownerOnly`. So a manager
   * saw Team and Money on a massage business and not on a cleaning one, and
   * nothing universal had Operations at all — differences nobody chose, from
   * two mechanisms nobody could see at once.
   *
   * There is nothing service-specific left to justify them: Offerings is the
   * plans editor and Schedule is the occurrence list, both keyed by the
   * universal id whatever sells them. Only the beach's courts are its own.
   */
  const tabs: PortalTab<unknown>[] = [
    overviewTab,
    {
      value: "offerings",
      label: "Offerings",
      icon: Package,
      render: () => (
        <>
          {/* The booking rules apply to what is below them. */}
          <ScheduleAccordion provider={provider} />
          {/* What a day is made of, above the plans that sell it: a plan says
              how many, this says which. Only where something is delivered
              within a day — a membership has no lunch. */}
          {sourceKey === "food" && <ProviderItemsPanel providerId={provider.id} />}
          <PlansTab providerId={provider.id} sourceKey={sourceKey} />
        </>
      ),
    },
    scheduleTab,
    // A fleet is not a plan and never will be: availability is per-unit and
    // continuous, price is a function of duration, and the thing booked is one
    // physical object. So a rental business gets its own tab here while
    // remaining an ordinary `providers` row — same Overview, Money and Team as
    // every other business on the platform.
    ...(provider.archetype_key === "vehicles"
      ? [{
          value: "fleet",
          label: "Fleet",
          icon: CarFront,
          render: () => <VehicleFleetTab providerId={provider.id} canManage={isOwner} />,
        } as PortalTab<unknown>]
      : []),
    // What can be booked here, for everybody. A calendar is a bookable
    // resource — its kind, its hours, its slot length — which is a different
    // job from running the day's work, and it was a beach-only screen for no
    // reason: the engine has always taken bookings against any resource.
    {
      value: "resources",
      label: "Calendars",
      icon: LandPlot,
      render: () => <CalendarsTab providerId={provider.id} />,
    },
    moneyTab,
    teamTab,
  ];

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

      {/* No side gutter: in the design the cards ARE the page width and their
          own 16 of padding is the only inset. A container's padding on top of
          that put the text 32 from the edge and the cards on a rail. */}
      <div className="mx-auto w-full max-w-[1280px] space-y-1 pb-8 pt-1 md:px-space-4">
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

        {/* How it is doing. The four figures that used to be a strip of
            icon-plated cards under the tabs, in the design's tiles and above
            them — where a business looks before choosing where to go. */}
        <section className="grid grid-cols-2 gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          {isOwner && (
            <WorkspaceStat
              label="Balance"
              // `?? 0` used to turn a FAILED request into "$0.00" — a business
              // being told it has no money when the truth is we could not ask.
              // Unknown is "—"; only a real answer prints a figure.
              value={
                balanceQ.isPending || balanceQ.isError || balanceQ.data == null
                  ? "—"
                  : formatUSD(balanceQ.data.availableCents)
              }
            />
          )}
          <WorkspaceStat label="Customers" value={kpis.isPending || kpis.isError ? "—" : String(kpis.active)} />
          <WorkspaceStat label="Upcoming 7d" value={kpis.isPending || kpis.isError ? "—" : String(kpis.upcoming)} />
          {/* Three tiles without a Balance would leave a hole in the second
              row, so the last one takes the width instead. */}
          <div className={isOwner ? "contents" : "col-span-2 flex"}>
            <WorkspaceStat
              label={kpis.ratingCount ? `Rating · ${kpis.ratingCount}` : "Rating"}
              value={kpis.rating != null ? kpis.rating.toFixed(1) : "—"}
            />
          </div>
        </section>

        {/* One renderer too. The legacy wrapper is now only what its name
            says: it answers "may this person be here, and are they the owner",
            and hands the same strip to the same view. */}
        {isLegacyPortal
          ? <LegacyOwnerPortal sourceKey={sourceKey} legacyId={legacyId} tabs={tabs} isOwner={isOwner} isMember={isMember} />
          : <PortalTabsView tabs={tabs} provider={null} isOwner={isOwner} />}
      </div>
    </>
  );
}
