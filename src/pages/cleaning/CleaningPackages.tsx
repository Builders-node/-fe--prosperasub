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
        .select("id, name")
        .eq("archetype_key", "cleaning")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CleaningProvider[];
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
              {providersQ.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProvider(p.id)}
                  className="flex h-28 items-center justify-center rounded-3xl border border-border bg-card px-6 text-center transition-colors hover:border-primary/40"
                >
                  <span className="text-2xl font-black tracking-tight text-foreground">
                    {p.name}
                  </span>
                </button>
              ))}
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
          ) : visiblePackages.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visiblePackages.map((pkg: any, idx: number) => (
                <CleaningPackageCard
                  key={pkg.id}
                  pkg={pkg}
                  featured={idx === 1 && visiblePackages.length > 1}
                  onSubscribe={goToCheckout}
                />
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
