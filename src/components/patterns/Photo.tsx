import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isResizable, sizedImageUrl } from "@/lib/images";

/**
 * A photo, or the platform's one standard placeholder when there is none.
 *
 * Every screen used to decide on its own: some left an empty grey box, some
 * collapsed the slot (so cards of one list had different shapes), some drew a
 * glyph, and a broken URL showed the browser's torn-image icon. Now a missing
 * OR failed picture is the same thing everywhere — the inset grey with one
 * quiet icon saying what kind of thing belongs there (a car, a business, a
 * plan). Fill the parent: the caller's frame owns the size and the radius.
 *
 * It also asks for the picture at the size it is drawn. The frame is measured
 * before the first paint and a Storage photo is requested at that size (see
 * lib/images) instead of as the 2–3 MP original — the home page went from
 * ≈5 MB of photos to a few hundred KB. If the resized copy fails for any
 * reason, the original is tried before giving up.
 */
export function Photo({
  src, alt = "", className, icon: Icon = ImageIcon, iconClassName, loading = "lazy", priority = false, label,
}: {
  src?: string | null;
  alt?: string;
  /** Applied to the img and to the placeholder alike — position and size. */
  className?: string;
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  loading?: "lazy" | "eager";
  /** The picture the screen is about (the first one on a detail page): fetched first. */
  priority?: boolean;
  /** Initials or a short word instead of the icon (a business without a logo). */
  label?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Already in the cache when it mounted: show it at once, no fade.
  const [instant, setInstant] = useState(false);
  // The resized copy failed — fall back to the original address.
  const [useOriginal, setUseOriginal] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => { setFailed(false); setLoaded(false); setInstant(false); setUseOriginal(false); }, [src]);

  const resizable = !useOriginal && isResizable(src);

  // Measure the frame before paint; keep watching only until it has a size
  // (a slide that starts hidden reports 0×0) or grows past what we fetched.
  useLayoutEffect(() => {
    const el = img.current;
    if (!resizable || !el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1) return;
      setBox((prev) => (prev && prev.w >= r.width - 1 ? prev : { w: r.width, h: r.height }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [resizable, src]);

  const url = !src ? null : resizable ? (box ? sizedImageUrl(src, box.w, box.h) : null) : src;

  useLayoutEffect(() => {
    const el = img.current;
    if (url && el?.complete && el.naturalWidth > 0) { setLoaded(true); setInstant(true); }
  }, [url]);

  const placeholder = (
    <div
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      className={cn("flex h-full w-full items-center justify-center bg-inset text-muted-foreground/60", className)}
    >
      {label
        ? <span className="select-none text-title font-semibold text-muted-foreground">{label}</span>
        : <Icon className={cn("h-1/3 max-h-10 min-h-4 w-1/3 max-w-10 min-w-4 [stroke-width:1.5]", iconClassName)} />}
    </div>
  );

  if (src && !failed) {
    // While the picture is on its way the frame shimmers — the shape of a
    // photo arriving, not the "no photo" icon — then the photo fades in over
    // it. Only a picture laid over its frame can have something under it
    // without moving anything; an inline one just keeps the inset grey.
    const layered = /\babsolute\b/.test(className ?? "");
    return (
      <>
        {layered && !loaded && (
          <div aria-hidden className={cn("skeleton-shimmer h-full w-full bg-inset", className)} />
        )}
        <img
          ref={img}
          src={url ?? undefined}
          alt={alt}
          loading={priority ? "eager" : loading}
          decoding="async"
          {...(priority ? { fetchpriority: "high" } : {})}
          onLoad={() => setLoaded(true)}
          onError={() => (resizable ? setUseOriginal(true) : setFailed(true))}
          className={cn(
            "h-full w-full object-cover",
            !instant && "transition-[opacity,transform] duration-base ease-out-expo motion-reduce:transition-none",
            !loaded && (layered ? "scale-[1.02] opacity-0" : "bg-inset"),
            className,
          )}
        />
      </>
    );
  }
  return placeholder;
}

/** Two letters for a business or person without a picture. */
export function initialsOf(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}
