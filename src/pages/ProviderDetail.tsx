import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
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
import { RentalVehicleCard } from "@/components/patterns/RentalVehicleCard";
import { CleaningPackageCard } from "@/components/patterns/CleaningPackageCard";
import { EntertainmentPlanCard } from "@/components/patterns/EntertainmentPlanCard";
import {
  ProviderReviewsBlock,
  type ProviderReviewService,
} from "@/components/reviews/ProviderReviewsBlock";
import { resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";
import type { RentalVehicle, RentalVehicleImage } from "@/types/carRental";

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

const ARCHETYPE_META: Record<string, ArchetypeMeta> = {
  cleaning:      { offeringsHeading: "Plans",    icon: SparklesIcon, listingRoute: "/services/cleaning" },
  entertainment: { offeringsHeading: "Plans",    icon: Waves,        listingRoute: "/services/beach-club" },
  rental:        { offeringsHeading: "Vehicles", icon: Car,          listingRoute: "/services/rental" },
};

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

function useRentalVehicles(providerId: string | undefined) {
  return useQuery({
    queryKey: ["provider-detail:rental-vehicles", providerId],
    queryFn: async () => {
      const { data: vData, error } = await supabaseDb
        .from("rental_vehicles").select("*")
        .eq("owner_provider_id", providerId!)
        .eq("status", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (!vData || vData.length === 0) return [] as (RentalVehicle & { images: RentalVehicleImage[] })[];
      const ids = vData.map((v) => v.id);
      const { data: imgs } = await supabaseDb
        .from("rental_vehicle_images").select("*").in("vehicle_id", ids)
        .order("sort_order", { ascending: true });
      const map: Record<string, RentalVehicleImage[]> = {};
      (imgs ?? []).forEach((i: any) => { (map[i.vehicle_id] ??= []).push(i); });
      return vData.map((v: RentalVehicle) => ({ ...v, images: map[v.id] ?? [] }));
    },
    enabled: !!providerId,
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
  const { archetypeKey, providerId } = useParams<{ archetypeKey: string; providerId: string }>();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  const providerQ = useQuery({
    queryKey: ["provider-detail", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, description, avatar_url, banner_url, location, working_hours, contact_phone, contact_email, archetype_key")
        .eq("id", providerId!).single();
      if (error) throw error;
      return data as Provider;
    },
    enabled: !!providerId,
  });

  const meta = ARCHETYPE_META[archetypeKey ?? ""] ?? FALLBACK_META;
  const Icon = meta.icon;

  // Offerings queries — always hooked (React rules); the caller only reads the
  // one that matches this archetype. Filtered by universal owner_provider_id.
  const cleaningQ = useCleaningPlans(providerId);
  const entertainmentQ = useEntertainmentPlans(providerId);
  const rentalQ = useRentalVehicles(providerId);

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

  // ── Loading / not-found (mirror FoodProviderDetail) ──────────────────────
  if (providerQ.isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-0">
        <HomeHeader title="Provider" showBackButton onBack={() => navigate(meta.listingRoute)} />
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
        <HomeHeader title="Provider" showBackButton onBack={() => navigate(meta.listingRoute)} />
        <DesktopHeader />
        <main className="market-content flex flex-col items-center justify-center py-16">
          <Icon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">Provider not found</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const p = providerQ.data;

  // Stats derived per archetype so we can show meaningful numbers.
  const cleaningPrices = (cleaningQ.data ?? []).map((r: any) => resolveMonthlyPriceCents(r)).filter(Boolean);
  const entertainmentPrices = (entertainmentQ.data ?? []).map((r: any) => r.price_per_person_cents);
  const rentalPrices = (rentalQ.data ?? []).map((r: any) => r.daily_price_cents);

  const offeringsCount = {
    cleaning:      cleaningQ.data?.length ?? 0,
    entertainment: entertainmentQ.data?.length ?? 0,
    rental:        rentalQ.data?.length ?? 0,
  }[archetypeKey ?? ""] ?? 0;

  const fromPrice =
    archetypeKey === "cleaning"      ? Math.min(...(cleaningPrices.length      ? cleaningPrices      : [0])) :
    archetypeKey === "entertainment" ? Math.min(...(entertainmentPrices.length ? entertainmentPrices : [0])) :
    archetypeKey === "rental"        ? Math.min(...(rentalPrices.length        ? rentalPrices        : [0])) : 0;
  const fromUnit =
    archetypeKey === "cleaning"      ? "/ month" :
    archetypeKey === "entertainment" ? "/ month" :
    archetypeKey === "rental"        ? "/ day"   : "";
  const middleStatLabel =
    archetypeKey === "cleaning" || archetypeKey === "entertainment" ? "Per Month" : "Fleet";
  const middleStatSub =
    archetypeKey === "rental" ? "Brands" : archetypeKey === "entertainment" ? "Access" : "Cleanings";
  const middleStatValue =
    archetypeKey === "rental"
      ? new Set((rentalQ.data ?? []).map((v: any) => v.brand)).size
      : offeringsCount;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title={p.name} showBackButton onBack={() => navigate(meta.listingRoute)} />
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

          {archetypeKey === "cleaning" && (
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

          {archetypeKey === "entertainment" && (
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

          {archetypeKey === "rental" && (
            rentalQ.isLoading ? (
              <SkeletonGrid />
            ) : rentalQ.isError ? (
              <QueryError title="Couldn't load vehicles" onRetry={() => rentalQ.refetch()} retrying={rentalQ.isFetching} />
            ) : (rentalQ.data ?? []).length === 0 ? (
              <TabEmptyState icon={Car} title="No vehicles yet" subtitle="We're setting things up. Check back soon." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(rentalQ.data ?? []).map((v: any, idx: number) => (
                  <RentalVehicleCard
                    key={v.id}
                    v={v}
                    featured={idx === 1 && (rentalQ.data ?? []).length > 1}
                    onOpen={onVehicleOpen}
                  />
                ))}
              </div>
            )
          )}
        </section>

        {/* ─── Reviews ─────────────────────────────────────────────────────
            Shown for every archetype that maps to provider_reviews.service. */}
        {(() => {
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
