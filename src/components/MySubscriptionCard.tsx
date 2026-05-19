import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronRight, Utensils, Clock } from "lucide-react";
import { format, parseISO, isAfter, isBefore, startOfDay } from "date-fns";

interface MySubscriptionCardProps {
  subscription: {
    id: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    payment_status: string;
    restaurants?: { name: string; logo_url?: string };
    subscription_plans?: { name: string; meal_time?: string };
  };
  /** Next meal info if available */
  nextMeal?: {
    date: string;
    choice: string | null;
    mealType: string;
  } | null;
}

export function MySubscriptionCard({ subscription, nextMeal }: MySubscriptionCardProps) {
  const restaurant = subscription.restaurants;
  const plan = subscription.subscription_plans;
  const today = startOfDay(new Date());
  const endDate = parseISO(subscription.end_date);
  const isExpired = isBefore(endDate, today);
  const isUpcoming = isAfter(parseISO(subscription.start_date), today);

  const getStatusBadge = () => {
    if (isExpired) return <Badge variant="secondary">Expired</Badge>;
    if (!subscription.is_active) return <Badge variant="outline">Inactive</Badge>;
    if (subscription.payment_status === "pending") return <Badge variant="secondary">Pending Payment</Badge>;
    if (isUpcoming) return <Badge variant="outline">Upcoming</Badge>;
    return <Badge variant="default">Active</Badge>;
  };

  const getNextMealText = () => {
    if (!nextMeal) return null;
    if (!nextMeal.choice) return "No choice set yet";
    if (nextMeal.choice === "eat_in") return "Eat-in";
    if (nextMeal.choice === "delivery") return "Delivery";
    if (nextMeal.choice === "cancelled") return "Cancelled";
    return null;
  };

  return (
    <Link to={`/subscription/${subscription.id}`}>
      <Card className="group cursor-pointer overflow-hidden transition-colors">
        <CardContent className="p-0">
          <div className="flex gap-space-4 p-space-4 sm:p-space-5">
            {/* Restaurant Logo */}
            <div className="flex-shrink-0">
              {restaurant?.logo_url ? (
                <img 
                  src={restaurant.logo_url} 
                  alt={restaurant.name} 
                  className="w-16 h-16 rounded-radius-lg object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-radius-lg bg-muted flex items-center justify-center">
                  <Utensils className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-space-2">
                <div>
                  <h3 className="truncate text-card-title text-foreground">
                    {restaurant?.name || "Restaurant"}
                  </h3>
                  <p className="truncate type-body text-muted-foreground">
                    {plan?.name || "Subscription"}
                  </p>
                </div>
                {getStatusBadge()}
              </div>

              <div className="mt-space-3 flex flex-wrap items-center gap-space-4 text-caption text-muted-foreground">
                <span className="flex items-center gap-space-1">
                  <Calendar className="h-3 w-3" />
                  {format(parseISO(subscription.start_date), "MMM d")} - {format(endDate, "MMM d")}
                </span>
                {plan?.meal_time && (
                  <span className="flex items-center gap-space-1">
                    <Clock className="h-3 w-3" />
                    {plan.meal_time}
                  </span>
                )}
              </div>
            </div>

            <ChevronRight className="h-5 w-5 self-center text-muted-foreground transition-colors group-hover:text-foreground" />
          </div>

          {/* Next Meal Strip */}
          {nextMeal && subscription.is_active && !isExpired && (
            <div className="flex items-center justify-between border-t border-[hsl(var(--app-divider))] bg-[hsl(var(--app-control))] px-space-4 py-space-3 text-control">
              <span className="text-muted-foreground">
                Next: {format(parseISO(nextMeal.date), "EEE, MMM d")} • {nextMeal.mealType}
              </span>
              <span className={nextMeal.choice ? "text-foreground font-medium" : "text-amber-600"}>
                {getNextMealText()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
