import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryChips } from "@/components/CategoryChips";
import { CutoffIndicator, MealDeadlineBanner } from "@/components/CutoffIndicator";
import { EmptyState } from "@/components/EmptyState";
import { MySubscriptionCard } from "@/components/MySubscriptionCard";
import { PlanCard } from "@/components/PlanCard";
import { PlanFilters, type PlanFiltersState } from "@/components/PlanFilters";
import { PromoSlider } from "@/components/PromoSlider";
import { RestaurantCard } from "@/components/RestaurantCard";
import { RestaurantLogoTile } from "@/components/RestaurantLogoTile";
import foodOne from "@/assets/food-1.jpg";
import foodTwo from "@/assets/food-2.jpg";

const meta = {
  title: "App Components/Marketplace",
  parameters: {
    docs: {
      description: {
        component: "Customer-facing marketplace cards, sliders, filters, empty states, and subscription summaries.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleRestaurants = [
  { id: "prospera-cafe", name: "Prospera Cafe", address: "Prospera Village", deliveryTime: "20-30 min" },
  { id: "darien-kitchen", name: "Darien Kitchen", address: "Roatan", deliveryTime: "20-30 min" },
  { id: "lotos-grill", name: "Lotos Grill", address: "Prospera Village", deliveryTime: "20-30 min" },
  { id: "island-bistro", name: "Island Bistro", address: "Prospera Village", deliveryTime: "25-35 min" },
];

const samplePlans = [
  { id: "weekly-lunch", name: "Weekly Lunch", restaurantName: "Prospera Cafe", pricePerWeekSats: 7500, mealTime: "13:00:00" },
  { id: "vegetarian-weekly", name: "Vegetarian Weekly", restaurantName: "Darien Kitchen", pricePerWeekSats: 6800, mealTime: "12:30:00" },
  { id: "lotos-grill", name: "Lotos Grill", restaurantName: "Lotos Grill", pricePerWeekSats: 4800, mealTime: "12:00:00" },
  { id: "standard-weekly", name: "Standard Weekly", restaurantName: "Island Bistro", pricePerWeekSats: 9900, mealTime: "12:30:00" },
];

export const RestaurantCards: Story = {
  render: () => (
    <div className="grid gap-space-8 md:grid-cols-2 xl:grid-cols-4">
      {sampleRestaurants.map((restaurant, index) => (
        <RestaurantCard key={restaurant.id} {...restaurant} isFavorite={index === 1} />
      ))}
    </div>
  ),
};

export const PlanCards: Story = {
  render: () => (
    <div className="grid gap-space-8 md:grid-cols-2 xl:grid-cols-4">
      {samplePlans.map((plan, index) => (
        <PlanCard
          key={plan.id}
          {...plan}
          description="Subscription plan"
          imageUrl={index % 2 === 0 ? foodOne : foodTwo}
          isFavorite={index === 0}
        />
      ))}
    </div>
  ),
};

export const PromoAndCategoryRails: Story = {
  render: function PromoAndCategoryRailsStory() {
    const [selected, setSelected] = useState("all");
    const [filters, setFilters] = useState<PlanFiltersState>({
      supportsDelivery: null,
      mealTime: null,
      menuCategory: null,
      maxPricePerWeek: null,
    });

    return (
      <div className="space-y-space-8">
        <CategoryChips
          selected={selected}
          onSelect={setSelected}
          rightContent={<PlanFilters filters={filters} onFiltersChange={setFilters} />}
        />
        <PromoSlider
          title="Restaurants"
          items={sampleRestaurants.map((restaurant) => ({
            id: restaurant.id,
            name: restaurant.name,
            href: `/restaurants/${restaurant.id}`,
            imageVariant: "restaurantLogo" as const,
            meta: `${restaurant.deliveryTime} · ${restaurant.address}`,
            chips: ["Free delivery"],
          }))}
        />
      </div>
    );
  },
};

export const LogoTiles: Story = {
  render: () => (
    <div className="grid gap-space-5 md:grid-cols-4">
      {sampleRestaurants.map((restaurant) => (
        <RestaurantLogoTile key={restaurant.id} name={restaurant.name} className="aspect-[2.55/1.25]" />
      ))}
    </div>
  ),
};

export const EmptyStates: Story = {
  render: () => (
    <div className="grid gap-space-6 lg:grid-cols-2">
      <EmptyState
        title="No restaurants found"
        description="Check back soon for new restaurant partners."
        action={<Button>Browse restaurants</Button>}
      />
      <EmptyState
        compact
        title="Your cart is currently empty"
        description="Add a plan to start checkout."
      />
    </div>
  ),
};

export const SubscriptionAndDeadlines: Story = {
  render: () => (
    <div className="grid gap-space-6 lg:grid-cols-2">
      <MySubscriptionCard
        subscription={{
          id: "sub-1",
          start_date: "2026-05-11",
          end_date: "2026-06-08",
          is_active: true,
          payment_status: "paid",
          restaurants: { name: "Darien Kitchen" },
          subscription_plans: { name: "Vegetarian Weekly", meal_time: "Lunch" },
        }}
        nextMeal={{
          date: "2026-05-18",
          choice: "delivery",
          mealType: "Lunch",
        }}
      />
      <div className="space-y-space-4 rounded-radius-lg bg-card p-space-6">
        <div className="flex flex-wrap gap-space-4">
          <CutoffIndicator hoursRemaining={48} />
          <CutoffIndicator hoursRemaining={2} />
          <CutoffIndicator hoursRemaining={null} />
        </div>
        <MealDeadlineBanner cutoffHours={3} mealTime="lunch" />
        <Button variant="secondary">
          <CalendarDays className="h-4 w-4" />
          Manage weekly choices
        </Button>
      </div>
    </div>
  ),
};
