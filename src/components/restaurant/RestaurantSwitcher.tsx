import { Building2, ChevronDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useRestaurant } from "@/contexts/RestaurantContext";

const RestaurantSwitcher = () => {
  const { 
    activeRestaurant, 
    restaurants, 
    isLoading, 
    switchRestaurant,
    goToRestaurantList 
  } = useRestaurant();

  if (isLoading) {
    return (
      <Button variant="rail" size="chip" disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </Button>
    );
  }

  if (restaurants.length === 0) {
    return null;
  }

  // If only one restaurant, show a simple badge instead of dropdown
  if (restaurants.length === 1 && activeRestaurant) {
    return (
      <div className="flex h-11 items-center gap-space-2 rounded-radius-md border border-[hsl(var(--app-divider))] bg-background px-space-4 text-sm font-bold text-foreground">
        {activeRestaurant.logo_url ? (
          <img 
            src={activeRestaurant.logo_url} 
            alt="" 
            className="w-5 h-5 rounded-radius-full object-cover" 
          />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="truncate">
          {activeRestaurant.name}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="rail" size="chip" className="max-w-[220px] border border-[hsl(var(--app-divider))] bg-background">
          {activeRestaurant?.logo_url ? (
            <img 
              src={activeRestaurant.logo_url} 
              alt="" 
              className="w-5 h-5 rounded-radius-full object-cover" 
            />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          <span className="truncate">
            {activeRestaurant?.name || "Select Restaurant"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch Restaurant
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {restaurants.map((restaurant) => (
          <DropdownMenuItem
            key={restaurant.id}
            onClick={() => switchRestaurant(restaurant.id)}
            className="flex items-center gap-space-2 cursor-pointer"
          >
            {restaurant.logo_url ? (
              <img 
                src={restaurant.logo_url} 
                alt="" 
                className="w-6 h-6 rounded-radius-full object-cover" 
              />
            ) : (
              <div className="w-6 h-6 rounded-radius-full bg-muted flex items-center justify-center">
                <Building2 className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            <span className="flex-1 truncate">{restaurant.name}</span>
            {restaurant.id === activeRestaurant?.id && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
            {!restaurant.is_active && (
              <Badge variant="secondary" className="text-[10px] px-space-1 py-0">
                Inactive
              </Badge>
            )}
          </DropdownMenuItem>
        ))}
        {restaurants.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={goToRestaurantList}
              className="text-muted-foreground"
            >
              View All Restaurants
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RestaurantSwitcher;
