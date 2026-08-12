import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCategoryHighlights, type CategoryHighlight } from "@/hooks/useCategoryHighlights";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

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
 * Deliberately not an image banner. Not one category has a picture set today,
 * so a photo-first design would ship six grey boxes; this leans on the
 * archetype's own accent and icon, and uses the image as a backdrop the moment
 * an admin adds one in /admin/services/categories.
 */

const ROTATE_MS = 3000;

function Slide({ item }: { item: CategoryHighlight }) {
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
      {item.imageUrl && (
        <>
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          {/* White text on whatever gets uploaded, so the scrim is not
              optional — weighted to the bottom where the words are. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </>
      )}

      <div className="relative flex flex-col gap-0.5">
        {item.archetype && (
          <p className={cn("text-[12px] tracking-[-0.24px]", item.imageUrl ? "text-white/80" : "text-primary-foreground/70")}>
            {item.archetype.label}
          </p>
        )}
        <p className={cn(
          "text-[16px] font-semibold tracking-[-0.32px]",
          item.imageUrl ? "text-white" : "text-primary-foreground",
        )}>
          {item.label}
        </p>
        {item.fromCents !== null && (
          <p className={cn(
            "text-[12px] tracking-[-0.24px]",
            item.imageUrl ? "text-white/80" : "text-primary-foreground/70",
          )}>
            from {formatUSD(item.fromCents)}{item.unit ? ` ${item.unit}` : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

export function CategoryCarousel() {
  const { highlights, isLoading } = useCategoryHighlights();
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
    return <div className="h-[140px] animate-pulse rounded-radius-md bg-muted/40" />;
  }
  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Browse by category"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* The arrows are positioned against THIS box, not the section, so the
          dots underneath don't drag them off centre. */}
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

        {count > 1 && (
          <>
            {/* Arrows are desktop-only: on a phone the swipe is the gesture and
                a tap target floating over the slide would fight the link. */}
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous category"
              className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/55 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next category"
              className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/55 md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

    </section>
  );
}
