import { Link } from "react-router-dom";
import { Heart, Bike, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { RestaurantLogoTile } from "@/components/RestaurantLogoTile";

interface RestaurantCardProps {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  deliveryTime?: string;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  className?: string;
}

export function RestaurantCard({
  id,
  name,
  description,
  logoUrl,
  address,
  deliveryTime = "20-30 min",
  isFavorite = false,
  onFavoriteToggle,
  className,
}: RestaurantCardProps) {
  const { t } = useI18n();

  return (
    <Link to={`/restaurants/${id}`} className={cn("restaurant-card market-card block", className)}>
      <div className="relative overflow-hidden rounded-radius-lg">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="market-card-image"
          />
        ) : (
          <RestaurantLogoTile name={name} className="market-card-image" />
        )}

        <Button
          type="button"
          variant="favorite"
          size="icon"
          data-state={isFavorite ? "active" : "inactive"}
          onClick={(e) => {
            e.preventDefault();
            onFavoriteToggle?.();
          }}
          className="absolute right-space-4 top-space-4"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={cn("w-7 h-7 stroke-[2.6]", isFavorite && "fill-current")} />
        </Button>
      </div>
      
      <div className="market-meta">
        <div className="market-title-row">
          <h3 className="market-title">{name}</h3>
          <div className="market-rating">
            <Star className="h-4 w-4 fill-current" />
            <span>4.8</span>
          </div>
        </div>

        <div className="market-subline">
          <Bike className="h-4 w-4" />
          <span>{deliveryTime}</span>
          {address && <span className="line-clamp-1 text-muted-foreground/80">· {address}</span>}
        </div>

      </div>
    </Link>
  );
}
