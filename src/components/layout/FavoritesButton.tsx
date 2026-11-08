import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/lib/favorites/useFavorites";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";

/** The header's way into Favourites — beside the cart, with how many are saved. */
export function FavoritesButton({ className }: { className?: string }) {
  const { count } = useFavorites();
  return (
    <Link
      to="/favorites"
      aria-label={`Favourites${count ? ` (${count})` : ""}`}
      className={cn("relative", HEADER_ACTION_CLASS, className)}
    >
      <Heart className={HEADER_ACTION_ICON_CLASS} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
