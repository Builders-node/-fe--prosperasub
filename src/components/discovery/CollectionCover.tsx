import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { Photo } from "@/components/patterns/Photo";
import { planPhotos, type HomePlan } from "@/components/discovery/homePlans";
import { cn } from "@/lib/utils";
import { offersLabel } from "@/lib/collections";

/**
 * A collection's picture: the cover the admin chose, or — until one is chosen
 * — a mosaic of the first offers' photos, so a new collection never shows an
 * empty grey box.
 */
export function CollectionCover({
  coverUrl, plans, className, priority = false,
}: {
  coverUrl: string | null;
  plans: HomePlan[];
  className?: string;
  priority?: boolean;
}) {
  if (coverUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-inset", className)}>
        <Photo src={coverUrl} icon={LayoutGrid} priority={priority} loading={priority ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  }
  const photos = plans.map((p) => planPhotos(p)[0]).filter((u): u is string => !!u).slice(0, 4);
  if (photos.length === 0) {
    return (
      <div className={cn("grid place-items-center bg-inset", className)}>
        <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
      </div>
    );
  }
  const cells = photos.length >= 4 ? photos : photos.length >= 2 ? photos.slice(0, 2) : photos;
  return (
    <div
      className={cn(
        "grid gap-0.5 overflow-hidden bg-inset",
        cells.length === 4 ? "grid-cols-2 grid-rows-2" : cells.length === 2 ? "grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {cells.map((src, i) => (
        <div key={i} className="relative min-h-0 overflow-hidden">
          <Photo src={src} icon={LayoutGrid} priority={priority && i === 0} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

/** One collection on /collections and under "More collections". */
export function CollectionCard({
  title, subtitle, href, coverUrl, plans,
}: {
  title: string; subtitle?: string | null; href: string; coverUrl: string | null; plans: HomePlan[];
}) {
  return (
    <Link to={href} className="group flex flex-col gap-2 transition-transform active:scale-[0.98]">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-radius-lg">
        <CollectionCover coverUrl={coverUrl} plans={plans} className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-meta font-bold text-white backdrop-blur">
          {offersLabel(plans.length)}
        </span>
      </div>
      <div className="px-1">
        <p className="line-clamp-1 text-title font-semibold text-foreground">{title}</p>
        {subtitle && <p className="line-clamp-1 text-meta text-muted-foreground">{subtitle}</p>}
      </div>
    </Link>
  );
}
