import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Star } from "lucide-react";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { Skeleton } from "@/components/patterns/Skeleton";
import { OfferCard, PriceLine } from "@/components/discovery/homePlans";
import { ALL_CATEGORIES } from "@/components/listing/ListingNav";
import { SORT_LABELS, type SortKey } from "@/hooks/useListingSearch";
import { trackPromotion, useActivePromotions } from "@/lib/promotions";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/pricing";
import { SearchX } from "lucide-react";

/**
 * A service's listing on a laptop — after Yandex Lavka's catalogue, in our
 * style: filters down the left, the offers in a grid on the right.
 *
 *   ┌ Clubs & Sport ┐  [Recommended ▾]                     12 plans
 *   │ Categories    │  ┌────┐ ┌────┐ ┌────┐
 *   │ Price, $      │  │    │ │    │ │    │   featured first, with a badge
 *   │ Businesses    │  └────┘ └────┘ └────┘
 *   └───────────────┘
 *
 * The phone keeps its own layout (search field + chips + list); this replaces
 * it from `md` up. There is no search field here: the header's search is one
 * line above and covers the whole catalogue. Price and business filters live
 * in the URL (?min= ?max= ?biz=) like the category and the sort, so a filtered
 * page survives a reload and Back.
 */

export interface ListingPlan {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  priceCents: number | null;
  period: string | null;
  perPerson: boolean;
  photos: string[];
  href: string;
  rating: { average: number; count: number } | null;
  /** The promotion that put it first, if one did. */
  promotionId: string | null;
  /** Up to two tag labels for the card. */
  tags?: string[];
  /** Overrides the period's word: a car is "/ day", not a cadence. */
  unit?: string;
  /** What the heart saves — a plan unless said otherwise (a vehicle). */
  favoriteKind?: "plan" | "vehicle";
}

export interface ListingBusiness { id: string; name: string; avatarUrl: string | null }

/**
 * Which paid placement, if any, lifts a plan on a service's listing. A
 * promotion of a plan lifts that plan; of a business, all of its plans. Plans
 * and businesses are matched by ANY id they go by (universal or legacy), so
 * the legacy listings (food, cleaning) can ask with what they hold.
 */
export function usePromotionLookup(archetypeKey: string | null | undefined) {
  const { data: promos = [] } = useActivePromotions("service", archetypeKey);
  return useMemo(() => {
    const byPlan = new Map<string, string>();
    const byProvider = new Map<string, string>();
    for (const p of promos) {
      if (p.plan) {
        byPlan.set(p.plan.id, p.id);
        if (p.plan.sourcePlanId) byPlan.set(String(p.plan.sourcePlanId), p.id);
      } else {
        byProvider.set(p.provider.id, p.id);
        if (p.provider.sourceProviderId) byProvider.set(String(p.provider.sourceProviderId), p.id);
      }
    }
    return (planIds: Array<string | null | undefined>, providerIds: Array<string | null | undefined>): string | null => {
      for (const id of planIds) if (id && byPlan.has(String(id))) return byPlan.get(String(id))!;
      for (const id of providerIds) if (id && byProvider.has(String(id))) return byProvider.get(String(id))!;
      return null;
    };
  }, [promos]);
}

/** Featured first, the rest in the order they came. */
export function featuredFirst<T>(rows: T[], isFeatured: (row: T) => boolean): T[] {
  return [...rows.filter(isFeatured), ...rows.filter((r) => !isFeatured(r))];
}

/** ?min ?max (dollars) and ?biz (comma-separated provider ids). */
export function useDesktopFilters() {
  const [params, setParams] = useSearchParams();
  const num = (k: string) => {
    const v = Number(params.get(k));
    return params.get(k) && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const min = num("min");
  const max = num("max");
  const biz = (params.get("biz") ?? "").split(",").filter(Boolean);
  const set = (patch: Record<string, string | null>) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v) out.set(k, v); else out.delete(k); }
    return out;
  }, { replace: true });
  return {
    min, max, biz,
    setMin: (v: string) => set({ min: v.trim() || null }),
    setMax: (v: string) => set({ max: v.trim() || null }),
    toggleBiz: (id: string) => {
      const next = biz.includes(id) ? biz.filter((x) => x !== id) : [...biz, id];
      set({ biz: next.join(",") || null });
    },
    // seats / gear are the vehicles listing's own (features/vehicles Fleet).
    reset: () => set({ min: null, max: null, biz: null, category: null, tags: null, seats: null, gear: null }),
    active: min !== null || max !== null || biz.length > 0 || !!params.get("tags") || !!params.get("seats") || !!params.get("gear"),
    apply: <T extends ListingPlan>(rows: T[]) => rows.filter((r) => {
      if (biz.length && !biz.includes(r.providerId)) return false;
      const dollars = r.priceCents === null ? null : r.priceCents / 100;
      if (min !== null && (dollars === null || dollars < min)) return false;
      if (max !== null && (dollars === null || dollars > max)) return false;
      return true;
    }),
  };
}

