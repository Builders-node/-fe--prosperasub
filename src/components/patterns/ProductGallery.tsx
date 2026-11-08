import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Photo } from "@/components/patterns/Photo";
import { cn } from "@/lib/utils";

/**
 * The desktop product gallery: one big photo with arrows, every photo as a
 * thumbnail under it. The phone keeps the swipeable band (PhotoCarousel);
 * a laptop has the room to show the set, the way a shop does.
 */
export function ProductGallery({ photos, alt = "", className }: { photos: string[]; alt?: string; className?: string }) {
  const shots = photos.filter((u) => typeof u === "string" && u.trim().length > 0);
  const [active, setActive] = useState(0);
  const i = Math.min(active, Math.max(0, shots.length - 1));
  const go = (n: number) => setActive((n + shots.length) % shots.length);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="group relative aspect-[4/3] overflow-hidden rounded-radius-lg bg-muted">
        {shots.length ? (
          <Photo key={shots[i]} src={shots[i]} alt={alt} loading="eager" className="absolute inset-0" />
        ) : (
          <Photo src={undefined} icon={ImageIcon} className="absolute inset-0" />
        )}
        {shots.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => go(i - 1)}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" aria-label="Next photo" onClick={() => go(i + 1)}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100">
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-meta font-semibold tabular-nums text-white backdrop-blur">
              {i + 1} / {shots.length}
            </span>
          </>
        )}
      </div>

      {shots.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {shots.map((src, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Photo ${n + 1} of ${shots.length}`}
              aria-current={n === i}
              onClick={() => setActive(n)}
              className={cn(
                "relative aspect-square overflow-hidden rounded-radius-md bg-muted transition-opacity",
                n === i ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
              )}
            >
              <Photo src={src} loading="lazy" className="absolute inset-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
