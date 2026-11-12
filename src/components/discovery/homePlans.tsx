import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { periodNoun } from "@/lib/services/planPeriod";
import { planHref } from "@/lib/services/serviceUrls";
import { PhotoSlider } from "@/components/patterns/PhotoSlider";
import { Skeleton } from "@/components/patterns/Skeleton";
import { cn } from "@/lib/utils";
import { useTagDictionary } from "@/lib/tags";

/**
 * The plans the home page shows, fetched ONCE and shared by every shelf on it
 * — collections, "Saved", "Recently viewed" and "All plans" all pick from the
 * same list, so a shelf costs no query of its own.
 *
 * It is exactly what a provider's public page lists — `provider_plans`,
 * active, public, offers only (a variant is chosen inside its offer) — for
 * every live business at once.
 */

export interface HomePlan {
  id: string;
  name: string;
  price_cents: number | null;
  period: string | null;
  pricing_mode: string | null;
  source_plan_id: string | null;
  gallery_urls: unknown;
  /** Dictionary keys (lib/tags.ts) — and any old free-text words. */
  tags: string[] | null;
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

export function useHomePlans() {
  return useQuery({
    queryKey: ["home-all-plans"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select(
          "id, name, price_cents, period, pricing_mode, source_plan_id, gallery_urls, tags, sort_order, " +
          "provider:providers!inner(id, name, archetype_key, gallery_urls, banner_url, status)",
        )
        .eq("status", "active")
        .eq("visibility", "public")
        .is("parent_plan_id", null)
        .eq("provider.status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // A plan of a business with no service to live under has no page to open.
      return ((data ?? []) as unknown as HomePlan[]).filter((p) => p.provider?.archetype_key);
    },
  });
}

/**
 * Looks a plan up by whichever id a screen had in hand — the universal id or
 * the legacy one a cleaning package / meal plan / beach plan is known by.
 */
export function planIndex(plans: HomePlan[]) {
  const m = new Map<string, HomePlan>();
  for (const p of plans) {
    m.set(p.id, p);
    if (p.source_plan_id) m.set(String(p.source_plan_id), p);
  }
  return m;
}

/**
 * One business after another rather than each business's whole list in a
 * block: with nine dive courses and one meal plan, sorting by the business's
 * own order made the bottom of the home page a dive shop's catalogue.
 */
export function interleaveByProvider(plans: HomePlan[]): HomePlan[] {
  const queues = new Map<string, HomePlan[]>();
  for (const p of plans) {
    const k = p.provider?.id ?? "";
    if (!queues.has(k)) queues.set(k, []);
    queues.get(k)!.push(p);
  }
  const out: HomePlan[] = [];
  const lists = [...queues.values()];
  for (let round = 0; out.length < plans.length; round++) {
    for (const list of lists) if (list[round]) out.push(list[round]);
  }
  return out;
}

/** The photos a plan card shows: its own first, the business's as a fallback. */
export function planPhotos(plan: HomePlan | null | undefined, provider?: { gallery_urls?: unknown; banner_url?: string | null } | null): string[] {
  const own = urls(plan?.gallery_urls);
  if (own.length) return own;
  const p = provider ?? plan?.provider ?? null;
  return [...urls(p?.gallery_urls), p?.banner_url].filter((u): u is string => !!u);
}

/** "$75.00 / person · month" — the price line every plan card ends on. */
export function PriceLine({ cents, period, perPerson = false }: { cents: number | null; period: string | null; perPerson?: boolean }) {
  if (typeof cents !== "number" || cents <= 0) return null;
  const noun = periodNoun(period);
  return (
    <p className="text-[14px] font-semibold leading-[20px] text-foreground">
      {formatUSD(cents)}
      {noun && <span className="font-normal text-muted-foreground">{perPerson ? ` / person · ${noun}` : ` / ${noun}`}</span>}
    </p>
  );
}

/**
 * THE card for an offer on the home page — a plan for sale, a plan someone
 * saved, a plan someone already pays for, a plan a business paid to feature.
 * They are the same thing to the customer, so they are one shape: photo,
 * name, business, and a last line that says what matters HERE (the price, or
 * how long the subscription runs). A badge marks a paid placement.
 */
export const OfferCard = forwardRef<HTMLAnchorElement, {
  href: string;
  photos: string[];
  title: string;
  subtitle?: string | null;
  footer?: ReactNode;
  badge?: string;
  /** Over the photo's top-right corner — the heart, on a listing. */
  corner?: ReactNode;
  /** A plan's tags (labels), at most two — under the business name. */
  chips?: string[];
  className?: string;
  onClick?: () => void;
}>(function OfferCard({ href, photos, title, subtitle, footer, badge, corner, chips, className, onClick }, ref) {
  return (
    <Link
      ref={ref}
      to={href}
      onClick={onClick}
      className={cn(
        "flex flex-col overflow-hidden rounded-radius-md bg-card shadow-figma transition-colors active:scale-[0.98] hover:bg-muted/40",
        className,
      )}
    >
      {/* The frame owns the size: the photo is pinned inside it and cropped,
          so a tall picture can never stretch its card past the others. */}
      <div className="relative aspect-[4/3] w-full shrink-0">
        <PhotoSlider photos={photos} className="h-full w-full bg-muted" />
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-meta font-semibold text-white backdrop-blur">
            {badge}
          </span>
        )}
        {corner && <div className="absolute right-2 top-2">{corner}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 tracking-[-0.02em]">
        <p className="line-clamp-2 text-[15px] font-semibold leading-[20px] text-foreground">{title}</p>
        {subtitle && <p className="line-clamp-1 text-[13px] leading-[18px] text-muted-foreground">{subtitle}</p>}
        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {chips.slice(0, 2).map((c) => (
              <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold leading-[16px] text-foreground/80">{c}</span>
            ))}
          </div>
        )}
        {footer && <div className="mt-auto pt-1">{footer}</div>}
      </div>
    </Link>
  );
});

export function PlanTile({ plan, className }: { plan: HomePlan; className?: string }) {
  const provider = plan.provider!;
  const { labelsOf } = useTagDictionary();
  // Same link the provider's own list uses: the original id where the row
  // mirrors a legacy plan, so there is one address per product.
  const href = planHref(provider.archetype_key!, plan.source_plan_id ? String(plan.source_plan_id) : plan.id);
  return (
    <OfferCard
      href={href}
      photos={planPhotos(plan)}
      title={plan.name}
      subtitle={provider.name}
      chips={labelsOf(plan.tags, 2)}
      footer={<PriceLine cents={plan.price_cents} period={plan.period} perPerson={plan.pricing_mode === "per_person"} />}
      className={className}
    />
  );
}

/** A shelf's heading: title, an optional line under it, an optional link right. */
export function ShelfHeader({ title, subtitle, action }: { title: string; subtitle?: string | null; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-heading font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 line-clamp-1 text-meta text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Width of one card inside a Rail: two and a bit on a phone, four across on a laptop. */
export const RAIL_TILE = "w-[44%] shrink-0 snap-start sm:w-[30%] md:w-auto";

/**
 * A row of offer cards: swipes sideways on a phone (two and a bit visible, so
 * it reads as "there is more"), four across on a laptop.
 */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-space-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-space-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

export function PlanRail({ plans, loading = false }: { plans: HomePlan[]; loading?: boolean }) {
  return (
    <Rail>
      {loading
        ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className={cn("h-[220px]", RAIL_TILE)} />)
        : plans.map((p) => <PlanTile key={p.id} plan={p} className={RAIL_TILE} />)}
    </Rail>
  );
}
