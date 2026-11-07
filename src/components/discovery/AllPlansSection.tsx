import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { periodNoun } from "@/lib/services/planPeriod";
import { planHref } from "@/lib/services/serviceUrls";
import { Skeleton } from "@/components/patterns/Skeleton";
import { useI18n } from "@/i18n";
import { PhotoSlider } from "@/components/patterns/PhotoSlider";

/**
 * Every plan on the platform, one card each, at the foot of the home page.
 *
 * It reads exactly what a provider's public page lists — `provider_plans`,
 * active, public, offers only (a variant is chosen inside its offer) — but for
 * every live business at once. Food and cleaning sell through offers there
 * too, so one query covers every service, and a card opens the same plan page
 * the provider's own list opens.
 */

interface PlanRow {
  id: string;
  name: string;
  price_cents: number | null;
  period: string | null;
  pricing_mode: string | null;
  source_plan_id: string | null;
  gallery_urls: unknown;
  provider: {
    id: string;
    name: string;
    archetype_key: string | null;
    gallery_urls: unknown;
    banner_url: string | null;
  } | null;
}

/** Every usable photo URL in a jsonb list. */
const urls = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((u): u is string => typeof u === "string" && !!u.trim()) : [];

function useAllPlans() {
  return useQuery({
    queryKey: ["home-all-plans"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select(
          "id, name, price_cents, period, pricing_mode, source_plan_id, gallery_urls, sort_order, " +
          "provider:providers!inner(id, name, archetype_key, gallery_urls, banner_url, status)",
        )
        .eq("status", "active")
        .eq("visibility", "public")
        .is("parent_plan_id", null)
        .eq("provider.status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // A plan of a business with no service to live under has no page to open.
      return ((data ?? []) as unknown as PlanRow[]).filter((p) => p.provider?.archetype_key);
    },
  });
}

export function AllPlansSection() {
  const { t } = useI18n();
  const { data: plans = [], isLoading } = useAllPlans();

  if (!isLoading && plans.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-semibold text-foreground">
        {t("discovery.allPlans")}
      </h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)
          : plans.map((plan) => <PlanTile key={plan.id} plan={plan} />)}
      </div>
    </section>
  );
}

function PlanTile({ plan }: { plan: PlanRow }) {
  const provider = plan.provider!;
  // The plan's own photograph first; the business's only as a fallback.
  const own = urls(plan.gallery_urls);
  const images = own.length ? own : [...urls(provider.gallery_urls), provider.banner_url].filter((u): u is string => !!u);
  const noun = periodNoun(plan.period);
  const hasPrice = typeof plan.price_cents === "number" && plan.price_cents > 0;
  // Same link the provider's own list uses: the original id where the row
  // mirrors a legacy plan, so there is one address per product.
  const href = planHref(provider.archetype_key!, plan.source_plan_id ? String(plan.source_plan_id) : plan.id);

  return (
    <Link
      to={href}
      className="flex flex-col overflow-hidden rounded-radius-md bg-card shadow-figma transition-colors active:scale-[0.98] hover:bg-muted/40"
    >
      {/* The frame owns the size: the photo is pinned inside it and cropped,
          so a tall picture can never stretch its card past the others. */}
      <PhotoSlider photos={images} className="aspect-[4/3] w-full shrink-0 bg-muted" />
      <div className="flex flex-1 flex-col gap-1 p-3 tracking-[-0.02em]">
        <p className="line-clamp-2 text-[15px] font-semibold leading-[20px] text-foreground">{plan.name}</p>
        <p className="line-clamp-1 text-[13px] leading-[18px] text-muted-foreground">{provider.name}</p>
        {hasPrice && (
          <p className="mt-auto pt-1 text-[14px] font-semibold leading-[20px] text-foreground">
            {formatUSD(plan.price_cents!)}
            {noun && (
              <span className="font-normal text-muted-foreground">
                {plan.pricing_mode === "per_person" ? ` / person · ${noun}` : ` / ${noun}`}
              </span>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
