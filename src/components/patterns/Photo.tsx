import { useEffect, useState, type ComponentType } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A photo, or the platform's one standard placeholder when there is none.
 *
 * Every screen used to decide on its own: some left an empty grey box, some
 * collapsed the slot (so cards of one list had different shapes), some drew a
 * glyph, and a broken URL showed the browser's torn-image icon. Now a missing
 * OR failed picture is the same thing everywhere — the inset grey with one
 * quiet icon saying what kind of thing belongs there (a car, a business, a
 * plan). Fill the parent: the caller's frame owns the size and the radius.
 */
export function Photo({
  src, alt = "", className, icon: Icon = ImageIcon, iconClassName, loading = "lazy", label,
}: {
  src?: string | null;
  alt?: string;
  /** Applied to the img and to the placeholder alike — position and size. */
  className?: string;
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  loading?: "lazy" | "eager";
  /** Initials or a short word instead of the icon (a business without a logo). */
  label?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);

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
    // The placeholder stays under the picture until it has arrived: a slow
    // photo (a large PNG from a provider's own site) used to leave an empty
    // dark slot with a heart floating in it, which read as "no photo".
    // Only a picture laid over its frame can have the placeholder under it
    // without moving anything; an inline one just keeps the inset grey.
    const layered = /\babsolute\b/.test(className ?? "");
    return (
      <>
        {layered && !loaded && placeholder}
        <img
          src={src}
          alt={alt}
          loading={loading}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover", !loaded && (layered ? "opacity-0" : "bg-inset"), className)}
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
