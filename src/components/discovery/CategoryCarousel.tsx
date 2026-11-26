import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCategoryHighlights, type CategoryHighlight } from "@/hooks/useCategoryHighlights";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/patterns/Skeleton";
import { CategoryBannerArt } from "@/components/discovery/categoryBannerArt";
import { categoryDealBadge, useActiveDiscounts } from "@/lib/discounts";

/**
 * The wide banner above the services grid: one slide per category, each a
 * direct way in.
 *
 * The services grid answers "what kinds of business are here". It does not
 * answer "where do I get my car washed", because Car Wash lives one tap
 * inside Cleaning and nothing on the home page says so. This puts every
 * category on the front page, priced, and links each one straight to its
 * listing already narrowed to it.
 *
 * It is a banner slider, the way a marketplace's front page has one: one
 * wide banner at a time, all in the brand yellow like the cards before them,
 * a big headline on the left and its drawing on the right, dots to move
 * between them. On a laptop an optional tall banner sits beside it (`side`).
 * A banner is badged when there is a reason to tap — a live deal, or "New".
 *
 * RULE: these cards are always illustrated, never a photo. Not an admin's
 * picture, not a provider's, not as a fallback. One photo card in a row of
 * drawings (Coffee showed a roastery shot beside the drawn Club, Cleaning and
 * Diving) breaks the whole strip. Each category has its own drawing in
 * categoryBannerArt; one without gets that file's illustrated fallback.
 */

const ROTATE_MS = 5000;
/** A category added this recently wears a "New" badge. */
const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/** What a card says on top of its name: a live deal first, else "New". */
interface CardBadge { text: string; deal: boolean }

function useBadges(items: CategoryHighlight[]): Map<string, CardBadge> {
  const { data: discounts } = useActiveDiscounts();
  return useMemo(() => {
    const now = Date.now();
    const m = new Map<string, CardBadge>();
    for (const h of items) {
      const deal = categoryDealBadge(discounts, h.providerIds, now);
      if (deal) { m.set(h.key, { text: deal, deal: true }); continue; }
      const added = h.createdAt ? Date.parse(h.createdAt) : NaN;
      if (Number.isFinite(added) && now - added < NEW_FOR_MS) m.set(h.key, { text: "New", deal: false });
    }
    return m;
  }, [items, discounts]);
}

/** The small chip above the headline: "−20%", "New". */
function Badge({ badge, big }: { badge?: CardBadge; big?: boolean }) {
  if (!badge) return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full font-semibold",
        big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-2xs",
        badge.deal ? "bg-white text-destructive" : "bg-primary-foreground/10 text-primary-foreground",
      )}
    >
      {badge.text}
    </span>
  );
}

/**
 * One banner. Words on the left half, the drawing on the right half — two
 * columns, so the headline never runs under the drawing.
 * item.imageUrl is deliberately NOT used here (see the note at the top of
 * the file); the catalog sidebar still shows it.
 */
function Banner({ item, badge, big }: { item: CategoryHighlight; badge?: CardBadge; big?: boolean }) {
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      className="group relative flex h-full w-full overflow-hidden bg-primary"
    >
      <div className={cn("relative z-10 flex min-w-0 flex-1 flex-col justify-center", big ? "gap-2 py-6 pl-8 pr-4" : "gap-1 py-4 pl-4 pr-1")}>
        <Badge badge={badge} big={big} />
        {item.archetype && (
          <p className={cn("truncate text-primary-foreground/70", big ? "text-title" : "text-meta")}>{item.archetype.label}</p>
        )}
        <p className={cn("font-bold leading-[1.05] tracking-tight text-primary-foreground", big ? "line-clamp-2 text-4xl" : "line-clamp-2 text-title")}>
          {item.label}
        </p>
        {item.fromCents !== null && (
          <p className={cn("text-primary-foreground/70", big ? "text-title" : "text-meta")}>
            from <span className="font-bold text-primary-foreground">{formatUSD(item.fromCents)}</span>
            {item.unit ? ` ${item.unit}` : ""}
          </p>
        )}
        {big && (
          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-body font-semibold text-[#1f1a14] transition-transform group-hover:translate-x-0.5">
            See plans <ChevronRight className="h-5 w-5" />
          </span>
        )}
      </div>
      <CategoryBannerArt
        categoryKey={item.key}
        icon={item.archetype?.Icon}
        className={cn(
          "relative h-full shrink-0 origin-bottom-right transition-transform duration-500 group-hover:scale-[1.03]",
          big ? "w-[46%] py-3 pr-4" : "w-[46%] max-w-[180px]",
        )}
      />
    </Link>
  );
}

