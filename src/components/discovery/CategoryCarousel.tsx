import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useCategoryHighlights, type CategoryHighlight } from "@/hooks/useCategoryHighlights";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/patterns/Skeleton";
import { CategoryBannerArt } from "@/components/discovery/categoryBannerArt";
import { CATEGORY_INK, categoryTone } from "@/components/discovery/categoryTones";
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
 * On a desktop it is a bento block (DesktopBento): one big card, the others
 * beside it, every category in its own colour (categoryTones) and badged
 * when there is a reason to tap — a live deal, or "New".
 *
 * RULE: these cards are always illustrated, never a photo. Not an admin's
 * picture, not a provider's, not as a fallback. One photo card in a row of
 * drawings (Coffee showed a roastery shot beside the drawn Club, Cleaning and
 * Diving) breaks the whole strip. Each category has its own drawing in
 * categoryBannerArt; one without gets that file's illustrated fallback.
 */

const ROTATE_MS = 3000;
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

function Badge({ badge }: { badge?: CardBadge }) {
  if (!badge) return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full truncate rounded-full px-2 py-0.5 text-2xs font-bold uppercase leading-4 tracking-wide",
        badge.deal ? "bg-[#e5482d] text-white" : "bg-[#1f1a14] text-white",
      )}
    >
      {badge.text}
    </span>
  );
}

function Price({ item, big = false }: { item: CategoryHighlight; big?: boolean }) {
  if (item.fromCents === null) return null;
  return (
    <p className={cn("leading-tight", big ? "text-base" : "text-meta")} style={{ color: `${CATEGORY_INK}b3` }}>
      from{" "}
      <span className={cn("font-bold tabular-nums", big ? "text-2xl" : "text-base")} style={{ color: CATEGORY_INK }}>
        {formatUSD(item.fromCents)}
      </span>
      {item.unit ? ` ${item.unit}` : ""}
    </p>
  );
}

/**
 * One category card. The words get the left of the card and the drawing the
 * right, as two columns — never stacked on each other. Laid over the drawing,
 * "Apartment Cleaning" ran under the spray bottle and "/ month" under the
 * coffee beans. item.imageUrl is deliberately NOT used here (see the note at
 * the top of the file); the catalog sidebar still shows it.
 */
function Slide({ item, badge, className }: { item: CategoryHighlight; badge?: CardBadge; className?: string }) {
  const tone = categoryTone(item.key);
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      className={cn(
        "group relative flex h-[140px] w-full shrink-0 overflow-hidden rounded-radius-md transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-figma",
        className,
      )}
      style={{ backgroundColor: tone.bg }}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-end gap-0.5 py-4 pl-4 pr-1">
        <span className="mb-auto"><Badge badge={badge} /></span>
        {item.archetype && (
          <p className="truncate text-meta" style={{ color: `${CATEGORY_INK}b3` }}>{item.archetype.label}</p>
        )}
        <p className="line-clamp-2 text-title font-semibold leading-tight" style={{ color: CATEGORY_INK }}>{item.label}</p>
        <Price item={item} />
      </div>
      <CategoryBannerArt
        categoryKey={item.key}
        icon={item.archetype?.Icon}
        glow={tone.glow}
        className="h-full w-[44%] max-w-[180px] shrink-0 origin-bottom-right transition-transform duration-300 group-hover:scale-105"
      />
    </Link>
  );
}

/**
 * The big card of the desktop block: the one category with a reason to look
 * today (a deal, else something new), drawn twice the size, with a button.
 */
function FeatureCard({ item, badge }: { item: CategoryHighlight; badge?: CardBadge }) {
  const tone = categoryTone(item.key);
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      className="group relative flex h-full min-h-0 overflow-hidden rounded-radius-lg transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-figma"
      style={{ backgroundColor: tone.bg }}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-1 p-6 pr-2">
        <Badge badge={badge} />
        {item.archetype && (
          <p className="mt-auto truncate text-base" style={{ color: `${CATEGORY_INK}b3` }}>{item.archetype.label}</p>
        )}
        <p className={cn("line-clamp-2 text-4xl font-bold leading-[1.1] tracking-tight", !item.archetype && "mt-auto")} style={{ color: CATEGORY_INK }}>
          {item.label}
        </p>
        <Price item={item} big />
        <span
          className="mt-3 inline-flex w-fit items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: CATEGORY_INK }}
        >
          Explore <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <CategoryBannerArt
        categoryKey={item.key}
        icon={item.archetype?.Icon}
        glow={tone.glow}
        className="h-full w-[46%] max-w-[300px] shrink-0 origin-bottom-right transition-transform duration-300 group-hover:scale-105"
      />
    </Link>
  );
}