export function DesktopListing({
  title, categories, category, onCategory, businesses, plans, loading, sort, sorts, onSort, filters, empty, extraFilters, notice,
  noun = ["plan", "plans"],
}: {
  /** What the count says: "6 vehicles", "12 plans". */
  noun?: [string, string];
  title: string;
  categories: Array<{ key: string; label: string }>;
  category: string;
  onCategory: (key: string) => void;
  businesses: ListingBusiness[];
  /** Already filtered and sorted, featured first. */
  plans: ListingPlan[];
  loading: boolean;
  sort: SortKey;
  sorts: SortKey[];
  onSort: (s: SortKey) => void;
  filters: ReturnType<typeof useDesktopFilters>;
  empty?: ReactNode;
  /** A page's own filters (food: diets), drawn after the price. */
  extraFilters?: ReactNode;
  /** One line above the grid (e.g. "2 restaurants don't deliver to Pristine Bay"). */
  notice?: ReactNode;
}) {
  const priceRange = useMemo(() => {
    const prices = plans.map((p) => p.priceCents).filter((c): c is number => typeof c === "number" && c > 0);
    return prices.length ? { lo: Math.floor(Math.min(...prices) / 100), hi: Math.ceil(Math.max(...prices) / 100) } : null;
  }, [plans]);

  return (
    <div className="app-container hidden gap-8 py-space-8 md:flex">
      {/* ── Filters ─────────────────────────────────────────────────── */}
      <aside className="w-[260px] shrink-0 space-y-6">
        <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight text-foreground">{title}</h1>

        {categories.length > 1 && (
          <FilterGroup title="Categories">
            <div className="flex flex-col">
              {[{ key: ALL_CATEGORIES, label: "All" }, ...categories].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onCategory(c.key)}
                  className={cn(
                    "-mx-3 rounded-radius-md px-3 py-2 text-left text-[16px] transition-colors",
                    category === c.key ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/60",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </FilterGroup>
        )}

        <FilterGroup title="Price, $">
          <div className="grid grid-cols-2 gap-2">
            <PriceField
              label="From"
              value={filters.min}
              placeholder={priceRange ? `From ${priceRange.lo}` : "From"}
              onCommit={filters.setMin}
            />
            <PriceField
              label="To"
              value={filters.max}
              placeholder={priceRange ? `To ${priceRange.hi}` : "To"}
              onCommit={filters.setMax}
            />
          </div>
        </FilterGroup>

        {extraFilters}

        {businesses.length > 1 && (
          <FilterGroup title="Businesses">
            <div className="flex flex-wrap gap-2">
              {businesses.map((b) => {
                const on = filters.biz.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => filters.toggleBiz(b.id)}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-full pl-1 pr-3 text-[14px] font-semibold transition-colors",
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70",
                    )}
                  >
                    <span aria-hidden className="h-8 w-8 overflow-hidden rounded-full">
                      <Photo src={b.avatarUrl} label={initialsOf(b.name)} />
                    </span>
                    {b.name}
                  </button>
                );
              })}
            </div>
          </FilterGroup>
        )}

        {filters.active && (
          <button type="button" onClick={filters.reset} className="text-[14px] font-semibold text-primary">
            Reset filters
          </button>
        )}
      </aside>

      {/* ── Offers ──────────────────────────────────────────────────── */}
      <section className="min-w-0 flex-1 space-y-4" aria-label="Plans">
        <div className="flex items-center justify-between gap-3">
          {sorts.length > 1 ? (
            <label className="relative inline-flex h-10 items-center rounded-full bg-muted pl-4 pr-9 text-[14px] font-semibold text-foreground">
              <span className="sr-only">Sort by</span>
              <select
                value={sort}
                onChange={(e) => onSort(e.target.value as SortKey)}
                className="cursor-pointer appearance-none bg-transparent outline-none"
              >
                {sorts.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
            </label>
          ) : <span />}
          {!loading && (
            <span className="text-[14px] text-muted-foreground">
              {plans.length} {plans.length === 1 ? noun[0] : noun[1]}
            </span>
          )}
        </div>

        {notice}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[300px]" />)}
          </div>
        ) : plans.length === 0 ? (
          empty ?? <YdEmptyState icon={SearchX} title="Nothing matches" subtitle="Try another category, or reset the filters." />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {plans.map((p) => <ListingCard key={p.id} plan={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}

export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[16px] font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

/** Commits on blur or Enter, so the URL isn't rewritten on every keystroke. */
function PriceField({ label, value, placeholder, onCommit }: {
  label: string; value: number | null; placeholder: string; onCommit: (v: string) => void;
}) {
  return (
    <input
      key={value ?? "none"}
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={`Price ${label.toLowerCase()}`}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value); }}
      className="h-12 w-full min-w-0 rounded-radius-md bg-muted px-4 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

function ListingCard({ plan }: { plan: ListingPlan }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const promo = plan.promotionId;
  // A paid placement is counted as seen when half of it is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!promo || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { trackPromotion(promo, "impression"); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [promo]);

  return (
    <OfferCard
      ref={ref}
      href={plan.href}
      onClick={promo ? () => trackPromotion(promo, "click") : undefined}
      photos={plan.photos}
      badge={promo ? "Featured" : undefined}
      corner={<FavoriteButton kind={plan.favoriteKind ?? "plan"} id={plan.id} name={plan.name} variant="overlay" />}
      title={plan.name}
      subtitle={plan.providerName}
      chips={plan.tags}
      footer={
        <div className="space-y-0.5">
          {plan.unit && typeof plan.priceCents === "number" && plan.priceCents > 0 ? (
            <p className="text-[14px] font-semibold leading-[20px] text-foreground">
              {formatUSD(plan.priceCents)}<span className="font-normal text-muted-foreground"> / {plan.unit}</span>
            </p>
          ) : (
            <PriceLine cents={plan.priceCents} period={plan.period} perPerson={plan.perPerson} />
          )}
          {plan.rating && plan.rating.count > 0 && (
            <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span className="font-semibold text-foreground">{plan.rating.average.toFixed(1)}</span>
              ({plan.rating.count})
            </p>
          )}
        </div>
      }
    />
  );
}
