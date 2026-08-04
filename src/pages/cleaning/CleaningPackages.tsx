import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { SparklesIcon, ShieldCheck } from "lucide-react";
import { groupProvidersByCategory } from "@/lib/services/groupByCategory";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useI18n } from "@/i18n";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { QueryError } from "@/components/QueryError";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { CleaningPackageCard } from "@/components/patterns/CleaningPackageCard";

interface CleaningProvider {
  id: string;
  name: string;
  /** Which category (Apartment Cleaning · Car Wash · …) this provider serves. */
  category_key: string | null;
  /** Bridge to `cleaning_packages.provider_id` (legacy id space). */
  source_provider_id: string | null;
  /** Hydrated from `cleaning_providers` via the bridge — writes go there. */
  avatar_url?: string | null;
  gallery_urls?: string[];
}

interface CleaningCategory {
  key: string;
  label: string;
  sort_order: number;
}

const CleaningPackages = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();

  // Providers under the Cleaning archetype — same "top row" pattern as Food.
  // Currently one (ProsperaSub Cleaning); adding a second is a data-only change.
  const providersQ = useQuery({
    queryKey: ["cleaning-providers-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, category_key, source_provider_id")
        .eq("archetype_key", "cleaning")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const universal = (data ?? []) as CleaningProvider[];

      // Hydrate avatar + gallery from the LEGACY table (that's where the
      // admin's Info-tab edits land). The universal `providers` row is the
      // stable listing entity; the legacy row is the source of truth for the
      // images owner-portal writes to. Bridge via source_provider_id.
      const legacyIds = universal
        .map((p) => p.source_provider_id)
        .filter((id): id is string => !!id);
      if (legacyIds.length === 0) return universal;
      const { data: legacy } = await supabaseDb
        .from("cleaning_providers")
        .select("id, avatar_url, gallery_urls")
        .in("id", legacyIds);
      const byId = new Map<string, { avatar_url: string | null; gallery_urls: string[] }>();
      (legacy ?? []).forEach((r: any) => {
        byId.set(String(r.id), {
          avatar_url: r.avatar_url ?? null,
          gallery_urls: Array.isArray(r.gallery_urls) ? r.gallery_urls.filter(Boolean) : [],
        });
      });
      return universal.map((p) => {
        const enriched = p.source_provider_id ? byId.get(p.source_provider_id) : null;
        return { ...p, avatar_url: enriched?.avatar_url ?? null, gallery_urls: enriched?.gallery_urls ?? [] };
      });
    },
  });

  // Categories under the Cleaning archetype (Apartment Cleaning · Car Wash · …).
  // Drives the top-level grouping — one section per category, then providers
  // inside, then plans inside each provider. Without this the page dumped a
  // flat grid where "Monthly Car Wash $29" sat next to "1 Bedroom Apartment $79"
  // with no visual signal that they're different services.
  const categoriesQ = useQuery({
    queryKey: ["cleaning-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("service_categories")
        .select("key, label, sort_order")
        .eq("archetype_key", "cleaning")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CleaningCategory[];
    },
  });

  const packagesQ = useQuery({
    queryKey: ["cleaning-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_packages")
        .select("*")
        .eq("is_active", true)
        .eq("visibility", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const list = data ?? [];
      const ids = list.map((p: any) => p.id);
      const { data: links } = ids.length
        ? await supabaseDb.from("cleaning_package_residences").select("package_id, residence_id").in("package_id", ids)
        : { data: [] as any[] };
      const resMap: Record<string, string[]> = {};
      (links ?? []).forEach((l: any) => { (resMap[l.package_id] ??= []).push(l.residence_id); });
      return list.map((p: any) => ({ ...p, residenceIds: resMap[p.id] ?? [] }));
    },
  });

  // ── Location filter ──────────────────────────────────────────────────────
  const { residence } = useSelectedResidence();
  const { data: residences = [] } = useResidences();
  const selectedResidenceId = residence ? (residences.find((r) => r.name === residence)?.id ?? null) : null;
  const visiblePackages = (packagesQ.data ?? []).filter(
    (p: any) => !selectedResidenceId || (p.residenceIds?.length ?? 0) === 0 || p.residenceIds.includes(selectedResidenceId),
  );

  // Three-level grouping: category → provider → plans.
  //   Apartment Cleaning
  //     ProsperaSub Cleaning
  //       Studio · 1BR · 2BR
  //   Car Wash
  //     ProsperaSub Car Wash
  //       Monthly Car Wash
  // Providers without a category_key (legacy data) fall into "Other" at the
  // end — the schema NOT-NULLs this column so "Other" should stay empty
  // going forward, but we keep the bucket to survive any historical drift.
  interface ProviderGroup { providerId: string; providerName: string; providerAvatar: string | null; providerGallery: string[]; packages: any[] }
  interface CategoryGroup { categoryKey: string; categoryLabel: string; providers: ProviderGroup[] }

  const categoryGroups = useMemo((): CategoryGroup[] => {
    const providers = providersQ.data ?? [];
    const categories = categoriesQ.data ?? [];

    // Universal `providers.id` ≠ legacy `cleaning_packages.provider_id` —
    // bridge via `source_provider_id`. Match plans to providers via legacy id.
    const byLegacyId = new Map<string, CleaningProvider>();
    providers.forEach((p) => { if (p.source_provider_id) byLegacyId.set(p.source_provider_id, p); });

    // Build provider → packages, keeping only providers that actually have
    // visible plans in the current location filter.
    const packagesByProvider = new Map<string, any[]>();
    visiblePackages.forEach((pkg) => {
      const p = pkg.provider_id ? byLegacyId.get(pkg.provider_id) : null;
      if (!p) return;
      if (!packagesByProvider.has(p.id)) packagesByProvider.set(p.id, []);
      packagesByProvider.get(p.id)!.push(pkg);
    });

    // Group providers under their category, preserving both providersQ's
    // sort_order (providers within a category) and categoriesQ's sort_order.
    // Shared grouper so a category deactivated in admin drops its providers
    // into "Other" instead of erasing them from the page.
    const tiles = providers
      .filter((p) => (packagesByProvider.get(p.id) ?? []).length > 0) // no visible plans → hide the tile
      .map((p) => ({
        categoryKey: p.category_key,
        providerId: p.id,
        providerName: p.name,
        providerAvatar: p.avatar_url ?? null,
        providerGallery: p.gallery_urls ?? [],
        packages: packagesByProvider.get(p.id)!,
      }));

    return groupProvidersByCategory(tiles, categories, (t) => t.categoryKey).map((g) => ({
      categoryKey: g.key,
      categoryLabel: g.label,
      providers: g.providers,
    }));
  }, [visiblePackages, providersQ.data, categoriesQ.data]);

  // Flatten for "Providers" top strip (kept for scan-ability across categories).
  const flatProviders = useMemo(
    () => categoryGroups.flatMap((c) => c.providers),
    [categoryGroups],
  );

  const goToCheckout = (pkgId: string) => {
    if (!isAuthenticated) {
      openAuthModal("login", `/services/cleaning/checkout/${pkgId}`);
    } else {
      navigate(`/services/cleaning/checkout/${pkgId}`);
    }
  };

  const openProvider = (providerId: string) => {
    navigate(`/services/cleaning/providers/${providerId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <HomeHeader title="Cleaning" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content space-y-8 py-space-4 md:py-space-8">

        {/* ─── Categories → Providers → Plans ─────────────────────────
            Three-level information architecture: each Category (Apartment
            Cleaning · Car Wash · …) gets its own block; inside it the
            providers appear as tiles, and each tile is followed by its
            plans. Previous flat provider-grouped layout mixed car-wash
            plans next to apartment-cleaning plans with no visual signal
            they belong to different services. */}
        {packagesQ.isLoading || providersQ.isLoading || categoriesQ.isLoading ? (
          <section>
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          </section>
        ) : providersQ.isError || packagesQ.isError ? (
          <QueryError
            title="Couldn't load the catalog"
            error={
              providersQ.error instanceof Error ? providersQ.error.message :
              packagesQ.error instanceof Error ? packagesQ.error.message :
              undefined
            }
            onRetry={() => { providersQ.refetch(); packagesQ.refetch(); categoriesQ.refetch(); }}
            retrying={providersQ.isFetching || packagesQ.isFetching || categoriesQ.isFetching}
          />
        ) : categoryGroups.length === 0 ? (
          <YdEmptyState
            icon={SparklesIcon}
            title={t("cleaning.noPackagesTitle")}
            subtitle={t("cleaning.noPackagesDescription")}
          />
        ) : (
          categoryGroups.map((category) => (
            <section key={category.categoryKey} className="space-y-4">
              {/* Category header — always shown so the 3-level architecture
                  (category → provider → plans) is visible on every service,
                  not just archetypes that happen to have multiple populated
                  categories today. */}
              <h2 className="text-xl font-black tracking-tight text-foreground">
                {category.categoryLabel}
              </h2>

              {category.providers.map((provider) => (
                <div key={provider.providerId} className="space-y-3">
                  {/* Provider tile — same shape as the earlier top-row
                      tile but now inline with its own plans below. */}
                  <button
                    type="button"
                    onClick={() => openProvider(provider.providerId)}
                    className="group flex w-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-4 p-5">
                      {provider.providerAvatar ? (
                        <img src={provider.providerAvatar} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                          <SparklesIcon className="h-6 w-6 text-primary" />
                        </span>
                      )}
                      <span className="text-lg font-black tracking-tight text-foreground">
                        {provider.providerName}
                      </span>
                    </div>
                    {provider.providerGallery.slice(0, 3).length > 0 && (
                      <div className="grid grid-cols-3 gap-0.5 bg-border/40">
                        {provider.providerGallery.slice(0, 3).map((url, i) => (
                          <div key={i} className="aspect-video overflow-hidden bg-muted">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </button>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {provider.packages.map((pkg: any) => (
                      <CleaningPackageCard key={pkg.id} pkg={pkg} onSubscribe={goToCheckout} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}

        {/* Keep flatProviders reference in scope so tree-shakers don't drop
            the memo; also lets us surface the count in a future footer. */}
        {flatProviders.length === 0 && null}

        {/* ─── Trust note (Cancel anytime) ─────────────────────────── */}
        <section className="rounded-3xl bg-muted/40 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-foreground">Cancel anytime</p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                No long-term commitment — pause or cancel with 24h notice. Every plan includes the listed features. Extras (laundry, folding, specialised cleaning) are quoted separately on request.
              </p>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default CleaningPackages;
