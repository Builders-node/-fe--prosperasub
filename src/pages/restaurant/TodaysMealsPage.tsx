import RestaurantAdminLayout from "@/components/restaurant/RestaurantAdminLayout";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin, Utensils, User, Phone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

type MealStatus = "pending" | "prepared" | "delivered" | "completed" | "no_show";

const TodaysMealsPage = () => {
  const { restaurantId, activeRestaurant } = useRestaurant();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: meals, isLoading } = useQuery({
    queryKey: ["todays-meals", restaurantId, today],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      const { data, error } = await supabase
        .from("daily_meal_choices")
        .select(`
          *,
          subscriptions!inner(
            user_id,
            restaurant_id,
            users(name, email, display_name),
            subscription_plans(name)
          )
        `)
        .eq("date", today)
        .eq("subscriptions.restaurant_id", restaurantId)
        .neq("choice", "cancelled");

      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: userProfiles } = useQuery({
    queryKey: ["user-profiles-for-meals", meals],
    queryFn: async () => {
      if (!meals || meals.length === 0) return {};
      
      const userIds = meals.map((m: any) => m.subscriptions.user_id);
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .in("user_id", userIds);
      
      if (error) throw error;
      
      const profileMap: Record<string, any> = {};
      data?.forEach((p) => {
        profileMap[p.user_id] = p;
      });
      return profileMap;
    },
    enabled: !!meals && meals.length > 0,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ mealId, status }: { mealId: string; status: MealStatus }) => {
      const { error } = await supabase
        .from("daily_meal_choices")
        .update({ status })
        .eq("id", mealId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated!");
      queryClient.invalidateQueries({ queryKey: ["todays-meals"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const eatInMeals = meals?.filter((m: any) => m.choice === "eat_in") || [];
  const deliveryMeals = meals?.filter((m: any) => m.choice === "delivery") || [];

  const MealCard = ({ meal }: { meal: any }) => {
    const sub = meal.subscriptions;
    const user = sub.users;
    const profile = userProfiles?.[sub.user_id];
    const deliveryAddress = meal.delivery_address || profile?.default_delivery_address;

    return (
      <Card>
        <CardContent className="py-space-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-4">
            <div className="flex items-start gap-space-3">
              <div className="w-10 h-10 rounded-radius-full bg-muted flex items-center justify-center">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">{user?.name || user?.display_name || "Unknown User"}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-space-2">
                  <span>{sub.subscription_plans?.name}</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {meal.meal_type}
                  </Badge>
                </div>
                
                {profile?.food_preferences?.length > 0 && (
                  <div className="flex gap-space-1 mt-space-1 flex-wrap">
                    {profile.food_preferences.map((pref: string) => (
                      <Badge key={pref} variant="outline" className="text-xs capitalize">
                        {pref.replace("_", "-")}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {meal.choice === "delivery" && deliveryAddress && (
                  <div className="flex items-start gap-space-1 mt-space-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{typeof deliveryAddress === "object" ? deliveryAddress.address : deliveryAddress}</span>
                  </div>
                )}
                
                {profile?.phone_number && (
                  <div className="flex items-center gap-space-1 mt-space-1 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{profile.phone_number}</span>
                  </div>
                )}
                
                {meal.customer_notes && (
                  <div className="text-sm text-amber-600 mt-space-2 italic">Note: {meal.customer_notes}</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-space-2">
              <Select
                value={meal.status}
                onValueChange={(value) =>
                  updateStatusMutation.mutate({ mealId: meal.id, status: value as MealStatus })
                }
                disabled={updateStatusMutation.isPending}
              >
                <SelectTrigger inputSize="sm" className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="prepared">Prepared</SelectItem>
                  {meal.choice === "delivery" && (
                    <SelectItem value="delivered">Delivered</SelectItem>
                  )}
                  <SelectItem value="completed">Completed</SelectItem>
                  {meal.choice === "eat_in" && (
                    <SelectItem value="no_show">No-show</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <RestaurantAdminLayout 
      title="Today's Meals"
      subtitle={format(new Date(), "EEEE, MMMM d, yyyy")}
    >
      <div className="flex items-center justify-between mb-space-6">
        <p className="text-muted-foreground">
          {activeRestaurant?.name}
        </p>
        <Card className="px-space-4 py-space-2">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{meals?.length || 0}</div>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-space-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="eat_in" variant="icon">
          <TabsList className="mb-space-6">
            <TabsTrigger value="eat_in">
              <Utensils className="h-4 w-4" />
              Eat-in ({eatInMeals.length})
            </TabsTrigger>
            <TabsTrigger value="delivery">
              <MapPin className="h-4 w-4" />
              Delivery ({deliveryMeals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="eat_in">
            {eatInMeals.length === 0 ? (
              <Card className="p-space-8 text-center">
                <p className="text-muted-foreground">No eat-in orders for today</p>
              </Card>
            ) : (
              <div className="space-y-space-3">
                {eatInMeals.map((meal: any) => (
                  <MealCard key={meal.id} meal={meal} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="delivery">
            {deliveryMeals.length === 0 ? (
              <Card className="p-space-8 text-center">
                <p className="text-muted-foreground">No delivery orders for today</p>
              </Card>
            ) : (
              <div className="space-y-space-3">
                {deliveryMeals.map((meal: any) => (
                  <MealCard key={meal.id} meal={meal} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </RestaurantAdminLayout>
  );
};

export default TodaysMealsPage;
