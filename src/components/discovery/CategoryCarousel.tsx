import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCategoryHighlights, type CategoryHighlight } from "@/hooks/useCategoryHighlights";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/patterns/Skeleton";
import { CategoryBannerArt } from "@/components/discovery/categoryBannerArt";
import { categoryTone } from "@/components/discovery/categoryTones";
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

/** A word above the name, in colour — not a sticker. */
function Badge({ badge }: { badge?: CardBadge }) {
  if (!badge) return null;
  return (
    <span className={cn("truncate text-meta font-semibold", badge.deal ? "text-destructive" : "text-primary")}>
      {badge.text}
    </span>
  );
}

function Price({ item }: { item: CategoryHighlight }) {
  if (item.fromCents === null) return null;
  return (
    <p className="text-meta text-muted-foreground">
      from <span className="font-semibold tabular-nums text-foreground">{formatUSD(item.fromCents)}</span>
      {item.unit ? ` ${item.unit}` : ""}
    </p>
  );
}

/**
 * The drawing on its own tinted tile. The card itself is the app's plain
 * surface, so the colour is a small accent per category rather than a whole
 * wall of it — and the words, in the theme's own ink, sit beside the tile,
 * never on top of the drawing.
 */
function ArtTile({ item, className }: { item: CategoryHighlight; className?: string }) {
  const tone = categoryTone(item.key);
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden rounded-radius-md", className)}
      style={{ backgroundColor: tone.bg }}
    >
      <CategoryBannerArt
        categoryKey={item.key}
        icon={item.archetype?.Icon}
        glow={tone.glow}
        className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.04]"
      />
    </span>
  );
}

/**
 * One category card: words on the left, the drawing's tile on the right.
 * item.imageUrl is deliberately NOT used here (see the note at the top of
 * the file); the catalog sidebar still shows it.
 */
function Slide({ item, badge, className }: { item: CategoryHighlight; badge?: CardBadge; className?: string }) {
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      className={cn(
        "group flex h-[140px] w-full shrink-0 gap-3 overflow-hidden rounded-radius-md bg-background p-2 transition-colors hover:bg-muted",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-0.5 py-2 pl-2">
        <span className="mb-auto"><Badge badge={badge} /></span>
        {item.archetype && <p className="truncate text-meta text-muted-foreground">{item.archetype.label}</p>}
        <p className="line-clamp-2 text-title font-semibold leading-tight text-foreground">{item.label}</p>
        <Price item={item} />
      </div>
      <ArtTile item={item} className="h-full w-[45%] max-w-[180px]" />
    </Link>
  );
}

/**
 * The big card of the desktop block: the one category with a reason to look
 * today (a deal, else something new). Same card as the others, just larger —
 * no button, the whole card is the link.
 */
function FeatureCard({ item, badge }: { item: CategoryHighlight; badge?: CardBadge }) {
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      className="group flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-radius-md bg-background p-2 transition-colors hover:bg-muted"
    >
      <ArtTile item={item} className="min-h-0 w-full flex-1" />
      <div className="flex items-end justify-between gap-3 px-2 pb-2">
        <div className="min-w-0">
          {item.archetype && <p className="truncate text-meta text-muted-foreground">{item.archetype.label}</p>}
          <p className="truncate text-heading font-semibold text-foreground">{item.label}</p>
          <Price item={item} />
        </div>
        <Badge badge={badge} />
      </div>
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
      className="hidden h-[288px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 md:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
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
