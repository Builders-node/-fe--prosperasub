import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SparklesIcon, CheckCircle2, CalendarDays, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatUSD } from "@/lib/pricing";
import { EmptyState } from "@/components/EmptyState";
import { useI18n } from "@/i18n";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";

const CleaningPackages = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  const { data: packages, isLoading } = useQuery({
    queryKey: ["cleaning-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_packages")
        .select("*")
        .eq("is_active", true)
        .order("price_per_cleaning_cents", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="market-shell">
      <HomeHeader />
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
            <div className="grid gap-space-5 md:grid-cols-2">
              <div className="h-[300px] animate-pulse rounded-radius-xl bg-muted" />
              <div className="h-[300px] animate-pulse rounded-radius-xl bg-muted" />
            </div>
          ) : packages && packages.length > 0 ? (
            <div className="grid gap-space-5 md:grid-cols-2 xl:grid-cols-3">
              {packages.map((pkg) => {
                const totalCents = pkg.price_per_cleaning_cents * pkg.cleanings_per_month;
                return (
                  <article
                    key={pkg.id}
                    className="flex min-h-[310px] flex-col rounded-radius-xl bg-card p-space-5 text-card-foreground md:p-space-6"
                  >
                    <div className="flex items-start justify-between gap-space-4">
                      <div>
                        <h2 className="text-card-title">{pkg.name}</h2>
                        <p className="mt-space-2 text-body text-muted-foreground">
                          {t("cleaning.onePerWeek")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-3xl font-black text-primary">
                          {formatUSD(totalCents)}
                        </p>
                        <p className="text-caption text-muted-foreground">/ {t("common.month")}</p>
                      </div>
                    </div>

                    <div className="mt-space-6 flex-1 space-y-space-3">
                      {[
                        t("cleaning.professionalPerWeek"),
                        t("cleaning.pickSlot"),
                        t("cleaning.hours"),
                      ].map((feature) => (
                        <div key={feature} className="flex items-start gap-space-3 text-body">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      size="lg"
                      className="mt-space-6 w-full"
                      onClick={() => {
                        if (!isAuthenticated) {
                          navigate(`/auth?redirect=/cleaning/checkout/${pkg.id}`);
                        } else {
                          navigate(`/cleaning/checkout/${pkg.id}`);
                        }
                      }}
                    >
                      {t("cleaning.choose")} {formatUSD(totalCents)}
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-radius-xl bg-card p-space-6 md:p-space-10">
              <EmptyState
                title={t("cleaning.noPackagesTitle")}
                description={t("cleaning.noPackagesDescription")}
              />
            </div>
          )}
        </section>

        {isAuthenticated && (
          <section className="pt-space-6 md:pt-space-8">
            <Button asChild variant="secondary" size="lg" className="w-full md:w-auto">
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
