import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Waves } from "lucide-react";
import { providerHref } from "@/lib/services/serviceUrls";
import { ProviderRail, CategoryChips, ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { QueryError } from "@/components/QueryError";
import { EntertainmentPlanCard } from "@/components/patterns/EntertainmentPlanCard";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";

interface BeachPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_per_person_cents: number;
  amenities: string[];
  featured: boolean;
}

interface EntertainmentProvider {
  id: string;
  name: string;
  /** Which category (Beach Membership · Court Bookings · …) this provider serves. */
  category_key: string | null;
}

interface EntertainmentCategory {
  key: string;
  label: string;
  sort_order: number;
}

const BeachClub = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  // Providers under the Entertainment archetype. Right now there's one
  // (Beach Club) but this is the multi-provider surface — the page mirrors
  // Food (providers on top → plans below) so adding a second provider is a
  // data-only change.
  const providersQ = useQuery({
    queryKey: ["entertainment-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, category_key, avatar_url, gallery_urls")
        .eq("archetype_key", "entertainment")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntertainmentProvider[];
    },
  });

  // Categories under the Entertainment archetype. Drives the top-level
  // grouping: one section per category (Beach Membership · Court Bookings)
  // so a "gym" or "spa" provider added later automatically gets its own
  // bucket instead of being smushed into the memberships grid.
  const categoriesQ = useQuery({
    queryKey: ["entertainment-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "entertainment")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntertainmentCategory[];
    },
  });

  // Group providers by category, keeping only categories that have at
  // least one provider. Providers without category_key fall into "Other".
  const providerGroups = useMemo(
    () => groupProvidersByCategory<EntertainmentProvider>(
      providersQ.data ?? [], categoriesQ.data ?? [], (p) => p.category_key,
    ),
    [providersQ.data, categoriesQ.data],
  );

  // The membership lookup that used to gate the "Book a court" shortcut went
  // with the shortcut. It was a per-load query against beach_club_subscriptions
  // whose only consumer was that banner.

  const plansQ = useQuery({
    queryKey: ["entertainment-plans-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BeachPlan[];
    },
  });

  const railProviders = useMemo(
    () => providerGroups.flatMap((g) =>
      g.providers.map((p: any) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatar_url ?? null,
        gallery: p.gallery_urls ?? [],
        meta: g.label,
      }))),
    [providerGroups],
  );
  const chipCategories = useMemo(
    () => providerGroups.map((g) => ({ key: g.key, label: g.label, count: g.providers.length })),
    [providerGroups],
  );
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  // Same caveat as cars: `beach_club_plans` has no owner column, so the chip
  // scopes the rail and the plan grid below stays whole.
  const visibleRail = activeCategory === ALL_CATEGORIES
    ? railProviders
    : providerGroups
        .filter((g) => g.key === activeCategory)
        .flatMap((g) => g.providers.map((p: any) => ({
          id: p.id, name: p.name, avatarUrl: p.avatar_url ?? null,
          gallery: p.gallery_urls ?? [], meta: g.label,
        })));

  const openProvider = (providerId: string) => {
    navigate(providerHref("entertainment", providerId));
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Entertainment" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-4 md:py-space-8">
        {/* ─── Providers grouped by category ──────────────────────────
            "Beach Membership" providers on top, "Court Bookings" below, etc.
            Header hidden when only one category is populated so single-
            provider archetypes stay clean. Empty when no providers. */}
        {providersQ.isLoading ? (
          <section>
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          </section>
        ) : providersQ.isError ? (
          <QueryError
            title="Couldn't load providers"
            error={providersQ.error instanceof Error ? providersQ.error.message : undefined}
            onRetry={() => providersQ.refetch()}
            retrying={providersQ.isFetching}
          />
        ) : providerGroups.length === 0 ? (
          <YdEmptyState icon={Waves} title="No providers yet" subtitle="We're setting things up. Check back soon." />
        ) : (
          <div className="space-y-4">
            <ProviderRail providers={visibleRail} icon={Waves} label="Providers" onOpen={openProvider} />
            <CategoryChips categories={chipCategories} value={activeCategory} onChange={setActiveCategory} />
          </div>
        )}

        {/* ─── Plans ──────────────────────────────────────────────── */}
        <section id="entertainment-plans" className="mt-space-6 scroll-mt-4">
          <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Plans</h2>

          {plansQ.isLoading ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : plansQ.isError ? (
            <QueryError
              title="Couldn't load plans"
              error={plansQ.error instanceof Error ? plansQ.error.message : undefined}
              onRetry={() => plansQ.refetch()}
              retrying={plansQ.isFetching}
            />
          ) : plansQ.data && plansQ.data.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plansQ.data.map((plan) => (
                <EntertainmentPlanCard
                  key={plan.id}
                  plan={plan}
                  onSubscribe={(id) => {
                    if (!isAuthenticated) openAuthModal("login", `/services/beach-club/checkout/${id}`);
                    else navigate(`/services/beach-club/checkout/${id}`);
                  }}
                />
              ))}
            </div>
          ) : (
            <YdEmptyState icon={Waves} title="No plans yet" subtitle="We're setting things up. Check back soon." />
          )}
        </section>

        <section className="mt-space-6 rounded-3xl bg-muted/40 p-5">
          <p className="font-bold text-foreground">How memberships work</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>• Pricing is per person and billed monthly (up to one month; longer-term pricing available on request).</li>
            <li>• Ideal for groups — choose how many people and pay for everyone at once.</li>
            <li>• Tap <span className="font-semibold text-foreground">Subscribe</span> to pay with Lightning, on-chain, LIVES or PayPal and activate your membership.</li>
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default BeachClub;
