import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatWorkingHours } from "@/lib/workingHours";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { archetypeFromSlug, planHref, serviceMetaFromSlug, serviceSlug } from "@/lib/services/serviceUrls";
import { Button } from "@/components/ui/button";
import {
  SparklesIcon, Waves, Car,
  MapPin, Phone, Mail, Clock, Star, ChevronRight, ChevronLeft, Bell,
} from "lucide-react";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { QueryError } from "@/components/patterns/QueryError";
import { TabEmptyState } from "@/components/subscriptions/MySubsPrimitives";
import { CleaningPackageCard } from "@/components/patterns/CleaningPackageCard";
import { EntertainmentPlanCard } from "@/components/patterns/EntertainmentPlanCard";
import { UniversalPlanCard, type UniversalPlan } from "@/components/patterns/UniversalPlanCard";
import {
  ProviderReviewsBlock,
  type ProviderReviewService,
} from "@/components/reviews/ProviderReviewsBlock";
import { resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import { formatUSD } from "@/lib/pricing";
import { LinkifiedText } from "@/components/patterns/LinkifiedText";
import { useTabParam } from "@/hooks/useTabParam";

// ── Types ───────────────────────────────────────────────────────────────────
interface Provider {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  /** JSONB since the profile moved to `providers` — a schedule, not a string. */
  working_hours: unknown;
  contact_phone: string | null;
  contact_email: string | null;
  archetype_key: string | null;
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
  offeringsHeading: "Offerings",
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
function useUniversalPlans(providerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["provider-detail:universal-plans", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id, name, description, price_cents, currency, period, features, included_quantity, included_unit, source_plan_id, gallery_urls")
        .eq("provider_id", providerId!)
        .eq("status", "active")
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
      <span className="mt-1 text-lg font-black tabular-nums text-foreground">{value}</span>
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
  { key: "plans", label: "Plans" },
  { key: "reviews", label: "Reviews" },
  { key: "gallery", label: "Gallery" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ProviderDetail = () => {
  const navigate = useNavigate();
  // In the URL, so a reload — or a link to this provider's gallery — lands
  // where it should. See useTabParam.
  const [tab, setTab] = useTabParam<TabKey>(["plans", "reviews", "gallery"]);
  /**
   * Whether the bar has left the photograph behind.
   *
   * Measured off the window rather than an observer on the banner: the banner
   * unmounts and remounts as the provider loads, and an observer attached to a
   * node that disappears reports nothing for ever after.
   */
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY > 280 - 56);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // The bell on the banner goes where the app's bell always goes.
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { archetypeKey: serviceSegment, providerId } = useParams<{ archetypeKey: string; providerId: string }>();
  // `beach-club` and `entertainment` are the same service. Resolve to the
  // canonical key once, here.
  const archetypeKey = archetypeFromSlug(serviceSegment);

  const providerQ = useQuery({
    queryKey: ["provider-detail", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        // source_provider_id is needed to hand food off to its legacy page — see the
        // redirect below.
        .select("id, name, description, avatar_url, banner_url, location, working_hours, contact_phone, contact_email, archetype_key, source_provider_id, source_service_key, gallery_urls, admin_user_id")
        .eq("id", providerId!).single();
      if (error) throw error;
      return data as Provider;
    },
    enabled: !!providerId,
  });

  const meta = serviceMetaFromSlug(serviceSegment) ?? FALLBACK_META;
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
  const plansQ = useUniversalPlans(providerId, !!providerId);

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
      const { count, error } = await supabaseDb
        .from("bookable_resources")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId!)
        .eq("status", "active");
      if (error) throw error;
      return count ?? 0;
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
        .eq("provider_id", providerId!);
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
  const openPlan = (planId: string) => {
    const row = (plansQ.data ?? []).find((p) => p.id === planId) as { source_plan_id?: string | null } | undefined;
    navigate(planHref(serviceSegment ?? "", row?.source_plan_id ? String(row.source_plan_id) : planId));
  };

  // ── Loading / not-found (mirror FoodProviderDetail) ──────────────────────
  // An unknown service segment is a wrong URL, not an empty business. Saying so
  // beats the old silent fallback, which rendered a bare "Offerings" heading
  // over nothing and looked like the provider had simply stopped trading.
  if (!archetypeKey) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Not found" showBackButton onBack={goBack} />
        <DesktopHeader />
        <main className="app-container flex flex-col items-center justify-center py-16 text-center">
          <SparklesIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No such service</p>
          <p className="mt-1 text-sm text-muted-foreground">
            "{serviceSegment}" isn't a service on the platform.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <Link to="/discovery">Browse services</Link>
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (providerQ.isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Provider" showBackButton onBack={goBack} />
        <DesktopHeader />
        <main className="app-container py-space-6 space-y-4">
          <div className="h-48 animate-pulse rounded-3xl bg-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          <div className="h-64 animate-pulse rounded-3xl bg-muted" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (providerQ.isError || !providerQ.data) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Provider" showBackButton onBack={goBack} />
        <DesktopHeader />
        <main className="app-container flex flex-col items-center justify-center py-16">
          <Icon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Provider not found</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const p = providerQ.data;

  const planPrices = (plansQ.data ?? []).map((r) => r.price_cents ?? 0).filter((n) => n > 0);
  const offeringsCount = plansQ.data?.length ?? 0;
  const fromPrice = Math.min(...(planPrices.length ? planPrices : [0]));
  // A plan carries its own period and they need not agree inside one provider,
  // so the strip stays silent rather than asserting "/ month".
  const fromUnit = "";
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
  const middleStatLabel = quantities.length && includedUnit
    ? `${includedUnit[0].toUpperCase()}${includedUnit.slice(1)}s`
    : "Plans";
  const middleStatSub = quantities.length ? "Per period" : "Offered";
  const middleStatValue = quantities.length === 0 ? offeringsCount
    : quantities.length === 1 ? quantities[0]
    : `${quantities[0]}–${quantities[quantities.length - 1]}`;

  // Every archetype collects reviews — the customer sees ★ ratings on the cards,
  // so the Reviews tab must work wherever they arrived from. cleaning/food keep
  // their own key; beach is "beach"; any other (universal) provider is "plan".
  const reviewService: ProviderReviewService =
    archetypeKey === "cleaning" ? "cleaning" :
    archetypeKey === "entertainment" ? "beach" :
    archetypeKey === "food" ? "food" : "plan";
  // "Cleaning", "Food", "Beach Club" — the word the customer arrived through.
  const serviceLabel = serviceSlug(archetypeKey ?? "")
    .split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const gallery = Array.isArray(p.gallery_urls)
    ? p.gallery_urls.filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  const hours = formatWorkingHours(p.working_hours);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <DesktopHeader />

      {/*
        The banner IS the header.
        280px of photograph with its bottom corners rounded to 24, a scrim that
        fades from half-black at the top to nothing, and the chrome floating on
        it: back on the left, the bell on the right, the service named in the
        middle in white. The opaque bar this replaces sat above the picture and
        repeated the provider's name, which the card underneath already says in
        24px — so the page opened with the same words twice and 56px less
        photograph.
      */}
      <div className="relative h-[280px] w-full overflow-hidden rounded-b-radius-lg bg-inset">
        {p.banner_url ? (
          <img src={p.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon className="h-20 w-20 text-muted-foreground/15" />
          </div>
        )}
        {/* The scrim is what makes white chrome legible on a photograph nobody
            vetted — a bright sky would otherwise swallow the back button. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/50 to-transparent" />
      </div>

      {/*
        The bar stays.
        It is pulled back over the top of the banner and stuck to the viewport,
        so scrolling never takes the way out with it — on a long list of plans
        the back button was 900px above the fold. It sits OUTSIDE the banner
        because `position: sticky` is bounded by the nearest clipping ancestor,
        and the banner clips its own photograph.

        Over the picture it is transparent and white, exactly as drawn; once the
        picture has scrolled past it takes the card surface, because white on
        white is not a header, it is a missing one.
      */}
      <div
        className={`sticky top-0 z-40 -mt-[280px] mb-[224px] flex h-[56px] items-center justify-between px-2 transition-colors ${
          pinned ? "bg-card/95 backdrop-blur" : ""
        }`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            pinned ? "text-foreground hover:bg-muted" : "text-white hover:bg-white/15"
          }`}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <span
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 truncate px-14 text-[16px] font-semibold tracking-[-0.02em] ${
            pinned ? "text-foreground" : "text-white"
          }`}
        >
          {pinned ? p.name : serviceLabel}
        </span>

        <button
          type="button"
          onClick={() => isAuthenticated ? navigate("/notifications") : openAuthModal("login", "/notifications")}
          aria-label="Notifications"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            pinned ? "text-foreground hover:bg-muted" : "text-white hover:bg-white/15"
          }`}
        >
          <Bell className="h-6 w-6" />
        </button>
      </div>

      <main className="app-container space-y-1 pb-8 pt-1 md:py-8">
        {/* ─── Who this is ─────────────────────────────────────────────────
            Card radius 24 at 16 of padding, per the design; the trail, the
            name, and the three lines that describe the business. */}
        <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          {/* Service → where → who. A crumb that repeats the one before it is
              dropped: the Beach Club is its own service, and "Beach Club ›
              Beach Club" tells the customer nothing twice. */}
          <div className="flex flex-wrap gap-2">
            {[serviceLabel, p.location, p.name]
              .filter((c): c is string => !!c && !!c.trim())
              .filter((c, i, all) => all.findIndex((o) => o.toLowerCase() === c.toLowerCase()) === i)
              .map((c, i) => (
                <Crumb key={c} to={i === 0 ? meta.listingRoute : undefined}>{c}</Crumb>
              ))}
          </div>

          <div className="mt-3 space-y-2">
            <h1 className="text-[24px] font-semibold leading-tight text-foreground">{p.name}</h1>
            {p.description && (
              <p className="text-[16px] leading-[22px] text-muted-foreground">
                <LinkifiedText text={p.description} />
              </p>
            )}
            {hours && <p className="text-[16px] leading-[22px] text-muted-foreground">{hours}</p>}
            {/* The location is already the second crumb above the title;
                printing it again two lines later said "Pristine bay" twice in
                one card without adding a word. */}
          </div>

          {(bookableQ.data ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/providers/${providerId}/book`)}
              className="mt-3 flex w-full items-center justify-between rounded-radius-md bg-inset px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="text-[16px] font-semibold leading-[22px] text-foreground">Book a time</span>
              <span className="text-[14px] leading-[18px] text-muted-foreground">
                {bookableQ.data === 1 ? "1 calendar" : `${bookableQ.data} calendars`}
              </span>
            </button>
          )}

          {/* One segmented control instead of three stacked sections: the page
              had plans, reviews and pictures all scrolling past each other. */}
          <div className="mt-3 flex rounded-[18px] bg-inset p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-radius-md px-4 py-2 text-center text-[16px] font-semibold leading-[22px] transition-colors ${
                  tab === t.key ? "bg-card text-foreground" : "text-foreground/70 hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {tab === "plans" && (
          plansQ.isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => <div key={i} className="h-[120px] animate-pulse rounded-radius-md bg-card" />)}
            </div>
          ) : plansQ.isError ? (
            <QueryError title="Couldn't load plans" onRetry={() => plansQ.refetch()} retrying={plansQ.isFetching} />
          ) : (plansQ.data ?? []).length === 0 ? (
            <TabEmptyState icon={Icon} title="No plans yet" subtitle="We're setting things up. Check back soon." />
          ) : (
            (plansQ.data ?? []).map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                // The plan's own photograph first. The provider's is a fallback,
                // and using it alone made every plan a business sells look
                // identical to every other.
                image={planPhoto(plan) ?? gallery[0] ?? p.avatar_url ?? null}
                onOpen={() => openPlan(plan.id)}
              />
            ))
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
            <TabEmptyState icon={Icon} title="No photos yet" subtitle="The provider hasn't added pictures." />
          ) : (
            <section className="rounded-radius-lg bg-card p-4">
              <div className="grid grid-cols-2 gap-2">
                {gallery.map((src) => (
                  <img key={src} src={src} alt="" loading="lazy"
                    className="aspect-square w-full rounded-radius-md object-cover" />
                ))}
              </div>
            </section>
          )
        )}

        {/* Contact stays below the tabs — it belongs to the business, not to
            one of its three faces. */}
        {(p.contact_phone || p.contact_email) && (
          <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <h2 className="text-[20px] font-semibold text-foreground">Contact</h2>
            <div className="mt-3 space-y-2">
              {p.contact_phone && (
                <p className="flex items-center gap-2 text-[16px] leading-[22px] text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" /> {p.contact_phone}
                </p>
              )}
              {p.contact_email && (
                <p className="flex items-center gap-2 text-[16px] leading-[22px] text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" /> {p.contact_email}
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

/** The plan's first photograph, if it has one. */
function planPhoto(plan: UniversalPlan & { gallery_urls?: unknown }): string | null {
  const list = Array.isArray(plan.gallery_urls) ? plan.gallery_urls : [];
  const first = list.find((u): u is string => typeof u === "string" && !!u.trim());
  return first ?? null;
}

/** A breadcrumb chip: 12px medium on the inset fill, radius 16. */
function Crumb({ children, to }: { children: React.ReactNode; to?: string }) {
  const inner = (
    <span className="inline-flex items-center gap-0.5 rounded-radius-md bg-inset px-2 py-1 text-[12px] font-medium leading-4 tracking-[-0.02em] text-muted-foreground">
      {children}
      <ChevronRight className="h-4 w-4" />
    </span>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

/**
 * A plan, as the design draws it: a 104px picture, the name, two lines of
 * description, and the price pinned to the bottom right after the word "From".
 *
 * The grid card this replaces was built for a listing of many providers; on a
 * provider's own page the rows are all the same business, and a row shows more
 * of what distinguishes them in less height.
 */
function PlanRow({ plan, image, onOpen }: {
  plan: UniversalPlan;
  image: string | null;
  onOpen: () => void;
}) {
  const hasPrice = typeof plan.price_cents === "number" && plan.price_cents > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full gap-4 rounded-radius-md bg-card py-2 pl-2 pr-4 text-left tracking-[-0.02em]"
    >
      {image ? (
        <img src={image} alt="" loading="lazy"
          className="h-[104px] w-[104px] shrink-0 rounded-[8px] object-cover" />
      ) : (
        <span className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-[8px] bg-inset">
          <SparklesIcon className="h-8 w-8 text-muted-foreground/30" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1 py-2">
        <span className="truncate text-[16px] font-semibold text-foreground">{plan.name}</span>
        <span className="flex flex-1 flex-col justify-end gap-1">
          {plan.description && (
            <span className="line-clamp-2 text-[12px] text-muted-foreground">{plan.description}</span>
          )}
          <span className="flex items-end justify-end gap-1">
            {hasPrice && <span className="text-[12px] text-muted-foreground">From</span>}
            <span className="text-[16px] font-semibold text-foreground">
              {hasPrice ? formatUSD(plan.price_cents!) : "Price on request"}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

// ─── Reusable states ────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
    </div>
  );
}

export default ProviderDetail;
