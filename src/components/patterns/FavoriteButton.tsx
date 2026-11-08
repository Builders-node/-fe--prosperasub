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
  if (!id) return null;
  const saved = isSaved(kind, id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name ?? "this"} from favourites` : `Save ${name ?? "this"} to favourites`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(kind, id, { name, onView: () => navigate("/favorites") });
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-colors",
        variant === "overlay"
          ? "h-8 w-8 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
          : "h-10 w-10 hover:bg-muted",
        className,
      )}
    >
      <Heart
        className={cn(
          variant === "overlay" ? "h-4 w-4" : "h-6 w-6",
          saved && "fill-primary text-primary",
        )}
      />
    </button>
  );
}
