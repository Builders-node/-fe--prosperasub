import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Menu, 
  Calendar, 
  Users, 
  Wallet, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  TrendingUp,
  Utensils,
  Truck
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import RestaurantAdminLayout from "@/components/restaurant/RestaurantAdminLayout";
import OperationalSection from "@/components/restaurant/OperationalSection";
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { Link } from "react-router-dom";

const RestaurantDashboardPage = () => {
  const { restaurantId, activeRestaurant } = useRestaurant();

  // Date references — all in Honduras timezone (America/Tegucigalpa)
  const today = nowHN();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const todayStart = format(startOfDay(today), "yyyy-MM-dd");
  const todayEnd = format(endOfDay(today), "yyyy-MM-dd");

  // Fetch today's meal choices for the restaurant
  const { data: todaysMeals } = useQuery({
    queryKey: ["dashboard-todays-meals", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return { total: 0, eatIn: 0, delivery: 0, pending: 0 };
      
      const { data, error } = await supabase
        .from("daily_meal_choices")
        .select(`
          id, choice, status,
          subscription:subscriptions!inner(restaurant_id)
        `)
        .eq("subscriptions.restaurant_id", restaurantId)
        .eq("date", todayStart);
      
      if (error) throw error;
      
      const meals = data || [];
      return {
        total: meals.length,
        eatIn: meals.filter(m => m.choice === "eat_in").length,
        delivery: meals.filter(m => m.choice === "delivery").length,
        pending: meals.filter(m => m.status === "pending").length,
        prepared: meals.filter(m => m.status === "prepared").length,
      };
    },
    enabled: !!restaurantId,
  });

  // Fetch plans for current restaurant
  const { data: plans } = useQuery({
    queryKey: ["dashboard-plans", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, menu_category, is_active")
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Fetch menus for current restaurant
  const { data: menus } = useQuery({
    queryKey: ["dashboard-menus", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from("weekly_menus")
        .select("id, category, status, plan_id")
        .eq("restaurant_id", restaurantId)
        .gte("week_end_date", format(weekStart, "yyyy-MM-dd"))
        .lte("week_start_date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Fetch active subscribers count with plan breakdown
  const { data: subscribersData } = useQuery({
    queryKey: ["dashboard-subscribers", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return { active: 0, pending: 0, planBreakdown: [] as { planName: string; count: number }[] };
      
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id, is_active, payment_status,
          plan:subscription_plans(id, name)
        `)
        .eq("restaurant_id", restaurantId)
        .gte("end_date", format(today, "yyyy-MM-dd"));
      
      if (error) throw error;
      
      const subs = data || [];
      const activeSubs = subs.filter(s => s.is_active && s.payment_status === "paid");
      
      // Group active subscribers by plan
      const planCounts = activeSubs.reduce((acc, sub) => {
        const planName = sub.plan?.name || "Unknown Plan";
        acc[planName] = (acc[planName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const planBreakdown = Object.entries(planCounts).map(([planName, count]) => ({
        planName,
        count,
      }));
      
      return {
        active: activeSubs.length,
        pending: subs.filter(s => s.payment_status === "pending").length,
        planBreakdown,
      };
    },
    enabled: !!restaurantId,
  });

  // Calculate status
  const activePlans = plans?.filter(p => p.is_active) || [];
  const publishedMenus = menus?.filter(m => m.status === "published") || [];
  const draftMenus = menus?.filter(m => m.status === "draft") || [];

  return (
    <RestaurantAdminLayout 
      title={activeRestaurant?.name || "Dashboard"}
      subtitle={activeRestaurant?.address || "Manage your restaurant operations"}
      showBackButton={false}
    >
      <div className="space-y-space-6">
        {/* TODAY Section */}
        <OperationalSection
          title="Today"
          description={format(today, "EEEE, MMMM d")}
          icon={Calendar}
          href={`/restaurant/${restaurantId}/meals`}
          stats={[
            { label: "Total Meals", value: todaysMeals?.total || 0 },
            { label: "Eat-in", value: todaysMeals?.eatIn || 0, variant: "default" },
            { label: "Delivery", value: todaysMeals?.delivery || 0, variant: "default" },
            { label: "Pending Prep", value: todaysMeals?.pending || 0, variant: todaysMeals?.pending ? "warning" : "default" },
          ]}
        >
          {todaysMeals?.total === 0 ? (
            <div className="text-sm text-muted-foreground py-space-2">
              No meal orders for today yet.
            </div>
          ) : (
            <div className="flex gap-space-2">
              <Button asChild variant="secondary" size="sm">
                <Link to={`/restaurant/${restaurantId}/meals`}>
                  <Utensils className="h-4 w-4" />
                  View Prep List
                </Link>
              </Button>
              {todaysMeals?.delivery && todaysMeals.delivery > 0 && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/restaurant/${restaurantId}/meals?filter=delivery`}>
                    <Truck className="h-4 w-4" />
                    Delivery List ({todaysMeals.delivery})
                  </Link>
                </Button>
              )}
            </div>
          )}
        </OperationalSection>

        {/* THIS WEEK Section */}
        <OperationalSection
          title="This Week"
          description={`${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`}
          icon={Menu}
          href={`/restaurant/${restaurantId}/menu`}
          stats={[
            { label: "Active Plans", value: activePlans.length, variant: activePlans.length > 0 ? "success" : "warning" },
            { label: "Published Menus", value: publishedMenus.length, variant: publishedMenus.length > 0 ? "success" : "warning" },
            { label: "Draft Menus", value: draftMenus.length, variant: draftMenus.length > 0 ? "warning" : "default" },
          ]}
        >
          {draftMenus.length > 0 && (
            <div className="flex items-center gap-space-2 p-space-3 bg-warning/10 border border-warning/20 rounded-radius-md text-sm">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span>You have {draftMenus.length} unpublished menu(s) for this week</span>
              <Button asChild variant="secondary" size="sm" className="ml-auto">
                <Link to={`/restaurant/${restaurantId}/menu`}>Manage Menus</Link>
              </Button>
            </div>
          )}
          {publishedMenus.length === 0 && draftMenus.length === 0 && (
            <div className="flex items-center gap-space-2 p-space-3 bg-muted rounded-radius-md text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>No menus created for this week yet</span>
              <Button asChild size="sm" className="ml-auto">
                <Link to={`/restaurant/${restaurantId}/menu`}>Create Menu</Link>
              </Button>
            </div>
          )}
        </OperationalSection>

        {/* SUBSCRIBERS Section */}
        <OperationalSection
          title="Subscribers"
          description="Active subscription management"
          icon={Users}
          href={`/restaurant/${restaurantId}/subscribers`}
          stats={[
            { label: "Active", value: subscribersData?.active || 0, variant: "success" },
            { label: "Pending Payment", value: subscribersData?.pending || 0, variant: subscribersData?.pending ? "warning" : "default" },
          ]}
        >
          {/* Plan Breakdown */}
          {subscribersData?.planBreakdown && subscribersData.planBreakdown.length > 0 && (
            <div className="mb-space-4 p-space-3 bg-muted/50 rounded-radius-md">
              <div className="text-sm font-medium mb-space-2">Plan Breakdown</div>
              <div className="space-y-space-1">
                {subscribersData.planBreakdown.map((item) => (
                  <div key={item.planName} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.planName}</span>
                    <span className="font-medium">{item.count} subscriber{item.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {subscribersData?.pending && subscribersData.pending > 0 && (
            <div className="flex items-center gap-space-2 p-space-3 bg-warning/10 border border-warning/20 rounded-radius-md text-sm">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span>{subscribersData.pending} subscription(s) awaiting payment verification</span>
              <Button asChild variant="secondary" size="sm" className="ml-auto">
                <Link to={`/restaurant/${restaurantId}/subscribers?filter=pending`}>Review</Link>
              </Button>
            </div>
          )}
        </OperationalSection>

        {/* WALLET Section */}
        <OperationalSection
          title="Wallet & Payments"
          description="Lightning payment settings"
          icon={Wallet}
          href={`/restaurant/${restaurantId}/wallet`}
        >
          <Button asChild variant="secondary" size="sm">
            <Link to={`/restaurant/${restaurantId}/wallet`}>
              <CreditCard className="h-4 w-4" />
              Configure Payment Settings
            </Link>
          </Button>
        </OperationalSection>

        {/* Quick Setup Checklist - only show if incomplete */}
        {(activePlans.length === 0 || publishedMenus.length === 0) && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-space-2">
                <CheckCircle2 className="h-5 w-5" />
                Setup Checklist
              </CardTitle>
              <CardDescription>Complete these steps to start receiving subscribers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-space-3">
                <div className="flex items-center gap-space-3">
                  {activePlans.length > 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                  ) : (
                    <div className="h-5 w-5 rounded-radius-full border-2 border-muted-foreground" />
                  )}
                  <span className={activePlans.length > 0 ? "text-muted-foreground line-through" : ""}>
                    Create at least one subscription plan
                  </span>
                  {activePlans.length === 0 && (
                    <Button asChild size="sm" variant="secondary" className="ml-auto">
                      <Link to={`/restaurant/${restaurantId}/plans`}>Create Plan</Link>
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-space-3">
                  {publishedMenus.length > 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                  ) : (
                    <div className="h-5 w-5 rounded-radius-full border-2 border-muted-foreground" />
                  )}
                  <span className={publishedMenus.length > 0 ? "text-muted-foreground line-through" : ""}>
                    Publish a weekly menu
                  </span>
                  {publishedMenus.length === 0 && (
                    <Button asChild size="sm" variant="secondary" className="ml-auto">
                      <Link to={`/restaurant/${restaurantId}/menu`}>Create Menu</Link>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </RestaurantAdminLayout>
  );
};

export default RestaurantDashboardPage;
