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

const ROTATE_MS = 6000;

function Slide({ item }: { item: CategoryHighlight }) {
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      className="group relative flex h-[168px] w-full shrink-0 items-end overflow-hidden rounded-3xl sm:h-[200px]"
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        // No photo for this category yet — the archetype's own colour stands in
        // so the banner keeps one design instead of two. An admin's cover photo
        // in /admin/services/categories replaces it.
        <div className={cn("absolute inset-0", item.archetype?.accent ?? "bg-primary")} />
      )}

      {/* Text is white on whatever photo gets uploaded, so the scrim is not
          optional. Weighted to the bottom, where the words are, so the top of
          the picture stays a picture. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />

      {/* Wider padding from md up: the carousel's arrows float over the slide
          and were clipping the first letters of the eyebrow. */}
      <div className="relative w-full px-5 pb-5 sm:px-8 sm:pb-7 md:px-16">
        {item.archetype && (
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
            {item.archetype.label}
          </p>
        )}
        <h3 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
          {item.label}
        </h3>
        {item.fromCents !== null ? (
          <p className="mt-1 flex items-baseline gap-1.5 text-white">
            <span className="text-sm text-white/70">from</span>
            <span className="text-2xl font-black tabular-nums sm:text-3xl">{formatUSD(item.fromCents)}</span>
            {item.unit && <span className="text-sm text-white/70">{item.unit}</span>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-white/70">Coming soon</p>
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
    return <div className="h-[168px] animate-pulse rounded-3xl bg-muted/40 sm:h-[200px]" />;
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
        className="relative overflow-hidden rounded-3xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {highlights.map((h) => (
            <div key={h.key} className="w-full shrink-0">
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

      {count > 1 && (
        <>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {highlights.map((h, i) => (
              <button
                key={h.key}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${h.label}`}
                aria-current={i === index || undefined}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
