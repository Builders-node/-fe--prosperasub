import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChefHat, Info, BookOpen, CalendarDays, Users, ExternalLink, CreditCard, UtensilsCrossed } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RestaurantInfoTab } from "@/components/food/admin/RestaurantInfoTab";
import { RestaurantMealPlansTab } from "@/components/food/admin/RestaurantMealPlansTab";
import { RestaurantWeeklyMenusTab } from "@/components/food/admin/RestaurantWeeklyMenusTab";
import { RestaurantStaffTab } from "@/components/food/admin/RestaurantStaffTab";
import { RestaurantSubscriptionsTab } from "@/components/food/admin/RestaurantSubscriptionsTab";
import { useMyRestaurants } from "@/hooks/useMyRestaurants";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

export default function MyRestaurant() {
  const { restaurants, isLoading } = useMyRestaurants();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("providerId"));

  const selected = restaurants.find((r) => r.id === selectedId) ?? restaurants[0] ?? null;
  const isOwner = selected?.myRole === "owner";

  if (isLoading) {
    return (
      <UserLayout title="My Restaurant">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        </div>
      </UserLayout>
    );
  }

  if (!selected) {
    return (
      <UserLayout title="My Restaurant">
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <ChefHat className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">You don't manage a restaurant</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            If you should have access to a restaurant, ask a platform administrator to add you as its
            owner or a manager.
          </p>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="My Restaurant">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Restaurant switcher (only when the user manages more than one) */}
        {restaurants.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {restaurants.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  r.id === selected.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {/* Banner */}
          <div className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-orange-500/25 via-amber-500/10 to-transparent sm:h-40">
            {selected.banner_url ? (
              <img src={selected.banner_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground/15" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-3 p-4 sm:gap-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:h-14 sm:w-14">
            {selected.avatar_url ? (
              <img src={selected.avatar_url} alt={selected.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ChefHat className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{selected.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={`rounded-full text-xs ${STATUS_COLORS[selected.status]}`}>
                {selected.status}
              </Badge>
              <Badge variant="secondary" className="rounded-full text-xs capitalize">
                {selected.myRole}
              </Badge>
            </div>
            {selected.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{selected.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm"
            className="order-last w-full shrink-0 gap-1.5 rounded-full sm:order-none sm:w-auto"
            onClick={() => window.open(`/food/${selected.id}`, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5" /> View Public
          </Button>
          </div>
        </div>

        {/* Tabs — keyed by restaurant so switching resets inner state */}
        <Tabs defaultValue="info" key={selected.id}>
          <TabsList equalWidth className="mb-6 w-full">
            <TabsTrigger value="info" equalWidth className="gap-2 px-2 sm:px-space-4">
              <Info className="hidden h-4 w-4 sm:block" />
              <span className="hidden sm:inline">Information</span>
              <span className="sm:hidden">Info</span>
            </TabsTrigger>
            <TabsTrigger value="meal-plans" equalWidth className="gap-2 px-2 sm:px-space-4">
              <BookOpen className="hidden h-4 w-4 sm:block" />
              <span className="hidden sm:inline">Meal Plans</span>
              <span className="sm:hidden">Plans</span>
            </TabsTrigger>
            <TabsTrigger value="menus" equalWidth className="gap-2 px-2 sm:px-space-4">
              <CalendarDays className="hidden h-4 w-4 sm:block" />
              <span className="hidden sm:inline">Weekly Menus</span>
              <span className="sm:hidden">Menus</span>
            </TabsTrigger>
            <TabsTrigger value="subscriptions" equalWidth className="gap-2 px-2 sm:px-space-4">
              <CreditCard className="hidden h-4 w-4 sm:block" />
              <span className="hidden sm:inline">Subscriptions</span>
              <span className="sm:hidden">Subs</span>
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="staff" equalWidth className="gap-2 px-2 sm:px-space-4">
                <Users className="hidden h-4 w-4 sm:block" />
                <span>Staff</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="info">
            <RestaurantInfoTab restaurant={selected} />
          </TabsContent>
          <TabsContent value="meal-plans">
            <RestaurantMealPlansTab providerId={selected.id} />
          </TabsContent>
          <TabsContent value="menus">
            <RestaurantWeeklyMenusTab providerId={selected.id} providerName={selected.name} />
          </TabsContent>
          <TabsContent value="subscriptions">
            <RestaurantSubscriptionsTab providerId={selected.id} />
          </TabsContent>
          {isOwner && (
            <TabsContent value="staff">
              <RestaurantStaffTab restaurant={selected} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </UserLayout>
  );
}
