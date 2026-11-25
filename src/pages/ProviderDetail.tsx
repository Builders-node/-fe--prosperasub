import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useTrackFunnel } from "@/lib/funnel";
import { DetailHeader } from "@/components/patterns/DetailHeader";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/patterns/Breadcrumbs";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatWorkingHours, openStatus, openStatusLabel } from "@/lib/workingHours";
import { nowHN } from "@/lib/timezone";
import { formatTime } from "@/lib/formatTime";
import { priceUnit } from "@/lib/checkout/ctaLabel";
import { periodNoun } from "@/lib/services/planPeriod";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PhotoSlider } from "@/components/patterns/PhotoSlider";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { archetypeFromSlug, businessHref, planHref, planSegment, serviceMetaFromSlug, serviceSlug, type Addressable } from "@/lib/services/serviceUrls";
import { Button } from "@/components/ui/button";
import {
  SparklesIcon, Waves, Car,
  MapPin, Phone, Mail, Clock, Star,
  Store, CalendarDays, ChevronRight,
} from "lucide-react";
import { ShareButton } from "@/components/patterns/ShareButton";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { QueryError } from "@/components/patterns/QueryError";
import { Skeleton } from "@/components/patterns/Skeleton";
import { TabEmptyState } from "@/components/subscriptions/MySubsPrimitives";
import { CleaningPackageCard } from "@/components/patterns/CleaningPackageCard";
import { EntertainmentPlanCard } from "@/components/patterns/EntertainmentPlanCard";
import { UniversalPlanCard, type UniversalPlan } from "@/components/patterns/UniversalPlanCard";
import { OfferCard, PriceLine } from "@/components/discovery/homePlans";
import { useTagDictionary } from "@/lib/tags";
import {
  ProviderReviewsBlock,
  type ProviderReviewService,
} from "@/components/reviews/ProviderReviewsBlock";
import { resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import { formatUSD } from "@/lib/pricing";
import { LinkifiedText } from "@/components/patterns/LinkifiedText";
import { VehicleCard, useVehicles, useVehicleTypes } from "@/features/vehicles";
import { isVehiclesProvider, VEHICLES_LABEL } from "@/lib/services/vehiclesUnit";
import { carProviderPath } from "@/features/vehicles";
import { YdSectionHeading } from "@/components/yd/YdPrimitives";
import { useTabParam } from "@/hooks/useTabParam";
import { useSeo, businessJsonLd } from "@/hooks/useSeo";
import { useDraftPreview } from "@/hooks/useDraftPreview";
import { DraftPreviewBanner } from "@/components/patterns/DraftPreviewBanner";
import { tr, trx } from "@/lib/tr";

// ── Types ───────────────────────────────────────────────────────────────────
interface Provider {
  id: string;
  name: string;
  status?: string | null;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  /** JSONB since the profile moved to `providers` — a schedule, not a string. */
  working_hours: unknown;
  contact_phone: string | null;
  contact_email: string | null;
  archetype_key: string | null;
  /** Which unit runs this business: marketplace, or transport (vehicles). */
  unit?: string | null;
  /** Null means the provider has no legacy table — its offer is in provider_plans. */
  source_service_key: string | null;
  gallery_urls?: string[] | null;
  /** The owner — lets them moderate their own reviews. */
  admin_user_id?: string | null;
}

// ── Per-archetype meta (icon + heading + fallback route) ────────────────────
// Colors are unified — single primary accent, no per-archetype tinting. Only
// the icon shown in the hero avatar tile + the label ("Plans" vs "Vehicles")
// differ. Discovery is the only surface where archetype colour lives.
type ArchetypeMeta = {
  offeringsHeading: string;
  icon: React.ComponentType<{ className?: string }>;
  listingRoute: string;
};

// Per-service metadata now lives in lib/services/serviceUrls.ts alongside the
// URL vocabulary, so a service can't be spelled one way in a link and another
// way in the lookup.
const FALLBACK_META: ArchetypeMeta = {
  offeringsHeading: tr("Offerings"),
  icon:             SparklesIcon,
  listingRoute:     "/discovery",
};

// ═══════════════════════════════════════════════════════════════════════════
// Offerings queries — filtered by universal owner_provider_id.
// Card visuals live in shared components (@/components/patterns/*Card.tsx) so
// listing and detail render identically.
// ═══════════════════════════════════════════════════════════════════════════
function useCleaningPlans(providerId: string | undefined) {
  return useQuery({
    queryKey: ["provider-detail:cleaning-packages", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_packages")
        .select("*")
        .eq("owner_provider_id", providerId!)
        // Same three-flag rule as the storefront listing — see CleaningPackages.
        .eq("status", "active")
        .eq("is_active", true)
        .eq("visibility", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!providerId,
  });
}

function useEntertainmentPlans(providerId: string | undefined) {
  return useQuery({
    queryKey: ["provider-detail:entertainment-plans", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_plans")
        .select("*")
        .eq("owner_provider_id", providerId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!providerId,
  });
}

/**
 * Plans for a provider that has no legacy table behind it.
 *
 * The branches above each know one legacy table's columns. A universal-only
 * provider — one with `source_service_key` null — has none of those, so its
 * offer lives in `provider_plans` and nothing else on this page would find it.
 * Without this the provider renders with a "Plans" heading over "No plans yet"
 * no matter how many plans an admin has entered.
 */
function useUniversalPlans(providerId: string | undefined, enabled: boolean, preview = false) {
  return useQuery({
    queryKey: ["provider-detail:universal-plans", providerId, preview],
    queryFn: async () => {
      let q = supabaseDb
        .from("provider_plans")
        // `*` carries the address in words (slug, public_no) — see planSegment.
        .select("*")
        .eq("provider_id", providerId!);
      // ?preview=1 (admin): a draft provider's plans before they go live.
      if (!preview) q = q.eq("status", "active");
      const { data, error } = await q
        // Private plans sell by link, not from the provider's public page.
        .eq("visibility", "public")
        // Offers only. A variant is reached by picking options on its offer.
        .is("parent_plan_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UniversalPlan[];
    },
    enabled: !!providerId && enabled,
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// Shared primitives (copied from FoodProviderDetail for pixel-parity)
// ═══════════════════════════════════════════════════════════════════════════
function Stat({
  label, value, sub,
}: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</span>
      {sub != null && (
        <span className="mt-0.5 flex h-3.5 items-center text-[10px] uppercase tracking-wide text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  );
}

function InfoRow({
  icon, label, value, iconText,
}: { icon: React.ReactNode; label: string; value: string; iconText: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className={`mt-0.5 shrink-0 ${iconText}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground whitespace-pre-line">{value}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════
/** The three faces of a provider, in the design's order. */
const TABS = [
  { key: "plans", label: tr("Plans") },
  { key: "reviews", label: tr("Reviews") },
  { key: "gallery", label: tr("Gallery") },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ProviderDetail = () => {
  const navigate = useNavigate();
  // In the URL, so a reload — or a link to this provider's gallery — lands
  // where it should. See useTabParam.
  const [tab, setTab] = useTabParam<TabKey>(["plans", "reviews", "gallery"]);
  // "Plans" for a service, "Vehicles" for a fleet — the same three tabs, named
  // after what the business sells (SERVICE_META.offeringsHeading).
  // The bell on the banner goes where the app's bell always goes.
  // The segment is the business's slug (/businesses/scuba-shop) or, from older
  // links, its uuid. Everything below is keyed by the resolved uuid.
  const { archetypeKey: urlSegment, providerId: providerParam } = useParams<{ archetypeKey: string; providerId: string }>();
  const paramIsId = !!providerParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerParam);
  const location = useLocation();
  const providerQ = useQuery({
    queryKey: ["provider-detail", providerParam],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        // source_provider_id is needed to hand food off to its legacy page — see the
        // redirect below.
        .select("*") // includes `slug` once the provider_slugs migration is applied
        .eq(paramIsId ? "id" : "slug", providerParam!).single();
      if (error) throw error;
      return data as Provider;
    },
    enabled: !!providerParam,
  });
  /** The business's uuid — what every other query on this page is keyed by. */
  const providerId: string | undefined = (providerQ.data as { id?: string } | undefined)?.id ?? (paramIsId ? providerParam : undefined);
  const providerSlug = (providerQ.data as { slug?: string | null } | undefined)?.slug ?? null;
  /**
   * Which service the business sells in. The address no longer says
   * (/businesses/scuba-shop), so the business's own row does; an old address
   * (/services/<service>/providers/<slug>) still carries it while it loads.
   * A rental company has no service — its vertical is the transport unit.
   */
  const serviceSegment: string | undefined = urlSegment
    ?? (providerQ.data && !isVehiclesProvider(providerQ.data)
      ? ((providerQ.data as { archetype_key?: string | null }).archetype_key ?? undefined)
      : undefined);
  /**
   * Which vertical this page is showing.
   *
   * The business's row says so (an old address's segment, while it loads). A
   * rental company has no service, so an absent segment is not a wrong URL —
   * it is the transport unit.
   */
  const archetypeKey = serviceSegment ? archetypeFromSlug(serviceSegment) : "rental";
  /**
   * A service created in the admin (healthcare, pantry…) has no entry in the
   * static slug map above — that map only knows the four legacy verticals —
   * so its key in `service_archetypes` is what makes the segment valid. Every
   * archetype, not only active ones: an admin previews a draft service's
   * provider before it launches. Without this, every universal provider's
   * public page answered "No such service".
   */
  const { archetypes: allArchetypes, isLoading: archetypesLoading } = useServiceArchetypes(false);
  const dbArchetype = serviceSegment
    ? allArchetypes.find((a) => a.key === serviceSegment.trim().toLowerCase())
    : undefined;


  // Inside the unit there is no slug in the URL, and a transport provider has
  // no archetype to derive one from — it names its own vertical instead.
  const meta = serviceMetaFromSlug(
    serviceSegment ?? (isVehiclesProvider(providerQ.data) ? "vehicles" : undefined),
  ) ?? FALLBACK_META;
  // Where the visitor actually was; the listing is only the cold-landing
  // fallback. See hooks/useGoBack.
  const goBack = useGoBack(meta.listingRoute);
  const Icon = meta.icon;

  // Offerings queries — always hooked (React rules); the caller only reads the
  // one that matches this archetype. Filtered by universal owner_provider_id.
  const cleaningQ = useCleaningPlans(providerId);
  const entertainmentQ = useEntertainmentPlans(providerId);

  // A provider with no legacy table behind it shows provider_plans instead of
  // whatever its archetype's legacy branch would query. Hooks must all run
  // before any early return, so this is declared here and gated with `enabled`
  // rather than being called conditionally further down.
  // Note the `!!providerQ.data &&`: without it this is true while the provider
  // is still loading, and the backfill gave every LEGACY provider provider_plans
  // rows too — so a cleaning provider would briefly fetch, and could render, a
  // duplicate set of plans it already shows from cleaning_packages.
  const isUniversal = !!providerQ.data && !providerQ.data.source_service_key;
  /**
   * One plans query, every service.
   *
   * There were three — a cleaning one, an entertainment one and this — because
   * each service kept its plans in its own table. They are all mirrored into
   * `provider_plans` now, offers and all, so the page stops asking which
   * business it is looking at. Food used to be a fourth branch and got a whole
   * second page instead; that fork is gone above.
   */
  const preview = useDraftPreview();
  const plansQ = useUniversalPlans(providerId, !!providerId, preview);
  const { labelsOf } = useTagDictionary();
  // The business's sales funnel (lib/funnel) — not while an admin previews a draft.
  useTrackFunnel("provider_view", providerQ.data?.id, null, !preview && !!providerQ.data);

  /**
   * A rental company's offerings are its cars. The car IS the offer — the
   * one sales-model difference vehicles legitimately keeps — so the plans tab
   * shelves the fleet with the same card the /vehicles listing uses, and the
   * page around it (Reviews, Gallery, Book a time) stays the page every other
   * business gets. Declared unconditionally per the Rules of Hooks; fetches
   * only when the business turns out to rent cars.
   */
  const isVehicles = isVehiclesProvider(providerQ.data);
  /**
   * One business, one address: /businesses/<slug>. A uuid link, the old
   * /services/<service>/providers/<slug> and the old /vehicles/providers/<id>
   * all land here, replaced so Back still leaves the page.
   */
  const canonicalPath = providerQ.data?.id ? businessHref(providerSlug ?? providerQ.data.id) : null;
  const transportHome = canonicalPath && canonicalPath !== location.pathname.replace(/\/+$/, "")
    ? `${canonicalPath}${location.search}${location.hash}`
    : null;
  const vehiclesQ = useVehicles({ providerId, enabled: !!providerId && isVehicles });
  // Type labels for the fleet shelf — one business can rent cars AND
  // motorbikes, and a mixed shelf groups by the vehicle's own type.
  const vehicleTypesQ = useVehicleTypes({ enabled: isVehicles });

  /**
   * Does this business take bookings on a calendar? If it does, the customer
   * needs a way in — the booking screen was reachable from the beach club and
   * nowhere else, so a provider could publish calendars nobody could see.
   */
  const bookableQ = useQuery({
    queryKey: ["provider-has-calendars", providerId],
    enabled: !!providerId,
    staleTime: 60_000,
    queryFn: async () => {
      // Names, not a count: "1 calendar" was the admin's word for it; the
      // customer books the dive boat, not a calendar.
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name")
        .eq("provider_id", providerId!)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; name: string | null }>)
        .map((r) => ({ id: r.id, name: r.name?.trim() ?? "" }))
        .filter((r) => r.name);
    },
  });

  // Rating summary — must be declared BEFORE any early return to satisfy
  // Rules of Hooks. `enabled` gates the actual fetch until we have the id.
  const ratingSummaryQ = useQuery({
    queryKey: ["provider-rating-summary", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_reviews")
        .select("rating")
        .eq("provider_id", providerId!)
        .is("hidden_at", null);
      if (error) throw error;
      const rows = (data ?? []) as { rating: number }[];
      const count = rows.length;
      const avg = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
      return { count, avg };
    },
    enabled: !!providerId,
  });

  /**
   * A card opens the plan, never the checkout.
   *
   * Going straight to payment skipped the page where the offer is actually
   * described and where its options are chosen — so an offer sold in variants
   * was bought before the customer picked one. It is also the rule everywhere
   * else on the platform; this page was the exception. No sign-in gate here:
   * reading what is on offer is public, and the checkout asks at its own door.
   */
  /**
   * Link by the plan's ORIGINAL id where it has one.
   *
   * These rows come from `provider_plans`, and for a legacy plan that row is a
   * mirror with an id of its own. Linking by it sent the customer to the same
   * product under a second address; the page corrects it, but a link that is
   * right to begin with beats a redirect.
   */


  // ── Loading / not-found (mirror FoodProviderDetail) ──────────────────────
  // An unknown service segment is a wrong URL, not an empty business. Saying so
  // beats the old silent fallback, which rendered a bare "Offerings" heading
  // over nothing and looked like the provider had simply stopped trading. A
  // MISSING segment is not unknown — see archetypeKey above.
  /**
   * What this page says it is, hoisted above the early returns below —
   * a hook after a `return` is the crash the build gate exists to catch.
   * It reads the query rather than the unwrapped row, so it runs on the
   * loading pass too and simply says nothing until the business arrives.
   */
  const seoProvider = providerQ.data;
  const seoPath = seoProvider ? businessHref(providerSlug ?? seoProvider.id) : null;
  useSeo({
    title: seoProvider?.name ?? null,
    description: seoProvider
      ? seoProvider.description
        ?? `${seoProvider.name}${seoProvider.location ? ` · ${seoProvider.location}` : ""} on EverySub.`
      : null,
    path: seoPath,
    image: seoProvider?.banner_url ?? seoProvider?.avatar_url ?? null,
    jsonLd: seoProvider && seoPath
      ? businessJsonLd({
          name: seoProvider.name,
          description: seoProvider.description,
          image: seoProvider.banner_url ?? seoProvider.avatar_url,
          url: seoPath,
          phone: seoProvider.contact_phone,
          email: seoProvider.contact_email,
          address: seoProvider.location,
          rating: ratingSummaryQ.data ?? null,
        })
      : null,
  });

  // Any old address of this business is replaced by its one address.
  if (transportHome) return <Navigate to={transportHome} replace />;

  if (serviceSegment && !archetypeKey && !dbArchetype && archetypesLoading) {
    return (
      <BrowseLayout className="md:pb-0">
        <HomeHeader title={tr("Provider")} showBackButton onBack={goBack} />
        <main className="app-container py-space-6 space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-24" />
        </main>
      </BrowseLayout>
    );
  }

  // A switched-off service is a draft: only an admin previewing it gets in.
  const draftService = !archetypeKey && !!dbArchetype && !dbArchetype.is_active && !preview;
  if (serviceSegment && !archetypeKey && (!dbArchetype || draftService)) {
    return (
      <BrowseLayout className="md:pb-0">
        <HomeHeader title={tr("Not found")} showBackButton onBack={goBack} />
        <main className="app-container flex flex-col items-center justify-center py-16 text-center">
          <SparklesIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">{tr("No such service")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{trx("\"{serviceSegment}\" isn't a service on the platform.", { serviceSegment })}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/discovery">{tr("Browse services")}</Link>
          </Button>
        </main>
      </BrowseLayout>
    );
  }



  if (providerQ.isLoading) {
    return (
      <BrowseLayout className="md:pb-0">
        <HomeHeader title={tr("Provider")} showBackButton onBack={goBack} />
        <main className="app-container py-space-6 space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </main>
      </BrowseLayout>
    );
  }

  // A business that is not live is a draft too — the page used to show it to
  // anyone holding the link. Admins see it with ?preview=1.
  const hiddenProvider = !!providerQ.data?.status
    && !["active", "approved"].includes(providerQ.data.status) && !preview;
  if (providerQ.isError || !providerQ.data || hiddenProvider) {
    return (
      <BrowseLayout className="md:pb-0">
        <HomeHeader title={tr("Provider")} showBackButton onBack={goBack} />
        <main className="app-container flex flex-col items-center justify-center py-16">
          <Icon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">{tr("Provider not found")}</p>
        </main>
      </BrowseLayout>
    );
  }

  const p = providerQ.data;
  // Every business gets the 280px band — its banner, or the standard
  // placeholder — so all business pages open the same way.
  const hasBanner = true;
  // Opaque once the photo has scrolled past — or from the start when there is
  // no photo. Translucent glass over a white car was neither header nor photo.

  // A rental company's offerings are cars, so the strip reads the fleet: the
  // cheapest day rate, counted in cars. Everyone else reads their plans.
  const planPrices = isVehicles
    ? (vehiclesQ.data ?? []).map((v) => v.daily_price_cents ?? 0).filter((n) => n > 0)
    : (plansQ.data ?? []).map((r) => r.price_cents ?? 0).filter((n) => n > 0);
  const offeringsCount = isVehicles ? (vehiclesQ.data?.length ?? 0) : (plansQ.data?.length ?? 0);
  const fromPrice = Math.min(...(planPrices.length ? planPrices : [0]));
  // A plan carries its own period and they need not agree inside one provider,
  // so the strip stays silent rather than asserting "/ month". A day rate is
  // one honest unit, so cars say it.
  const fromUnit = isVehicles ? "/ day" : "";
  /**
   * The middle stat is what a period includes — "4 cleanings", "5 meals" —
   * which is the number a customer compares between providers. It used to be
   * a per-archetype label; the plan now carries the quantity and the noun, so
   * the strip reads them instead of knowing the services.
   */
  const quantities = [...new Set(
    (plansQ.data ?? []).map((r) => r.included_quantity ?? 0).filter((n) => n > 0),
  )].sort((a, b) => a - b);
  const includedUnit = (plansQ.data ?? []).find((r) => r.included_unit)?.included_unit ?? null;
  // A range where the plans disagree, because one provider's plans can include
  // 4 cleanings and 26. Picking the first would print whichever happened to
  // sort first and call it the answer.
  const middleStatLabel = isVehicles ? tr("Cars")
    : quantities.length && includedUnit
    ? `${includedUnit[0].toUpperCase()}${includedUnit.slice(1)}s`
    : tr("Plans");
  const middleStatSub = quantities.length ? tr("Per period") : "Offered";
  const middleStatValue = quantities.length === 0 ? offeringsCount
    : quantities.length === 1 ? quantities[0]
    : `${quantities[0]}–${quantities[quantities.length - 1]}`;

  // Every archetype collects reviews — the customer sees ★ ratings on the cards,
  // so the Reviews tab must work wherever they arrived from. cleaning/food keep
  // their own key; beach is "beach"; any other (universal) provider is "plan".
  // The club is recognised by its own row, not by the service it is filed
  // under — it moved out of Lifestyle and its reviews must not move with the URL.
  const reviewService: ProviderReviewService =
    providerQ.data?.source_service_key === "beach" ? "beach" :
    archetypeKey === "cleaning" ? "cleaning" :
    archetypeKey === "entertainment" ? "beach" :
    archetypeKey === "food" ? "food" :
    isVehicles ? "cars" : "plan";
  // "Cleaning", "Food", "Beach Club" — the word the customer arrived through.
  const serviceLabel = isVehicles
    ? VEHICLES_LABEL
    : !archetypeKey && dbArchetype
      ? dbArchetype.label
      : serviceSlug(archetypeKey ?? "")
          .split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const gallery = Array.isArray(p.gallery_urls)
    ? p.gallery_urls.filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  const hours = formatWorkingHours(p.working_hours);

  const crumbs = [
    { label: tr("Home"), href: "/discovery" },
    ...(serviceLabel?.trim() && serviceLabel.trim().toLowerCase() !== p.name.trim().toLowerCase()
      ? [{ label: serviceLabel, href: meta.listingRoute }]
      : []),
    { label: p.name },
  ];

  /**
   * The description, unless it only says the name again. "Beach Club —
   * memberships and courts" under a "Beach Club" heading read the name twice;
   * what follows the name is the tagline, so that is what is kept.
   */
  const tagline = (() => {
    const d = p.description?.trim();
    if (!d) return null;
    const name = p.name.trim();
    if (d.toLowerCase() === name.toLowerCase()) return null;
    if (d.toLowerCase().startsWith(name.toLowerCase())) {
      const rest = d.slice(name.length).replace(/^\s*[—–\-:|·,]\s*/, "").trim();
      if (rest && rest !== d.slice(name.length).trim()) return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    return d;
  })();

  // The cheapest subscription, with its own unit — "from $75 / month". A
  // one-time day pass is cheaper but is not what "from" means on a page of
  // memberships, so it counts only when nothing recurs. The plans need not
  // share a period, so the unit is that plan's own, never assumed.
  const priced = (plansQ.data ?? [])
    .filter((r) => (r.price_cents ?? 0) > 0)
    .sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0));
  const cheapestPlan = isVehicles ? null
    : priced.find((r) => !!r.period && !!periodNoun(r.period)) ?? priced[0] ?? null;
  const headPrice = isVehicles ? fromPrice : (cheapestPlan?.price_cents ?? 0);
  const fromLabel = headPrice > 0
    ? `from ${formatPrice(headPrice)}${isVehicles
        ? " / day"
        : cheapestPlan ? ` ${priceUnit({ period: cheapestPlan.period ?? null, perPerson: (cheapestPlan as { pricing_mode?: string }).pricing_mode === "per_person" })}`.trimEnd() : ""}`
    : null;
  const rating = ratingSummaryQ.data;
  const status = openStatus(p.working_hours, nowHN());
  const mapHref = p.location?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.location.trim()}`)}`
    : null;
  const calendars = bookableQ.data ?? [];

  return (
    <BrowseLayout className="md:pb-0">
      {preview && <div className="app-container pt-3"><DraftPreviewBanner /></div>}

      {/* The same header as the plan and car pages — one component, so the
          three detail pages cannot drift apart again. On a phone it floats on
          the banner and turns solid once the photo has scrolled under it. A
          laptop has no bar: the breadcrumb is the way back, and favourite and
          share sit beside the business's name. */}
      <DetailHeader
        title={p.name}
        centreLabel={serviceLabel}
        onBack={goBack}
        overPhoto={hasBanner}
        rightAction={
          <div className="flex items-center">
            <FavoriteButton kind="provider" id={p.id} name={p.name} className="hover:bg-black/10 md:text-foreground" />
            <ShareButton
              title={p.name}
              text={[serviceLabel, p.name].filter(Boolean).join(" · ")}
              className="hover:bg-black/10 md:text-foreground"
            />
          </div>
        }
      />

      {/* Laptop: Home › service › business, above the photograph — under it,
          the trail sat between the picture and the name it leads to. */}
      <div className="hidden md:app-container md:block md:pt-space-4">
        <Breadcrumbs items={crumbs} />
      </div>

      {/* A cover, not a poster: 200px on a phone, 260 on a laptop. At 380 the
          photograph pushed the business's name and its Book button below the
          first screen. */}
      {hasBanner && (
        <div className="md:app-container md:pt-space-3">
          <div data-detail-photo className="relative h-[200px] w-full overflow-hidden rounded-b-radius-lg bg-inset md:h-[260px] md:rounded-radius-lg">
            <Photo src={p.banner_url} icon={Store} loading="eager" className="absolute inset-0" />
            {/* The scrim keeps the phone's white chrome legible on any photo. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/50 to-transparent md:hidden" />
          </div>
        </div>
      )}

      <main className="app-container pb-8 md:pb-8">
        {/* ─── Who this is ─────────────────────────────────────────────────
            Logo on the cover's edge; name; what people compare first (rating,
            the price it starts at); where it is and whether it is open now;
            and one way to book. */}
        <section className="relative px-1 pb-4 tracking-[-0.02em] md:px-2">
          <Photo
            src={p.avatar_url}
            alt=""
            label={initialsOf(p.name)}
            className="relative -mt-10 h-20 w-20 shrink-0 rounded-full border-4 border-background object-cover md:-mt-12 md:h-24 md:w-24"
          />

          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="text-[26px] font-semibold leading-tight text-foreground md:text-[32px]">{p.name}</h1>

              {/* Rating · price · service — one line a customer scans. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-[22px] text-muted-foreground">
                {rating && rating.count > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setTab("reviews")}
                      className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline"
                      aria-label={tr("Rated {toFixed} from {count} reviews", { toFixed: rating.avg.toFixed(1), count: rating.count })}
                    >
                      <Star className="h-4 w-4 fill-primary text-primary" />
                      {rating.avg.toFixed(1)}
                      <span className="font-normal text-muted-foreground">({rating.count})</span>
                    </button>
                    <Dot />
                  </>
                )}
                {fromLabel && (
                  <>
                    <span className="font-semibold text-foreground">{fromLabel}</span>
                    <Dot />
                  </>
                )}
                <span>{serviceLabel}</span>
              </div>

              {tagline && (
                <p className="max-w-[640px] text-[15px] leading-[22px] text-muted-foreground">
                  <LinkifiedText text={tagline} />
                </p>
              )}

              {(p.location?.trim() || status || hours) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] leading-[22px]">
                  {p.location?.trim() && (
                    <a
                      href={mapHref!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-foreground hover:underline"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {p.location.trim()}
                    </a>
                  )}
                  {(status || hours) && (
                    <span className="inline-flex items-center gap-1.5" title={hours || undefined}>
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {status ? (
                        <>
                          <span className={cn("font-semibold", status.open ? "text-success" : "text-destructive")}>
                            {status.open ? tr("Open") : tr("Closed")}
                          </span>
                          <span className="text-muted-foreground">
                            {status.open
                              ? `until ${formatTime(status.until)}`
                              : openStatusLabel(status).replace(/^Closed( · )?/, "")}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{hours}</span>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Favourite and share beside the one action; on a phone they
                live in the bar over the photo. */}
            <div className="flex w-full shrink-0 items-center gap-2 md:w-auto">
              <div className="hidden items-center md:flex">
                <FavoriteButton kind="provider" id={p.id} name={p.name} className="text-foreground hover:bg-muted" />
                <ShareButton
                  title={p.name}
                  text={[serviceLabel, p.name].filter(Boolean).join(" · ")}
                  className="text-foreground hover:bg-muted"
                />
              </div>
              {calendars.length > 0 && (
                <BookButton
                  calendars={calendars}
                  onPick={(id) => navigate(`/providers/${providerId}/book${id ? `?calendar=${id}` : ""}`)}
                />
              )}
            </div>
          </div>

          {/* Phone: the trail, quietly, under the business. A laptop has it
              above the cover. */}
          <Breadcrumbs items={crumbs} className="mt-4 md:hidden" />
        </section>

        {/* Tabs: a compact row that stays under the header while the plans
            scroll, instead of a full-width segmented control heavier than
            what it switches between. */}
        <div className="sticky top-14 z-30 -mx-4 mb-4 border-b border-border bg-background px-4 md:top-[var(--desktop-header-h,72px)] md:mx-0 md:px-0">
          <div role="tablist" className="flex gap-6">
            {TABS.map((t) => ({ ...t, label: t.key === "plans" ? meta.offeringsHeading : t.label })).map((t) => {
              const count = t.key === "plans" ? offeringsCount : t.key === "reviews" ? (rating?.count ?? 0) : gallery.length;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "-mb-px flex h-12 items-center gap-1.5 border-b-2 text-[15px] font-semibold transition-colors",
                    tab === t.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {count > 0 && <span className="text-[13px] font-medium text-muted-foreground">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
        {tab === "plans" && isVehicles && (
          vehiclesQ.isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px]" />)}
            </div>
          ) : vehiclesQ.isError ? (
            <QueryError title={tr("Couldn't load vehicles")} onRetry={() => vehiclesQ.refetch()} retrying={vehiclesQ.isFetching} />
          ) : (vehiclesQ.data ?? []).length === 0 ? (
            <TabEmptyState icon={Icon} title={tr("No vehicles yet")} subtitle={tr("We're setting things up. Check back soon.")} />
          ) : (() => {
            // Grouped by the vehicle's own type when the fleet is mixed; a
            // one-type fleet keeps the plain grid with no headings.
            const fleet = vehiclesQ.data ?? [];
            const order = vehicleTypesQ.data ?? [];
            const grouped = new Map<string, typeof fleet>();
            fleet.forEach((v) => {
              const k = v.category_key ?? "";
              grouped.set(k, [...(grouped.get(k) ?? []), v]);
            });
            if (grouped.size <= 1) {
              return (
                <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                  {fleet.map((v) => <VehicleCard key={v.id} v={v} />)}
                </div>
              );
            }
            const keys = [
              ...order.map((t) => t.key).filter((k) => grouped.has(k)),
              ...[...grouped.keys()].filter((k) => !order.some((t) => t.key === k)),
            ];
            const labelOf = new Map(order.map((t) => [t.key, t.label]));
            return (
              <div className="space-y-5">
                {keys.map((k) => (
                  <div key={k || "other"}>
                    <YdSectionHeading title={labelOf.get(k) ?? tr("Other")} count={grouped.get(k)!.length} />
                    <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                      {grouped.get(k)!.map((v) => <VehicleCard key={v.id} v={v} />)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}

        {tab === "plans" && !isVehicles && (
          plansQ.isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px]" />)}
            </div>
          ) : plansQ.isError ? (
            <QueryError title={tr("Couldn't load plans")} onRetry={() => plansQ.refetch()} retrying={plansQ.isFetching} />
          ) : (plansQ.data ?? []).length === 0 ? (
            <TabEmptyState icon={Icon} title={tr("No plans yet")} subtitle={tr("We're setting things up. Check back soon.")} />
          ) : (
            // Cards, like every other shelf of plans on the site — a photo
            // you can see, the price under it. Three across on a laptop; a
            // business with one offer shows it as one wide card rather than a
            // lone tile with the rest of the row empty.
            (plansQ.data ?? []).length === 1 ? (() => {
              const plan = plansQ.data![0];
              const own = Array.isArray((plan as any).gallery_urls) ? ((plan as any).gallery_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u) : [];
              return (
                <WideOfferCard
                  href={planHref(serviceSegment ?? "", planSegment(plan as Addressable)) + (preview ? "?preview=1" : "")}
                  photos={own.length ? own : gallery.slice(0, 1)}
                  title={plan.name}
                  description={plan.description}
                  chips={labelsOf((plan as any).tags, 2)}
                  corner={<FavoriteButton kind="plan" id={plan.id} name={plan.name} variant="overlay" />}
                  price={
                    typeof plan.price_cents === "number" && plan.price_cents > 0
                      ? <PriceLine cents={plan.price_cents} period={plan.period ?? null} perPerson={(plan as any).pricing_mode === "per_person"} />
                      : <p className="text-[14px] text-muted-foreground">{tr("Price on request")}</p>
                  }
                />
              );
            })() : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-4">
              {(plansQ.data ?? []).map((plan) => {
                const own = Array.isArray((plan as any).gallery_urls) ? ((plan as any).gallery_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u) : [];
                const linkId = planSegment(plan as Addressable);
                return (
                  <OfferCard
                    key={plan.id}
                    href={planHref(serviceSegment ?? "", linkId) + (preview ? "?preview=1" : "")}
                    // The plan's own photographs first; the business's only as
                    // a fallback, or every plan it sells looks the same.
                    photos={own.length ? own : gallery.slice(0, 1)}
                    title={plan.name}
                    subtitle={plan.description}
                    chips={labelsOf((plan as any).tags, 2)}
                    corner={<FavoriteButton kind="plan" id={plan.id} name={plan.name} variant="overlay" />}
                    footer={
                      typeof plan.price_cents === "number" && plan.price_cents > 0
                        ? <PriceLine cents={plan.price_cents} period={plan.period ?? null} perPerson={(plan as any).pricing_mode === "per_person"} />
                        : <p className="text-[14px] text-muted-foreground">{tr("Price on request")}</p>
                    }
                  />
                );
              })}
            </div>
            )
          )
        )}

        {tab === "reviews" && (
          // The block draws its own heading and rating — the same two things
          // the design puts at the top of this card — so wrapping it is all
          // that is needed. A second "Reviews" above it was just a duplicate.
          // Every archetype collects reviews, so there is no dead-end state.
          <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <ProviderReviewsBlock providerId={p.id} service={reviewService} ownerUserId={p.admin_user_id} />
          </section>
        )}

        {tab === "gallery" && (
          gallery.length === 0 ? (
            <TabEmptyState icon={Icon} title={tr("No photos yet")} subtitle={tr("The provider hasn't added pictures.")} />
          ) : (
            <section className="rounded-radius-lg bg-card p-4">
              {/* Two across on a phone; on a laptop two columns made each photo
                  ~800px square — a wall, not a gallery. Four at 1280 keeps a
                  tile near the size of a card. */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                {gallery.map((src) => (
                  <div key={src} className="aspect-square w-full overflow-hidden rounded-radius-md">
                    <Photo src={src} />
                  </div>
                ))}
              </div>
            </section>
          )
        )}

        {/* Contact stays below the tabs — it belongs to the business, not to
            one of its three faces. */}
        {(p.contact_phone || p.contact_email) && (
          <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <h2 className="text-[20px] font-semibold text-foreground">{tr("Contact")}</h2>
            <div className="mt-3 space-y-2">
              {p.contact_phone && (
                <a href={`tel:${p.contact_phone.replace(/[^+\d]/g, "")}`} className="flex w-fit items-center gap-2 text-[16px] leading-[22px] text-muted-foreground hover:text-foreground">
                  <Phone className="h-4 w-4 shrink-0" /> {p.contact_phone}
                </a>
              )}
              {p.contact_email && (
                <a href={`mailto:${p.contact_email}`} className="flex w-fit items-center gap-2 text-[16px] leading-[22px] text-muted-foreground hover:text-foreground">
                  <Mail className="h-4 w-4 shrink-0" /> {p.contact_email}
                </a>
              )}
            </div>
          </section>
        )}
        </div>
      </main>

    </BrowseLayout>
  );
};

/** "$75", "$75.50" — a header price drops the cents when there are none. */
function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : formatUSD(cents);
}

function Dot() {
  return <span aria-hidden className="text-muted-foreground/60">·</span>;
}

/**
 * The one way in to booking. One calendar: straight to it. Several: a short
 * list to pick the court from — the button used to trail "Tennis Court 2 +1
 * more", which named one court and hid the rest.
 */
function BookButton({ calendars, onPick }: { calendars: Array<{ id: string; name: string }>; onPick: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      className="w-full shrink-0 md:w-auto md:min-w-[200px]"
      onClick={calendars.length === 1 ? () => onPick(calendars[0].id) : undefined}
    >
      <CalendarDays />{" "}{tr("Book a time")}</Button>
  );
  if (calendars.length === 1) return button;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-auto min-w-[var(--radix-popover-trigger-width)] max-w-[min(360px,calc(100vw-32px))] p-2">
        <p className="px-3 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("What to book")}</p>
        <ul>
          {calendars.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => { setOpen(false); onPick(c.id); }}
                className="flex w-full items-center justify-between gap-3 rounded-radius-md px-3 py-3 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span className="min-w-0">{c.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** A business's only offer: photo beside the words, instead of one tile and an empty row. */
function WideOfferCard({ href, photos, title, description, chips, corner, price }: {
  href: string; photos: string[]; title: string; description?: string | null;
  chips?: string[]; corner?: React.ReactNode; price: React.ReactNode;
}) {
  return (
    <Link
      to={href}
      className="group flex flex-col overflow-hidden rounded-radius-lg bg-card transition-transform active:scale-[0.99] md:flex-row"
    >
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-muted md:aspect-auto md:h-[320px] md:w-[46%]">
        <PhotoSlider photos={photos} className="h-full w-full bg-muted transition-transform duration-300 group-hover:scale-[1.03]" />
        {corner && <div className="absolute right-3 top-3">{corner}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 md:p-8">
        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-primary px-2.5 py-0.5 text-meta font-bold text-primary-foreground">{c}</span>
            ))}
          </div>
        )}
        <h3 className="text-[22px] font-semibold leading-tight text-foreground md:text-[26px]">{title}</h3>
        {description && <p className="line-clamp-4 text-[15px] leading-[22px] text-muted-foreground">{description}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          {price}
          <span className="inline-flex h-10 items-center gap-1 rounded-full bg-inset px-4 text-[15px] font-semibold text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">{tr("View plan")}{" "}<ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** The plan's first photograph, if it has one. */
function planPhoto(plan: UniversalPlan & { gallery_urls?: unknown }): string | null {
  const list = Array.isArray(plan.gallery_urls) ? plan.gallery_urls : [];
  const first = list.find((u): u is string => typeof u === "string" && !!u.trim());
  return first ?? null;
}


export default ProviderDetail;
