import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCategoryHighlights, type CategoryHighlight } from "@/hooks/useCategoryHighlights";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/patterns/Skeleton";
import { CategoryBannerArt, hasCategoryBannerArt } from "@/components/discovery/categoryBannerArt";

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
 * Each category has its own drawing (categoryBannerArt). A picture an admin
 * sets on the category replaces it; a photo merely borrowed from a provider
 * does not, because that made some cards a stranger's breakfast and others a
 * drawing. A category with neither falls back to a borrowed photo or the icon.
 */

const ROTATE_MS = 3000;

function Slide({ item }: { item: CategoryHighlight }) {
  /**
   * The photo has to PROVE it renders before anything is drawn for it. The
   * scrim used to key off the URL being set, so a broken link produced the
   * worst of both designs: no picture, but the black gradient still poured
   * over the orange card and turned its lower half to mud. Now a URL is just a
   * candidate — the scrim waits for onLoad, and onError falls back to the
   * imageless card as if no photo was ever set.
   */
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawn = hasCategoryBannerArt(item.key);
  const hasImage = !!item.imageUrl && !failed && (item.imageIsChosen || !drawn);
  const showPhoto = hasImage && loaded;
  const Icon = item.archetype?.Icon;

  return (
    // 140px tall, 16px radius, orange when there is no photo — the design's
    // own promo card. The service sits above the category in 12px regular and
    // the category itself is 16px semibold: the small line is context, the big
    // one is the thing.
    <Link
      to={item.href}
      aria-label={item.label}
      className="group relative flex h-[140px] w-full shrink-0 flex-col justify-end overflow-hidden rounded-radius-md bg-primary p-4"
    >
      {hasImage && (
        <img
          src={item.imageUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-105",
            showPhoto ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {showPhoto && (
        // White text on whatever gets uploaded, so the scrim is not
        // optional — weighted to the bottom where the words are.
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      )}
      {!showPhoto && drawn && (
        <CategoryBannerArt
          categoryKey={item.key}
          className="absolute inset-y-0 right-0 h-full w-[180px] origin-bottom-right transition-transform duration-300 group-hover:scale-105"
        />
      )}
      {!showPhoto && !drawn && Icon && (
        // The imageless card carries the service's own mark, so it reads as a
        // designed tile rather than a rectangle waiting for a photo.
        <Icon aria-hidden className="absolute right-4 top-4 h-14 w-14 text-primary-foreground/25" strokeWidth={1.5} />
      )}

      <div className="relative flex flex-col gap-0.5">
        {item.archetype && (
          <p className={cn("text-meta", showPhoto ? "text-white/80" : "text-primary-foreground/70")}>
            {item.archetype.label}
          </p>
        )}
        <p className={cn(
          "text-title font-semibold",
          showPhoto ? "text-white" : "text-primary-foreground",
        )}>
          {item.label}
        </p>
        {item.fromCents !== null && (
          <p className={cn(
            "text-meta",
            showPhoto ? "text-white/80" : "text-primary-foreground/70",
          )}>
            from {formatUSD(item.fromCents)}{item.unit ? ` ${item.unit}` : ""}
          </p>
        )}
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
        fits. On a desktop it was one rotating card in a page of empty space —
        hiding the other categories behind a timer while showing nothing else.
        Same slides in ONE row (two rows of banners took the whole first
        screen): four across, the rest a scroll or an arrow away. The
        carousel below keeps the phones.
      */}
      {count > 1 && <DesktopRow items={highlights} />}
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
              <Slide item={h} />
            </div>
          ))}
        </div>
      </div>

    </section>
    </>
  );
}

/** Desktop: one row of slides, four across (three on a tablet), scrolled by arrows. */
function DesktopRow({ items }: { items: CategoryHighlight[] }) {
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
  }, [measure, items.length]);
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth, behavior: "smooth" });

  return (
    <section aria-label="Browse by category" className="relative hidden md:block">
      <div
        ref={ref}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((h) => (
          <div key={h.key} className="w-[calc((100%-16px)/3)] shrink-0 snap-start lg:w-[calc((100%-24px)/4)]">
            <Slide item={h} />
          </div>
        ))}
      </div>
      {!edges.start && <RowArrow dir={-1} onClick={() => page(-1)} />}
      {!edges.end && <RowArrow dir={1} onClick={() => page(1)} />}
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
