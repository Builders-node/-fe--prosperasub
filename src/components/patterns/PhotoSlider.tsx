import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Photo } from "@/components/patterns/Photo";
import { cn } from "@/lib/utils";

/**
 * Every photo of a product inside a card's picture slot.
 *
 * Cards used to take the first photo and drop the rest, so a plan with four
 * pictures looked like it had one. Swipe on a phone (scroll-snap — the browser
 * does the momentum), arrows on hover with a mouse, dots for where you are.
 *
 * The card around it is itself a link or a button: the arrows and dots stop
 * the click from reaching it, and a swipe never fires a click in the first
 * place. One photo (or none) renders exactly the plain picture it replaced.
 */
export function PhotoSlider({ photos, className, icon }: {
  photos: Array<string | null | undefined>;
  className?: string;
  /** The placeholder's icon when there is no photo at all. */
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const shots = photos.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (shots.length <= 1) {
    return <div className={cn("relative overflow-hidden", className)}><Photo src={shots[0]} icon={icon} className="absolute inset-0" /></div>;
  }

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(Math.max(0, Math.min(shots.length - 1, i)));
  };
  const go = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = track.current;
    if (!el) return;
    const next = (i + shots.length) % shots.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={cn("group/slider relative overflow-hidden", className)}>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shots.map((src, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-center">
            <Photo src={src} loading={i === 0 ? "eager" : "lazy"} className="absolute inset-0" />
          </div>
        ))}
      </div>

      {/* Arrows: a mouse can't swipe. Hidden on touch screens, where it can. */}
      <button
        type="button" aria-label="Previous photo" onClick={go(active - 1)}
        className="absolute left-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity group-hover/slider:opacity-100 [@media(hover:hover)]:flex"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button" aria-label="Next photo" onClick={go(active + 1)}
        className="absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity group-hover/slider:opacity-100 [@media(hover:hover)]:flex"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
        {shots.map((_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-all", i === active ? "w-3 bg-white" : "w-1.5 bg-white/60")} />
        ))}
      </div>
    </div>
  );
}
