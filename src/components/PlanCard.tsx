import { Link } from "react-router-dom";
import { Heart, Bike, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/pricing";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

interface PlanCardProps {
  id: string;
  name: string;
  description?: string | null;
  pricePerWeekSats: number; // Now represents USD cents
  mealTime?: string;
  restaurantName?: string;
  imageUrl?: string | null;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  className?: string;
}

export function PlanCard({
  id,
  name,
  description,
  pricePerWeekSats,
  mealTime = "Lunch",
  restaurantName,
  imageUrl,
  isFavorite = false,
  onFavoriteToggle,
  className,
}: PlanCardProps) {
  const { t } = useI18n();

  return (
    <Link to={`/plan/${id}`} className={cn("food-card market-card block", className)}>
      <div className="relative overflow-hidden rounded-radius-lg">
        <img
          src={imageUrl || "/placeholder.svg"}
          alt={name}
          className="market-card-image"
        />

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
          <h3 className="market-title">{restaurantName || name}</h3>
          <div className="market-rating">
            <Star className="h-4 w-4 fill-current" />
            <span>4.7</span>
          </div>
        </div>

        <div className="market-subline">
          <Bike className="h-4 w-4" />
          <span>{mealTime || "25-35 min"}</span>
          <span>· {formatUSD(pricePerWeekSats)} / {t("common.week")}</span>
        </div>

      </div>
    </Link>
  );
}
