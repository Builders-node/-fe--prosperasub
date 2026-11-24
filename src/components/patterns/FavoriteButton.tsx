import { useState } from "react";
import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useFavorites, type FavoriteKind } from "@/lib/favorites/useFavorites";

/**
 * The heart. Two shapes:
 *
 *  - `overlay`: on a card's photo — a small dark disc so it reads on any
 *    picture. The click never opens the card underneath.
 *  - `header`: beside Share in a detail page's bar; no colour of its own,
 *    like Share, because over a hero photo it must stay white.
 *
 * Filled amber when saved — the one place the accent marks a state, because
 * a heart is the universal "you kept this".
 */
export function FavoriteButton({
  kind, id, name, variant = "header", className,
}: {
  kind: FavoriteKind;
  id: string | null | undefined;
  /** For the analytics event and the label. */
  name?: string;
  variant?: "overlay" | "header";
  className?: string;
}) {
  const { isSaved, toggle } = useFavorites();
  const navigate = useNavigate();
  // Only a heart the person just tapped pops — not every saved heart on load.
  const [tapped, setTapped] = useState(false);
  if (!id) return null;
  const saved = isSaved(kind, id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      data-tooltip={saved ? "Remove from favorites" : "Save to favorites"}
      aria-label={saved ? `Remove ${name ?? "this"} from favourites` : `Save ${name ?? "this"} to favourites`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setTapped(true);
        toggle(kind, id, { name, onView: () => navigate("/favorites") });
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "press flex shrink-0 items-center justify-center rounded-full transition-colors",
        variant === "overlay"
          ? "h-8 w-8 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
          : "h-10 w-10 hover:bg-muted",
        className,
      )}
    >
      <Heart
        // Remounts on each change so the pop replays on every save.
        key={saved ? "on" : "off"}
        className={cn(
          variant === "overlay" ? "h-4 w-4" : "h-6 w-6",
          "transition-colors duration-fast",
          saved && "fill-primary text-primary",
          saved && tapped && "animate-pop",
        )}
      />
    </button>
  );
}
