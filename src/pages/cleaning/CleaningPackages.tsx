import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, supabaseDb } from "@/integrations/supabase/client";
import { useSelectedResidence } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";
import { Button } from "@/components/ui/button";
import {
  SparklesIcon, CheckCircle2, ArrowRight,
  CalendarDays, Clock, ShieldCheck, Info,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { formatUSD } from "@/lib/pricing";
import { useI18n } from "@/i18n";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import {
  formatFrequencyLabel, formatPricingLabel, resolveMonthlyPriceCents,
} from "@/lib/cleaningPlanPricing";
import { cn } from "@/lib/utils";

const CleaningPackages = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const visiblePackages = (packages ?? []).filter(
    (p: any) => !selectedResidenceId || (p.residenceIds?.length ?? 0) === 0 || p.residenceIds.includes(selectedResidenceId),
  );

  const goToCheckout = (pkgId: string) => {
    if (!isAuthenticated) {
      openAuthModal("login", `/cleaning/checkout/${pkgId}`);
    } else {
      navigate(`/cleaning/checkout/${pkgId}`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <HomeHeader title="Cleaning" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-4 md:py-8">

        {/* ─── Step indicator (mobile only — desktop shows on right) ─── */}
        <section className="lg:hidden mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Step 1 of 2
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">
            Choose your plan
          </h1>
        </section>

        {/* ─── Adaptive 2-column layout ────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:gap-8 lg:items-start">

          {/* ─── LEFT: Plan benefits (sticky on desktop) ── */}
          <div className="space-y-4 lg:sticky lg:top-24">
            <section className="overflow-hidden rounded-3xl bg-card">
              <BenefitRow
                icon={<CalendarDays className="h-5 w-5 text-muted-foreground" />}
                title="Flexible scheduling"
                caption="Pick your slot, change it any time"
              />
              <BenefitRow
                icon={<Clock className="h-5 w-5 text-muted-foreground" />}
                title="Recurring weekly visits"
                caption="2-hour standard session per visit"
              />
              <BenefitRow
                icon={<ShieldCheck className="h-5 w-5 text-muted-foreground" />}
                title="Cancel anytime"
                caption="No long-term commitment"
              />
            </section>
          </div>

          {/* ─── RIGHT: Step indicator + plan list ───────────────── */}
          <div className="space-y-4">
            <section className="hidden lg:block">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Step 1 of 2
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground">
                Choose your plan
              </h1>
            </section>

            {/* Plan list (grouped rows like CarDetail spec card) */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
                ))}
              </div>
            ) : visiblePackages.length > 0 ? (
              <section className="overflow-hidden rounded-3xl bg-card divide-y divide-border/60">
                {visiblePackages.map((pkg) => {
                  const monthlyCents = resolveMonthlyPriceCents(pkg);
                  const isSelected = selectedId === pkg.id;
                  return (
                    <PlanRow
                      key={pkg.id}
                      icon={<SparklesIcon className="h-5 w-5 text-sky-600" />}
                      title={pkg.name}
                      caption={`${formatPricingLabel(pkg)} · ${formatFrequencyLabel(pkg)}`}
                      price={formatUSD(monthlyCents)}
                      priceCaption="/ mo"
                      selected={isSelected}
                      onClick={() => setSelectedId(pkg.id)}
                    />
                  );
                })}
              </section>
            ) : (
              <section className="rounded-3xl bg-card p-8 text-center">
                <SparklesIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="font-semibold text-foreground">{t("cleaning.noPackagesTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("cleaning.noPackagesDescription")}
                </p>
              </section>
            )}

            {/* What's included summary */}
            {selectedId && visiblePackages.length > 0 && (() => {
              const pkg = visiblePackages.find((p) => p.id === selectedId);
              const features: string[] = Array.isArray(pkg?.features) ? pkg.features : [];
              if (!pkg) return null;
              return (
                <>
                  <h2 className="mt-4 text-xl font-black tracking-tight text-foreground">
                    What's included
                  </h2>
                  <section className="overflow-hidden rounded-3xl bg-card divide-y divide-border/60">
                    {(features.length > 0 ? features : [
                      t("cleaning.professionalPerWeek"),
                      t("cleaning.pickSlot"),
                      t("cleaning.hours"),
                    ]).map((f) => (
                      <div key={f} className="flex items-start gap-3 p-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </span>
                        <p className="flex-1 text-sm font-medium text-foreground leading-snug pt-1">
                          {f}
                        </p>
                      </div>
                    ))}
                  </section>
                </>
              );
            })()}

            {/* Note */}
            <section className="rounded-3xl bg-muted/40 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15">
                  <Info className="h-4 w-4 text-sky-600" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-foreground">What to expect</p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    Every plan includes the services listed. Extras (laundry, folding, specialised cleaning) can be requested and are priced separately.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ─── Sticky bottom CTA (Yandex/CarDetail style) ──────────── */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 bg-background/95 md:left-[var(--sidebar-width,0px)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="market-content px-4 py-3">
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Cancel anytime · 24h notice
          </div>
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base"
            disabled={!selectedId}
            onClick={() => selectedId && goToCheckout(selectedId)}
          >
            {selectedId ? (
              <>
                Continue
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            ) : (
              "Select a plan to continue"
            )}
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {selectedId ? "Next: review & pay" : "Tap a plan above"}
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── BenefitRow ────────────────────────────────────────────────────────────────
function BenefitRow({
  icon, title, caption,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 last:border-0 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{caption}</p>
        <p className="mt-0.5 font-bold text-foreground leading-tight">{title}</p>
      </div>
    </div>
  );
}

// ─── PlanRow (selectable grouped row, Yandex booking style) ───────────────────
function PlanRow({
  icon, title, caption, price, priceCaption, selected, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  price: string;
  priceCaption: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full text-left transition-colors p-4",
        selected ? "bg-primary/10" : "hover:bg-muted/30",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/40">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black tabular-nums text-foreground leading-none">
            {price}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{priceCaption}</p>
        </div>
        {/* Radio button */}
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
          aria-hidden="true"
        >
          {selected && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
        </span>
      </div>
    </button>
  );
}

export default CleaningPackages;