export function CategoryCarousel({ family }: {
  /** Show only categories whose service belongs to this family (home tabs). */
  family?: string;
} = {}) {
  const { highlights: allHighlights, isLoading } = useCategoryHighlights();
  const inFamily = family
    ? allHighlights.filter((h) => h.archetype?.family === family)
    : allHighlights;
  // A category with nothing on sale is a banner to an empty listing — the
  // Healthcare slide said "Healthcare" and nothing else. Hide it until it has
  // a price; if no price loaded at all (a failed lookup), keep everything
  // rather than blank the banner.
  const highlights = inFamily.some((h) => h.fromCents !== null)
    ? inFamily.filter((h) => h.fromCents !== null)
    : inFamily;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = highlights.length;
  const badges = useBadges(highlights);
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
  // leave the strip parked past its own end.
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
    return <Skeleton className="h-[140px]" />;
  }
  if (count === 0) return null;

  return (
    <>
      {/*
        A carousel earns its place on a phone, where one card is all that
        fits. On a desktop it was one rotating card in a page of empty space,
        then four identical orange cards in a row that read as one strip. Now
        one big card for the category with a reason to look today, and the
        rest smaller beside it, each in its own colour. The carousel below
        keeps the phones.
      */}
      {count > 1 && <DesktopBento items={highlights} badges={badges} />}
    <section
      aria-roledescription="carousel"
      aria-label="Browse by category"
      className={cn("relative", count > 1 && "md:hidden")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Arrows used to float over the slide for desktop; the desktop now
          gets the grid above, so the swipe is the only gesture left and the
          buttons would never be seen. */}
      <div
        className="relative overflow-hidden rounded-radius-md"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Peek, not dots. The design keeps ~8px of the next card visible at
            each edge — that sliver is the affordance that says "there is more
            here", and it does it without a row of controls under the banner. */}
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(calc(-${index} * (100% - 16px)))` }}
        >
          {highlights.map((h) => (
            <div key={h.key} className="w-[calc(100%-16px)] shrink-0 pr-2">
              <Slide item={h} badge={badges.get(h.key)} />
            </div>
          ))}
        </div>
      </div>

    </section>
    </>
  );
}

/**
 * Desktop: a bento block two cards tall. The feature card takes the left; the
 * others fill a two-row grid on the right, two across on a laptop, scrolled
 * by an arrow when there are more than fit.
 *
 * The feature is the first category with a live deal, else the first new
 * one, else simply the first — so it changes when there is news and stays
 * put when there isn't.
 */
function DesktopBento({ items, badges }: { items: CategoryHighlight[]; badges: Map<string, CardBadge> }) {
  const feature =
    items.find((h) => badges.get(h.key)?.deal) ??
    items.find((h) => badges.has(h.key)) ??
    items[0];
  const rest = items.filter((h) => h !== feature);

  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, rest.length]);
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth + 8), behavior: "smooth" });

  return (
    <section
      aria-label="Browse by category"
      className="hidden h-[288px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 md:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <FeatureCard item={feature} badge={badges.get(feature.key)} />
      <div className="relative min-w-0">
        <div
          ref={ref}
          onScroll={measure}
          className={cn(
            "grid h-full snap-x snap-mandatory grid-flow-col grid-rows-2 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "auto-cols-[100%] lg:auto-cols-[calc((100%-8px)/2)]",
            // One card left over fills the column rather than leaving a hole.
            rest.length === 1 && "grid-rows-1",
          )}
        >
          {rest.map((h) => (
            <div key={h.key} className="min-h-0 snap-start">
              <Slide item={h} badge={badges.get(h.key)} className="h-full" />
            </div>
          ))}
        </div>
        {!edges.start && <RowArrow dir={-1} onClick={() => page(-1)} />}
        {!edges.end && <RowArrow dir={1} onClick={() => page(1)} />}
      </div>
    </section>
  );
}

function RowArrow({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? "More categories" : "Previous categories"}
      className={cn(
        "absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground shadow-figma transition-colors hover:bg-muted",
        dir === 1 ? "-right-3" : "-left-3",
      )}
    >
      {dir === 1 ? <ChevronRight className="h-6 w-6" /> : <ChevronLeft className="h-6 w-6" />}
    </button>
  );
}