/** Dots in a frosted pill, centred at the bottom of the banner. */
function Dots({ count, index, onPick }: { count: number; index: number; onPick: (i: number) => void }) {
  if (count <= 1) return null;
  return (
    <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1.5 backdrop-blur-sm">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Banner ${i + 1} of ${count}`}
          aria-current={i === index}
          onClick={(e) => { e.preventDefault(); onPick(i); }}
          className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80")}
        />
      ))}
    </div>
  );
}

function SlideArrow({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? "Next banner" : "Previous banner"}
      className={cn(
        "absolute top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#1f1a14] opacity-0 shadow-figma transition-opacity hover:bg-white group-hover/slider:opacity-100 md:grid",
        dir === 1 ? "right-3" : "left-3",
      )}
    >
      {dir === 1 ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
    </button>
  );
}

export function CategoryCarousel({ family, side }: {
  /** Show only categories whose service belongs to this family (home tabs). */
  family?: string;
  /** A tall banner beside the slider on a laptop (lg+), like a marketplace's side promo. */
  side?: ReactNode;
} = {}) {
  const { highlights: allHighlights, isLoading } = useCategoryHighlights();
  const inFamily = family
    ? allHighlights.filter((h) => h.archetype?.family === family)
    : allHighlights;
  // A category with nothing on sale is a banner to an empty listing — the
  // Healthcare slide said "Healthcare" and nothing else. Hide it until it has
  // a price; if no price loaded at all (a failed lookup), keep everything
  // rather than blank the banner.
  const filtered = inFamily.some((h) => h.fromCents !== null)
    ? inFamily.filter((h) => h.fromCents !== null)
    : inFamily;
  const badges = useBadges(filtered);
  // Banners with news first: a deal, then something new, then the rest in
  // the admin's order.
  const highlights = useMemo(() => {
    const rank = (h: CategoryHighlight) => (badges.get(h.key)?.deal ? 0 : badges.has(h.key) ? 1 : 2);
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [filtered, badges]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = highlights.length;
  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => (count ? (i + dir + count) % count : 0));
  }, [count]);

  // Auto-advance, but never while a finger or a cursor is on it.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  // Reset when the set changes, so an admin deactivating a category can't
  // leave the slider parked past its own end.
  useEffect(() => { setIndex(0); }, [count]);

  // Swipe. Threshold in pixels rather than a fraction of width so it feels the
  // same on a phone and on a wide desktop.
  const startX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (count <= 1) return;
    startX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    setPaused(false);
    if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
  };

  if (isLoading) {
    return <Skeleton className="h-[160px] md:h-[260px]" />;
  }
  if (count === 0) return side ? <div className="hidden lg:block">{side}</div> : null;

  return (
    <div className={cn("grid gap-2", side && "lg:grid-cols-[minmax(0,1fr)_240px]")}>
      <section
        aria-roledescription="carousel"
        aria-label="Browse by category"
        className="group/slider relative h-[160px] overflow-hidden rounded-radius-md md:h-[260px] md:rounded-radius-lg"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {highlights.map((h, i) => (
            <div key={h.key} className="h-full w-full shrink-0" aria-hidden={i !== index}>
              {/* Phones get the compact banner, md+ the big one. */}
              <div className="h-full md:hidden"><Banner item={h} badge={badges.get(h.key)} /></div>
              <div className="hidden h-full md:block"><Banner item={h} badge={badges.get(h.key)} big /></div>
            </div>
          ))}
        </div>
        {count > 1 && <SlideArrow dir={-1} onClick={() => go(-1)} />}
        {count > 1 && <SlideArrow dir={1} onClick={() => go(1)} />}
        <Dots count={count} index={index} onPick={setIndex} />
      </section>
      {side && <div className="hidden min-w-0 lg:block">{side}</div>}
    </div>
  );
}
