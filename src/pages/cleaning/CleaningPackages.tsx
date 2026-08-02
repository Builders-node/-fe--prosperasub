import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { SparklesIcon, ShieldCheck } from "lucide-react";
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
  /** Bridge to `cleaning_packages.provider_id` (legacy id space). */
  source_provider_id: string | null;
  /** Hydrated from `cleaning_providers` via the bridge — writes go there. */
  avatar_url?: string | null;
  gallery_urls?: string[];
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
        .select("id, name, source_provider_id")
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

  // Group plans by provider so a second provider (e.g. Car Wash) reads as
  // its own offering — not mixed into the apartment-cleaning grid. Providers
  // render in the order they appear in the top row (providersQ is already
  // ordered by sort_order); packages with an unknown provider_id fall into
  // an "Other" bucket at the end.
  const packageGroups = useMemo(() => {
    const providers = providersQ.data ?? [];
    // Universal `providers.id` ≠ legacy `cleaning_packages.provider_id` —
    // bridge via `source_provider_id`. Providers whose legacy row wasn't
    // backfilled into the universal table won't have a group header, and
    // their packages land in "Other".
    const byLegacyId = new Map<string, { id: string; name: string }>();
    providers.forEach((p) => {
      if (p.source_provider_id) byLegacyId.set(p.source_provider_id, { id: p.id, name: p.name });
    });

    const groups = new Map<string, { key: string; name: string; packages: any[] }>();
    visiblePackages.forEach((pkg) => {
      const match = pkg.provider_id ? byLegacyId.get(pkg.provider_id) : null;
      const key = match?.id ?? "__other__";
      const name = match?.name ?? "Other";
      if (!groups.has(key)) groups.set(key, { key, name, packages: [] });
      groups.get(key)!.packages.push(pkg);
    });

    // Preserve providers-row order; append "Other" last if it has content.
    const ordered: Array<{ key: string; name: string; packages: any[] }> = [];
    providers.forEach((p) => {
      const g = groups.get(p.id);
      if (g && g.packages.length) ordered.push(g);
    });
    const other = groups.get("__other__");
    if (other && other.packages.length) ordered.push(other);
    return ordered;
  }, [visiblePackages, providersQ.data]);

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

        {/* ─── Providers ──────────────────────────────────────────────
            Top-row: which businesses offer cleaning. Tap = scroll to plans. */}
        <section>
          <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Providers</h2>
          {providersQ.isLoading ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : providersQ.isError ? (
            <QueryError
              title="Couldn't load providers"
              error={providersQ.error instanceof Error ? providersQ.error.message : undefined}
              onRetry={() => providersQ.refetch()}
              retrying={providersQ.isFetching}
            />
          ) : providersQ.data && providersQ.data.length > 0 ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {providersQ.data.map((p) => {
                const gallery = (p.gallery_urls ?? []).slice(0, 3);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openProvider(p.id)}
                    className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-4 p-5">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                          <SparklesIcon className="h-6 w-6 text-primary" />
                        </span>
                      )}
                      <span className="text-xl font-black tracking-tight text-foreground">
                        {p.name}
                      </span>
                    </div>
                    {gallery.length > 0 && (
                      <div className="grid grid-cols-3 gap-0.5 bg-border/40">
                        {gallery.map((url, i) => (
                          <div key={i} className="aspect-video overflow-hidden bg-muted">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <YdEmptyState icon={SparklesIcon} title="No providers yet" subtitle="We're setting things up. Check back soon." />
          )}
        </section>

        {/* ─── Plans ──────────────────────────────────────────────── */}
        <section id="cleaning-plans" className="scroll-mt-4">
          <h2 className="mb-4 text-xl font-black tracking-tight text-foreground">Plans</h2>

          {packagesQ.isLoading ? (
            <div className="grid gap-3 md:gap-4 md:grid-cols-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-muted" />)}
            </div>
          ) : packagesQ.isError ? (
            <QueryError
              title="Couldn't load plans"
              error={packagesQ.error instanceof Error ? packagesQ.error.message : undefined}
              onRetry={() => packagesQ.refetch()}
              retrying={packagesQ.isFetching}
            />
          ) : packageGroups.length > 0 ? (
            <div className="space-y-8">
              {packageGroups.map((group) => (
                <div key={group.key} className="space-y-3">
                  {/* One header per provider — the row of packages under
                      it belongs together. Hidden when there's only one
                      provider so a solo group doesn't add visual noise. */}
                  {packageGroups.length > 1 && (
                    <div className="flex items-center gap-2">
                      <h3 className="text-caption font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        {group.name}
                      </h3>
                      <span className="text-caption text-muted-foreground/60">
                        · {group.packages.length}
                      </span>
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.packages.map((pkg: any) => (
                      <CleaningPackageCard
                        key={pkg.id}
                        pkg={pkg}
                        onSubscribe={goToCheckout}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <YdEmptyState
              icon={SparklesIcon}
              title={t("cleaning.noPackagesTitle")}
              subtitle={t("cleaning.noPackagesDescription")}
            />
          )}
        </section>

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
