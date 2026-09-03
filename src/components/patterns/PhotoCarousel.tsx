import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The photo band at the top of a detail page.
 *
 * One picture draws exactly as the single hero always did — same height, same
 * bottom corners — so nothing changes for the pages that only ever have one.
 * Several become a swipeable strip, which is what a gallery is for: a car with
 * four photos was showing one big one and then three loose squares further
 * down the page, so the pictures of the same object were in two places and
 * neither was the whole set.
 *
 * Scroll-snap rather than a carousel library: the browser already does
 * momentum, rubber-banding and touch on every platform, and a slider is not
 * worth 12kB of someone else's gesture handling.
 */
export function PhotoCarousel({
  photos,
  alt = "",
  className,
  fallback,
}: {
  photos: string[];
  alt?: string;
  className?: string;
  /** Drawn instead of the band when there is no photo at all. */
  fallback?: React.ReactNode;
}) {
  const shots = photos.filter((u) => typeof u === "string" && u.trim().length > 0);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (shots.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  // Which slide is under the viewport now — read off the scroll position so a
  // swipe and a dot tap agree without either owning the state.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(Math.max(0, Math.min(shots.length - 1, i)));
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={cn("relative h-[280px] w-full overflow-hidden rounded-b-radius-lg bg-muted shadow-figma", className)}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className={cn(
          "flex h-full w-full snap-x snap-mandatory overflow-x-auto",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {shots.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={i === 0 ? alt : ""}
            loading={i === 0 ? "eager" : "lazy"}
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {/* The back arrow would otherwise vanish into a bright sky. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent md:hidden" />

      {shots.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5">
          {shots.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1} of ${shots.length}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
