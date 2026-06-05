import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SparklesIcon, CheckCircle2, CalendarDays, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { formatUSD } from "@/lib/pricing";
import { EmptyState } from "@/components/EmptyState";
import { useI18n } from "@/i18n";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { formatFrequencyLabel, formatPricingLabel, resolveMonthlyPriceCents } from "@/lib/cleaningPlanPricing";

const CleaningPackages = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();

  const { data: packages, isLoading } = useQuery({
    queryKey: ["cleaning-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_packages")
        .select("*")
        .eq("is_active", true)
        .eq("visibility", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title="Subscriptions" />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-12">
        <section className="grid gap-space-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.42fr)]">
          <div className="rounded-radius-xl bg-card p-space-6 md:p-space-8 xl:p-space-10">
            <div className="inline-flex items-center gap-space-2 rounded-radius-full bg-primary/10 px-space-4 py-space-2 text-primary">
              <SparklesIcon className="h-4 w-4" />
              <span className="text-caption uppercase tracking-[0.12em]">{t("cleaning.badge")}</span>
            </div>
            <h1 className="mt-space-6 text-page-title">{t("cleaning.choosePlan")}</h1>
            <p className="mt-space-4 max-w-2xl text-body text-muted-foreground">
              {t("cleaning.subtitle")}
            </p>
          </div>

          <div className="grid gap-space-3 rounded-radius-xl bg-card p-space-4 md:p-space-6">
            {[
              { icon: CalendarDays, label: t("cleaning.availability") },
              { icon: CheckCircle2, label: t("cleaning.frequency") },
              { icon: Clock, label: t("cleaning.cancelAnytime") },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-space-3 rounded-radius-md bg-[hsl(var(--app-rail))] px-space-4 py-space-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-full bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-control text-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-space-8 md:pt-space-12">
          {isLoading ? (
            <div className="grid gap-space-4 md:grid-cols-2">
              <div className="h-[340px] animate-pulse rounded-3xl bg-muted" />
              <div className="h-[340px] animate-pulse rounded-3xl bg-muted" />
            </div>
          ) : packages && packages.length > 0 ? (
            <div className="grid gap-space-4 md:grid-cols-2 xl:grid-cols-3">
              {packages.map((pkg, idx) => {
                const totalCents = resolveMonthlyPriceCents(pkg);
                const isFeatured = idx === 0;
                return (
                  <article
                    key={pkg.id}
                    className={`relative flex flex-col overflow-hidden rounded-3xl border p-6 md:p-7 ${
                      isFeatured
                        ? "border-foreground/15 bg-card"
                        : "border-border bg-card"
                    }`}
                  >
                    {isFeatured && (
                      <div className="absolute right-4 top-4">
                        <span className="rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                          Popular
                        </span>
                      </div>
                    )}

                    {/* Price block */}
                    <div className="mb-6">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {pkg.name}
                      </p>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="tabular-nums text-4xl font-black tracking-tight text-foreground">
                          {formatUSD(totalCents)}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">/ mo</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPricingLabel(pkg)} · {formatFrequencyLabel(pkg)}
                      </p>
                    </div>

                    {/* Features */}
                    <div className="flex-1 space-y-3">
                      {[
                        t("cleaning.professionalPerWeek"),
                        t("cleaning.pickSlot"),
                        t("cleaning.hours"),
                      ].map((feature) => (
                        <div key={feature} className="flex items-center gap-3">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="text-sm text-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <button
                      type="button"
                      className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-foreground text-sm font-bold text-background transition-all hover:bg-foreground/90 active:scale-[0.98]"
                      onClick={() => {
                        if (!isAuthenticated) {
                          openAuthModal("login", `/cleaning/checkout/${pkg.id}`);
                        } else {
                          navigate(`/cleaning/checkout/${pkg.id}`);
                        }
                      }}
                    >
                      {t("cleaning.choose")} · {formatUSD(totalCents)}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-6 md:p-10">
              <EmptyState
                title={t("cleaning.noPackagesTitle")}
                description={t("cleaning.noPackagesDescription")}
              />
            </div>
          )}
        </section>

        {isAuthenticated && (
          <section className="pt-space-6 md:pt-space-8">
            <Button asChild variant="secondary" size="lg" className="w-full rounded-full md:w-auto">
              <Link to="/my-subscriptions?tab=cleaning">
                {t("cleaning.viewBookings")}
              </Link>
            </Button>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default CleaningPackages;
