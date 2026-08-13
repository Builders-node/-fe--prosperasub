import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { archetypeFromSlug, serviceMetaFromSlug, serviceSlug } from "@/lib/services/serviceUrls";
import { Button } from "@/components/ui/button";
import {
  SparklesIcon, Waves, Car,
  MapPin, Phone, Mail, Clock, Star,
} from "lucide-react";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { QueryError } from "@/components/QueryError";
import { TabEmptyState } from "@/components/subscriptions/MySubsPrimitives";
import { CleaningPackageCard } from "@/components/patterns/CleaningPackageCard";
import { EntertainmentPlanCard } from "@/components/patterns/EntertainmentPlanCard";
import { UniversalPlanCard, type UniversalPlan } from "@/components/patterns/UniversalPlanCard";
import {
  ProviderReviewsBlock,
  type ProviderReviewService,
} from "@/components/reviews/ProviderReviewsBlock";
import { resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";

// ── Types ───────────────────────────────────────────────────────────────────
interface Provider {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  working_hours: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  archetype_key: string | null;
  /** Null means the provider has no legacy table — its offer is in provider_plans. */
  source_service_key: string | null;
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
        .select("id, name, description, price_cents, currency, period, features, included_quantity, included_unit")
        .eq("provider_id", providerId!)
        .eq("status", "active")
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
const ProviderDetail = () => {
  const navigate = useNavigate();
  const { archetypeKey: serviceSegment, providerId } = useParams<{ archetypeKey: string; providerId: string }>();
  // `beach-club` and `entertainment` are the same service; so are `cars` and
  // `rental`. Resolve to the canonical key once, here.
  const archetypeKey = archetypeFromSlug(serviceSegment);
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const providerQ = useQuery({
    queryKey: ["provider-detail", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        // source_provider_id is needed to hand food off to its legacy page — see the
        // redirect below.
        .select("id, name, description, avatar_url, banner_url, location, working_hours, contact_phone, contact_email, archetype_key, source_provider_id, source_service_key")
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
  const universalQ = useUniversalPlans(providerId, isUniversal);

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

  const onCleaningSub = (pkgId: string) =>
    isAuthenticated
      ? navigate(`/services/cleaning/checkout/${pkgId}`)
      : openAuthModal("login", `/services/cleaning/checkout/${pkgId}`);
  const onEntertainmentSub = (planId: string) =>
    isAuthenticated
      ? navigate(`/services/beach-club/checkout/${planId}`)
      : openAuthModal("login", `/services/beach-club/checkout/${planId}`);
  const onVehicleOpen = (id: string) => navigate(`/services/rental/${id}`);
  const onUniversalSub = (planId: string) => {
    const href = `/services/${serviceSlug(archetypeKey ?? "")}/checkout/plan/${planId}`;
    isAuthenticated ? navigate(href) : openAuthModal("login", href);
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
        <main className="market-content flex flex-col items-center justify-center py-16 text-center">
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
        <main className="market-content py-space-6 space-y-4">
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
        <main className="market-content flex flex-col items-center justify-center py-16">
          <Icon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Provider not found</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Food has its own richer provider page (menus, gallery carousel, reviews),
  // so /services/food/providers/:id hands off to it rather than rendering this
  // generic shell with a "Plans" heading and no food block under it.
  //
  // The id has to be translated, not just the path: this route carries the
  // UNIVERSAL providers.id while the food page reads the LEGACY
  // food_providers.id. Redirecting the raw id landed on "Restaurant not
  // found" — the id-space split CLAUDE.md calls the #1 source of bugs here.
  if (archetypeKey === "food") {
    const legacyId = (providerQ.data as { source_provider_id?: string | null }).source_provider_id;
    return <Navigate to={legacyId ? `/services/food/${legacyId}` : "/services/food"} replace />;
  }

  const p = providerQ.data;

  // Stats derived per archetype so we can show meaningful numbers.
  const cleaningPrices = (cleaningQ.data ?? []).map((r: any) => resolveMonthlyPriceCents(r)).filter(Boolean);
  const entertainmentPrices = (entertainmentQ.data ?? []).map((r: any) => r.price_per_person_cents);

  const universalPrices = (universalQ.data ?? [])
    .map((r) => r.price_cents ?? 0)
    .filter((n) => n > 0);

  const offeringsCount = isUniversal
    ? (universalQ.data?.length ?? 0)
    : ({
        cleaning:      cleaningQ.data?.length ?? 0,
        entertainment: entertainmentQ.data?.length ?? 0,
      }[archetypeKey ?? ""] ?? 0);

  const fromPrice = isUniversal
    ? Math.min(...(universalPrices.length ? universalPrices : [0]))
    : archetypeKey === "cleaning"      ? Math.min(...(cleaningPrices.length      ? cleaningPrices      : [0])) :
      archetypeKey === "entertainment" ? Math.min(...(entertainmentPrices.length ? entertainmentPrices : [0])) : 0;
  // A universal plan carries its own period, and they need not agree inside one
  // provider, so the strip stays silent rather than asserting "/ month".
  const fromUnit = isUniversal ? "" :
    archetypeKey === "cleaning"      ? "/ month" :
    archetypeKey === "entertainment" ? "/ month" :
    "";
  const middleStatLabel = isUniversal ? "Plans"
    : "Per Month";
  const middleStatSub = isUniversal ? "Offered"
    : archetypeKey === "entertainment" ? "Access" : "Cleanings";
  const middleStatValue = offeringsCount;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title={p.name} showBackButton onBack={goBack} />
      <DesktopHeader />

      {/* ─── Full-width banner ───────────────────────────────────────────── */}
      <div className="relative h-52 w-full overflow-hidden md:h-72 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
        {p.banner_url ? (
          <img src={p.banner_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon className="h-20 w-20 text-muted-foreground/15" />
          </div>
        )}
      </div>

      <main className="market-content py-space-6 md:py-space-12 space-y-space-8">

        {/* ─── Product header (below banner) ───────────────────────────────── */}
        <section className="rounded-3xl bg-card p-5 md:p-7">
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.4rem] border border-border bg-muted md:h-24 md:w-24">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-primary/10">
                  <Icon className="h-9 w-9 text-primary" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black leading-tight tracking-tight md:text-3xl">{p.name}</h1>
              {p.location && (
                <p className="mt-1 truncate text-sm text-muted-foreground">{p.location}</p>
              )}
            </div>
          </div>

          {p.description && (
            <p className="mt-4 text-body text-muted-foreground">{p.description}</p>
          )}
        </section>

        {/* ─── Stats strip ─────────────────────────────────────────────────── */}
        <section className="grid grid-cols-4 divide-x divide-border rounded-3xl bg-card py-4">
          <Stat
            label={(ratingSummaryQ.data?.count ?? 0) > 0
              ? `${ratingSummaryQ.data!.count} ${ratingSummaryQ.data!.count === 1 ? "Rating" : "Ratings"}`
              : "Ratings"}
            value={(ratingSummaryQ.data?.count ?? 0) > 0 ? (
              <span className="inline-flex items-baseline gap-1">
                {ratingSummaryQ.data!.avg.toFixed(1)}
                <Star className="h-4 w-4 translate-y-px fill-current" />
              </span>
            ) : "New"}
            sub={(ratingSummaryQ.data?.count ?? 0) > 0
              ? <span className="text-primary">Verified</span>
              : <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" /> No reviews</span>}
          />
          <Stat label={meta.offeringsHeading} value={String(offeringsCount)} sub="Available" />
          <Stat label={middleStatLabel} value={String(middleStatValue)} sub={middleStatSub} />
          <Stat label="From" value={fromPrice > 0 ? `$${Math.round(fromPrice / 100)}` : "—"} sub={fromUnit} />
        </section>

        {/* ─── Offerings ───────────────────────────────────────────────────── */}
        <section id="offerings" className="scroll-mt-24">
          <h2 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-black tracking-tight">
            {meta.offeringsHeading}
            {offeringsCount > 0 && (
              <span className="text-base font-normal text-muted-foreground">({offeringsCount})</span>
            )}
          </h2>

          {/* A universal provider ignores its archetype's legacy branch — that
              branch queries a table this provider has no row in. */}
          {isUniversal && (
            universalQ.isLoading ? (
              <SkeletonGrid />
            ) : universalQ.isError ? (
              <QueryError title="Couldn't load plans" onRetry={() => universalQ.refetch()} retrying={universalQ.isFetching} />
            ) : (universalQ.data ?? []).length === 0 ? (
              <TabEmptyState icon={Icon} title="No plans yet" subtitle="We're setting things up. Check back soon." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(universalQ.data ?? []).map((plan, idx) => (
                  <UniversalPlanCard
                    key={plan.id}
                    plan={plan}
                    featured={idx === 1 && (universalQ.data ?? []).length > 1}
                    onSubscribe={onUniversalSub}
                  />
                ))}
              </div>
            )
          )}

          {!isUniversal && archetypeKey === "cleaning" && (
            cleaningQ.isLoading ? (
              <SkeletonGrid />
            ) : cleaningQ.isError ? (
              <QueryError title="Couldn't load plans" onRetry={() => cleaningQ.refetch()} retrying={cleaningQ.isFetching} />
            ) : (cleaningQ.data ?? []).length === 0 ? (
              <TabEmptyState icon={SparklesIcon} title="No plans yet" subtitle="We're setting things up. Check back soon." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(cleaningQ.data ?? []).map((pkg: any, idx: number) => (
                  <CleaningPackageCard
                    key={pkg.id}
                    pkg={pkg}
                    featured={idx === 1 && (cleaningQ.data ?? []).length > 1}
                    onSubscribe={onCleaningSub}
                  />
                ))}
              </div>
            )
          )}

          {!isUniversal && archetypeKey === "entertainment" && (
            entertainmentQ.isLoading ? (
              <SkeletonGrid />
            ) : entertainmentQ.isError ? (
              <QueryError title="Couldn't load plans" onRetry={() => entertainmentQ.refetch()} retrying={entertainmentQ.isFetching} />
            ) : (entertainmentQ.data ?? []).length === 0 ? (
              <TabEmptyState icon={Waves} title="No plans yet" subtitle="We're setting things up. Check back soon." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(entertainmentQ.data ?? []).map((plan: any) => (
                  <EntertainmentPlanCard key={plan.id} plan={plan} onSubscribe={onEntertainmentSub} />
                ))}
              </div>
            )
          )}

        </section>

        {/* ─── Reviews ─────────────────────────────────────────────────────
            Shown for every archetype that maps to provider_reviews.service. */}
        {(() => {
          // provider_reviews.service is a legacy-service enum. A universal
          // provider maps to none of its values, so it gets no review block
          // rather than one filed under a service it isn't.
          if (isUniversal) return null;
          const reviewService: ProviderReviewService | null =
            archetypeKey === "cleaning" ? "cleaning" :
            archetypeKey === "rental"   ? "rental" :
            archetypeKey === "entertainment" ? "beach" : null;
          if (!reviewService) return null;
          return <ProviderReviewsBlock providerId={p.id} service={reviewService} />;
        })()}

        {/* ─── Information ─────────────────────────────────────────────────── */}
        {(p.working_hours || p.location || p.contact_phone || p.contact_email) && (
          <section>
            <h2 className="mb-4 text-xl font-black tracking-tight">Information</h2>
            <div className="divide-y divide-border rounded-3xl bg-card">
              {p.working_hours && (
                <InfoRow icon={<Clock className="h-4 w-4" />} label="Operating Hours" value={p.working_hours} iconText="text-primary" />
              )}
              {p.location && (
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={p.location} iconText="text-primary" />
              )}
              {p.contact_phone && (
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={p.contact_phone} iconText="text-primary" />
              )}
              {p.contact_email && (
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={p.contact_email} iconText="text-primary" />
              )}
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

// ─── Reusable states ────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
    </div>
  );
}

export default ProviderDetail;
