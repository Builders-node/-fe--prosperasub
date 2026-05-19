import { Link } from "react-router-dom";
import { Bike, Heart, Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { RestaurantLogoTile } from "@/components/RestaurantLogoTile";

interface PromoSliderItem {
  id: string;
  name: string;
  href: string;
  imageUrl?: string | null;
  imageVariant?: "photo" | "restaurantLogo";
  meta?: string | null;
  chips?: string[];
  isFavorite?: boolean;
}

interface PromoSliderProps {
  title?: string;
  items: PromoSliderItem[];
  isLoading?: boolean;
  onFavoriteToggle?: (id: string) => void;
}

const ratings = ["4.4 (228)", "4.0 (231)", "4.6 (1900+)", "4.1 (293)", "4.8 (520+)"];

export function PromoSlider({
  title,
  items,
  isLoading = false,
  onFavoriteToggle,
}: PromoSliderProps) {
  const { t } = useI18n();
  const sectionTitle = title ?? t("home.promoTitle");

  if (isLoading) {
    return (
      <section className="py-space-4 md:py-space-5">
        <div className="market-content">
          <div className="mb-space-4 h-8 w-64 rounded-radius-md bg-muted" />
          <div className="grid gap-space-8 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-[2.55/1.25] rounded-radius-lg bg-muted" />
                <div className="mt-space-3 h-5 w-2/3 rounded bg-muted" />
                <div className="mt-space-2 h-4 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return null;
  }

  return (
    <section className="py-space-4 md:py-space-5">
      <div className="market-content">
        <div className="mb-space-4 flex items-center justify-between gap-space-4">
          <h2 className="text-section-title">{sectionTitle}</h2>
          <Button asChild variant="nav" size="default">
            <Link to="/restaurants">{t("common.all")}</Link>
          </Button>
        </div>

        <Carousel
          opts={{
            align: "start",
            containScroll: "trimSnaps",
            dragFree: true,
          }}
          className="promo-slider"
        >
          <CarouselContent className="-ml-space-8">
            {items.map((item, index) => (
              <CarouselItem
                key={item.id}
                className="pl-space-8 basis-[86%] sm:basis-[48%] lg:basis-1/4"
              >
                <Link to={item.href} className="group block">
                  <div className="relative overflow-hidden rounded-radius-lg">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="aspect-[2.55/1.25] w-full rounded-radius-lg object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                      />
                    ) : item.imageVariant === "restaurantLogo" ? (
                      <RestaurantLogoTile name={item.name} className="aspect-[2.55/1.25] group-hover:scale-[1.015]" />
                    ) : (
                      <img
                        src="/placeholder.svg"
                        alt={item.name}
                        className="aspect-[2.55/1.25] w-full rounded-radius-lg object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                      />
                    )}
                    <Button
                      type="button"
                      variant="favorite"
                      size="icon"
                      data-state={item.isFavorite ? "active" : "inactive"}
                      onClick={(event) => {
                        event.preventDefault();
                        onFavoriteToggle?.(item.id);
                      }}
                      className="absolute right-space-4 top-space-4"
                      aria-label={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Heart className={cn("h-7 w-7 stroke-[2.6]", item.isFavorite && "fill-current")} />
                    </Button>
                  </div>

                  <div className="mt-space-3 px-space-3">
                    <div className="flex items-start justify-between gap-space-4">
                      <h3 className="line-clamp-1 text-card-title text-foreground">
                        {item.name}
                      </h3>
                      <div className="flex shrink-0 items-center gap-space-1 text-control text-foreground/90">
                        <Star className="h-4 w-4 fill-current" />
                        <span>{ratings[index % ratings.length]}</span>
                      </div>
                    </div>

                    <div className="mt-space-1 flex items-center gap-space-2 text-body text-muted-foreground">
                      <Bike className="h-4 w-4" />
                      <span>{item.meta || "25-35 min"}</span>
                    </div>

                  </div>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="promo-slider-arrow left-0 md:-left-9" />
          <CarouselNext className="promo-slider-arrow right-0 md:-right-9" />
        </Carousel>
      </div>
    </section>
  );
}
