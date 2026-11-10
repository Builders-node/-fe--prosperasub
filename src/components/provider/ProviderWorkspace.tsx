import { useNavigate, useSearchParams } from "react-router-dom";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { CalendarClock, CarFront, Edit, ExternalLink, LandPlot, Megaphone, Package, Store, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkspaceTabsCard } from "@/components/provider/WorkspaceTabsCard";
import { WorkspaceSection, WorkspaceStat } from "@/components/provider/WorkspaceUI";
import { useUserUuid } from "@/hooks/useUserUuid";
import { useAuth } from "@/contexts/AuthContext";
import { accountApi } from "@/integrations/supabase/client";
import { useProviderKpis } from "@/components/provider/ProviderAnalyticsWidget";
import { formatUSD } from "@/lib/pricing";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { providerHref } from "@/lib/services/serviceUrls";
import { INFO_TAB_META } from "@/components/provider/capabilities";
import { ProviderDetailsRows, ProviderProfileEditor, type UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { ProfileCompletenessCard } from "@/components/provider/ProfileCompletenessCard";
import { GoLivePanel } from "@/components/provider/GoLivePanel";
import { ProviderQrCard } from "@/components/provider/ProviderQrCard";
import { ProviderPromoCodes } from "@/components/provider/ProviderPromoCodes";
import { ProviderPromotions } from "@/components/provider/ProviderPromotions";
import { PlansTab } from "@/components/provider/plans/PlansTab";
import { OperationsTab } from "@/components/provider/OperationsTab";
import { PortalTabsView } from "@/components/provider/PortalTabsView";
import { CalendarsTab } from "@/components/provider/CalendarsTab";
import { BookingsTab } from "@/components/provider/BookingsTab";
import { ProviderTeamTab } from "@/components/provider/ProviderTeamTab";
import { ScheduleAccordion } from "@/components/provider/ScheduleAccordion";
import { LegacyOwnerPortal } from "@/components/provider/legacyPortalTabs";
import { workspaceFor } from "@/services/workspace";
import { VEHICLES_UNIT } from "@/lib/services/vehiclesUnit";
import { SubscribersList } from "@/components/provider/SubscribersList";
import { ProviderReviewsPanel } from "@/components/provider/ProviderReviewsPanel";
import { ProviderEarningsTab } from "@/components/provider/ProviderEarningsTab";
import type { PortalTab } from "@/components/provider/portalTab";
import { LEGACY_PORTAL_SOURCE_KEYS, legacyIdOf } from "@/lib/services/providerBridge";

/**
 * The single provider management view — banner + header + tab dispatch. Layout-
 * agnostic on purpose: the user portal wraps it in UserLayout, the admin detail
 * page wraps it in SuperAdminLayout. For legacy-backed providers it mounts the
 * rich per-service tabs (admins get them too via the admin fallback in
 * legacyPortalTabs); otherwise it shows the universal capability tabs. Every
 * provider gets a Schedule tab.
 */
/** `?edit=profile` opens the profile editor — the door can live outside this component (the title bar). */
export const PROFILE_EDIT_PARAM = "edit";

export function ProviderWorkspace({ providerId, publicHref, backHref = "/my-business", editInTitleBar = false }: {
  providerId: string;
  /**
   * The page's title bar carries Edit on a phone (UserLayout's headerAction),
   * so the header card shows its own Edit only from md up. The admin layout
   * has no such bar, and keeps the card's button at every width.
   */
  editInTitleBar?: boolean;
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
  const [params, setParams] = useSearchParams();
  const editing = params.get(PROFILE_EDIT_PARAM) === "profile";
  const setEditing = (on: boolean) => setParams((prev) => {
    const q = new URLSearchParams(prev);
    if (on) q.set(PROFILE_EDIT_PARAM, "profile"); else q.delete(PROFILE_EDIT_PARAM);
    return q;
  }, { replace: true });

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
   * Which vertical's descriptors apply to this business.
   *
   * A different question from `sourceKey` below, which asks "does this provider
   * have a legacy twin" and drives the portal bundles and the id bridge.
   * Transport has no legacy key AND no archetype — it is its own unit — so a
   * rental business is matched on `providers.unit`, which is the only thing it
   * carries. Reading the archetype here would have shown every rental business
   * the wrong tabs and a balance of zero.
   */
  const serviceKey =
    provider?.unit === VEHICLES_UNIT
      ? VEHICLES_UNIT
      : provider?.source_service_key ?? provider?.archetype_key ?? "";

  /**
   * What this vertical adds to the standard workspace — nothing, for anything
   * that has not said otherwise. See services/workspace.
   */
  const custom = workspaceFor(serviceKey);

  const kpis = useProviderKpis({
    providerId: provider?.id ?? "",
    legacyId: provider ? legacyIdOf(provider) : "",
    sourceKey: serviceKey,
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
        <div className="h-20 animate-pulse rounded-radius-md bg-muted" />
        <div className="h-96 animate-pulse rounded-radius-md bg-muted" />
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
        {/* A vehicles business has no service, and its storefront is the section. */}
        {(provider.archetype_key || provider.unit === "vehicles") && (
          <ProviderQrCard
            name={provider.name}
            clientCode={provider.client_code ?? null}
            providerId={provider.id}
            publicHref={provider.archetype_key ? resolvedPublicHref : "/vehicles"}
            isPublic={provider.status === "active"}
          />
        )}
        {custom.infoExtra?.(workspaceCtx)}
        {/* How to reach the business, last on Overview: reference, not the
            first thing an owner opens the workspace for. No Edit of its own —
            the one Edit is in the title bar (phone) or the header card. */}
        <WorkspaceSection title="Details" subtitle="Shown to customers on your page">
          <ProviderDetailsRows provider={provider} />
        </WorkspaceSection>
      </div>
    ),
  };

  const workspaceCtx = {
    providerId: provider.id,
    legacyId: legacyId ?? "",
    isOwner,
    sourceKey,
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
      <ProviderEarningsTab providerId={provider.id} legacyId={legacyId} sourceKey={serviceKey} />
    ),
  };

  /**
   * Promote — what a business can buy to be seen: a boost (pay per order it
   * brings), a featured week (paid from the balance), and its own promo codes.
   * The whole team sees the numbers; spending is the owner's.
   */
  const promoteTab: PortalTab<unknown> = {
    value: "promote",
    label: "Promote",
    icon: Megaphone,
    render: () => (
      <div className="space-y-1">
        <ProviderPromotions providerId={provider.id} />
        {/* Owner-only; the API answers 403 to anyone else and it hides. */}
        {isOwner && <ProviderPromoCodes providerId={provider.id} />}
      </div>
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
      render: () => custom.offerings?.(workspaceCtx) ?? (
        <>
          {/* The booking rules apply to what is below them. */}
          <ScheduleAccordion provider={provider} />
          {custom.offeringsExtra?.(workspaceCtx)}
          <PlansTab providerId={provider.id} sourceKey={sourceKey} />
        </>
      ),
    },
    scheduleTab,
    ...(custom.extraTabs?.(workspaceCtx) ?? []),
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
    promoteTab,
    moneyTab,
    teamTab,
  ];

  return (
    <>
      {/* No side gutter: in the design the cards ARE the page width and their
          own 16 of padding is the only inset. A container's padding on top of
          that put the text 32 from the edge and the cards on a rail. */}
      <div className="mx-auto w-full max-w-[1280px] space-y-1 pb-8 md:px-space-4">
        {/* The banner IS the header — 280 tall, its own bottom corners rounded,
            with the one control the design leaves off the cards floating on it.
            It sits in the cards' column: edge to edge on a phone (the column
            has no gutter there), the column's width on a laptop — it used to
            run the full window while everything under it stopped at 1280. */}
        <div className="relative h-[280px] w-full overflow-hidden rounded-b-radius-lg bg-muted md:mt-space-4 md:rounded-radius-lg">
          <Photo src={provider.banner_url} icon={Store} loading="eager" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" />
          <button
            type="button"
            // A business that is not live yet opens in draft preview, so an admin
            // sees the page as it will look (every plan, the draft banner) rather
            // than the half-empty version a customer would get today. The flag
            // works for an admin and for whoever runs the business
            // (useDraftPreview); anyone else sees what customers see.
            onClick={() => {
              // Its service switched off hides it just as surely as its own
              // status — the public page answers "No such service" then.
              const serviceOff = archetypes.find((a) => a.key === provider.archetype_key)?.is_active === false;
              const draft = (provider.status !== "active" && provider.status !== "approved") || serviceOff;
              const href = draft
                ? `${resolvedPublicHref}${resolvedPublicHref.includes("?") ? "&" : "?"}preview=1`
                : resolvedPublicHref;
              window.open(href, "_blank");
            }}
            className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/35 px-3.5 py-2 text-[14px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/50"
          >
            <ExternalLink className="h-4 w-4" /> View public
          </button>
        </div>

        {/* Who this is: the avatar, the name and the description. The avatar is
            here so an owner sees the picture customers see — without it there
            was no way to tell from the workspace that one had been uploaded. */}
        <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <div className="flex items-start gap-3">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full">
              <Photo src={provider.avatar_url} label={initialsOf(provider.name)} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[24px] font-semibold leading-[29px] text-foreground">{provider.name}</h1>
              {provider.description && (
                <p className="mt-2 text-body text-muted-foreground">{provider.description}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(true)}
              className={editInTitleBar ? "hidden shrink-0 gap-2 md:inline-flex" : "shrink-0 gap-2"}
            >
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>

          {/* A business still under review needs telling; an approved one does
              not need a badge saying so on every visit. */}
          {provider.status && !["approved", "active"].includes(provider.status) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={provider.status} />
              {archetype && (
                <Badge className="rounded-full bg-inset text-xs text-foreground hover:bg-inset">{archetype.label}</Badge>
              )}
            </div>
          )}
        </section>

        {/* Draft → live, for the platform: the checklist and the switch on the
            business itself, not in a list's row menu. */}
        {/* The admin gets the switch; the owner gets the same checklist,
            their own preview, and a way to say "ready". */}
        <GoLivePanel
          provider={provider}
          ownerView={!isAdmin}
          previewHref={`${resolvedPublicHref}${resolvedPublicHref.includes("?") ? "&" : "?"}preview=1`}
        />

        {/* How it is doing. The four figures that used to be a strip of
            icon-plated cards under the tabs, in the design's tiles and above
            them — where a business looks before choosing where to go. */}
        <section className="grid grid-cols-2 gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em] md:grid-cols-4">
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
          <WorkspaceStat label="Active customers" value={kpis.isPending || kpis.isError ? "—" : String(kpis.active)} />
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

      <ProviderProfileEditor provider={provider} open={editing} onOpenChange={setEditing} />
    </>
  );
}
