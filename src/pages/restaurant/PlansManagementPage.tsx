import { useState } from "react";
import RestaurantAdminLayout from "@/components/restaurant/RestaurantAdminLayout";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Trash2, Edit, DollarSign, Leaf, Wheat, Milk, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type MenuCategory } from "@/lib/supabaseHelpers";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Link } from "react-router-dom";
import { formatUSD, dollarsToCents, centsToDollars } from "@/lib/pricing";

const MENU_CATEGORIES: { value: MenuCategory; label: string; icon?: React.ReactNode }[] = [
  { value: "standard", label: "Standard" },
  { value: "vegetarian", label: "Vegetarian", icon: <Leaf className="h-4 w-4 text-accent" /> },
  { value: "vegan", label: "Vegan", icon: <Leaf className="h-4 w-4 text-accent" /> },
  { value: "keto", label: "Keto" },
  { value: "gluten_free", label: "Gluten-Free", icon: <Wheat className="h-4 w-4 text-amber-500" /> },
  { value: "lactose_free", label: "Lactose-Free", icon: <Milk className="h-4 w-4 text-blue-400" /> },
];

interface PlanFormData {
  name: string;
  description: string;
  price_per_week_usd: number; // Changed to USD dollars for form
  meal_time: string;
  max_duration_weeks: number;
  supports_delivery: boolean;
  is_active: boolean;
  menu_category: MenuCategory;
}

const defaultFormData: PlanFormData = {
  name: "",
  description: "",
  price_per_week_usd: 10, // $10.00 default
  meal_time: "13:00",
  max_duration_weeks: 4,
  supports_delivery: true,
  is_active: false,
  menu_category: "standard",
};

const PlansManagementPage = () => {
  const { restaurantId, activeRestaurant } = useRestaurant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);

  // Fetch subscription plans
  const { data: plans, isLoading } = useQuery({
    queryKey: ["subscription-plans", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      const pubkey = localStorage.getItem("lightning_pubkey") || "";
      const { data, error } = await supabase.rpc("get_subscription_plans_by_restaurant", {
        p_pubkey: pubkey,
        p_restaurant_id: restaurantId,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Fetch weekly menus to check which categories have published menus
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  
  const { data: weeklyMenus } = useQuery({
    queryKey: ["weekly-menus-status", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      const { data, error } = await supabase
        .from("weekly_menus")
        .select("id, category, status, week_start_date, week_end_date")
        .eq("restaurant_id", restaurantId)
        .gte("week_end_date", format(weekStart, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  const hasPublishedMenu = (category: MenuCategory) => {
    return weeklyMenus?.some(
      (menu) => menu.category === category && menu.status === "published"
    );
  };

  const createPlanMutation = useMutation({
    mutationFn: async (data: PlanFormData) => {
      if (!restaurantId) throw new Error("No restaurant selected");
      
      const pubkey = localStorage.getItem("lightning_pubkey") || "";
      const priceInCents = dollarsToCents(data.price_per_week_usd);
      const { error } = await supabase.rpc("create_subscription_plan_by_pubkey", {
        p_pubkey: pubkey,
        p_name: data.name,
        p_price_per_week_sats: priceInCents, // Now stores USD cents
        p_description: data.description || null,
        p_meal_time: data.meal_time,
        p_max_duration_weeks: data.max_duration_weeks,
        p_supports_delivery: data.supports_delivery,
        p_is_active: data.is_active,
        p_menu_category: data.menu_category,
        p_restaurant_id: restaurantId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan created!");
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PlanFormData }) => {
      if (data.is_active && !hasPublishedMenu(data.menu_category)) {
        throw new Error(`Please create and publish a ${data.menu_category.replace("_", " ")} menu first before activating this plan.`);
      }
      
      const pubkey = localStorage.getItem("lightning_pubkey") || "";
      const priceInCents = dollarsToCents(data.price_per_week_usd);
      const { error } = await supabase.rpc("update_subscription_plan_by_pubkey", {
        p_pubkey: pubkey,
        p_plan_id: id,
        p_name: data.name,
        p_description: data.description || null,
        p_price_per_week_sats: priceInCents, // Now stores USD cents
        p_meal_time: data.meal_time,
        p_max_duration_weeks: data.max_duration_weeks,
        p_supports_delivery: data.supports_delivery,
        p_is_active: data.is_active,
        p_menu_category: data.menu_category,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan updated!");
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      closeDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const pubkey = localStorage.getItem("lightning_pubkey") || "";
      const { error } = await supabase.rpc("delete_subscription_plan_by_pubkey", {
        p_pubkey: pubkey,
        p_plan_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan deleted!");
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingPlan(null);
    setFormData(defaultFormData);
  };

  const openEditDialog = (plan: any) => {
    setEditingPlan(plan.id);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price_per_week_usd: centsToDollars(plan.price_per_week_sats), // Convert cents to dollars for form
      meal_time: plan.meal_time || "13:00",
      max_duration_weeks: plan.max_duration_weeks || 4,
      supports_delivery: plan.supports_delivery ?? true,
      is_active: plan.is_active ?? true,
      menu_category: plan.menu_category || "standard",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Plan name is required");
      return;
    }
    if (formData.price_per_week_usd <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }
    
    if (editingPlan) {
      updatePlanMutation.mutate({ id: editingPlan, data: formData });
    } else {
      createPlanMutation.mutate(formData);
    }
  };

  const isPending = createPlanMutation.isPending || updatePlanMutation.isPending;

  return (
    <RestaurantAdminLayout 
      title="Subscription Plans"
      subtitle={activeRestaurant?.name}
    >
      <div className="flex justify-end mb-space-6">
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingPlan(null); setFormData(defaultFormData); }}>
              <Plus className="h-4 w-4" />
              Create Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Edit Plan" : "Create New Plan"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-space-4">
              <div>
                <Label htmlFor="name">Plan Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Lunch Special"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this meal plan..."
                  rows={2}
                />
              </div>

              <div>
                <Label>Menu Category</Label>
                <Select 
                  value={formData.menu_category} 
                  onValueChange={(v) => setFormData({ ...formData, menu_category: v as MenuCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MENU_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-space-2">
                          {cat.icon}
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="usd" className="flex items-center gap-space-1">
                  <DollarSign className="h-4 w-4 text-accent" />
                  Price (USD/week)
                </Label>
                <Input
                  id="usd"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.price_per_week_usd}
                  onChange={(e) => setFormData({ ...formData, price_per_week_usd: parseFloat(e.target.value) || 0 })}
                  placeholder="10.00"
                />
              </div>

              <div>
                <Label htmlFor="meal_time">Meal Time</Label>
                <Input
                  id="meal_time"
                  type="time"
                  value={formData.meal_time}
                  onChange={(e) => setFormData({ ...formData, meal_time: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="max_weeks">Max Duration (weeks)</Label>
                <Input
                  id="max_weeks"
                  type="number"
                  min="1"
                  max="12"
                  value={formData.max_duration_weeks}
                  onChange={(e) => setFormData({ ...formData, max_duration_weeks: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="delivery" className="cursor-pointer">Supports Delivery</Label>
                <Switch
                  id="delivery"
                  checked={formData.supports_delivery}
                  onCheckedChange={(checked) => setFormData({ ...formData, supports_delivery: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="active" className="cursor-pointer">Active (visible to customers)</Label>
                <Switch
                  id="active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>

              <Button onClick={handleSubmit} loading={isPending} className="w-full">
                {editingPlan ? "Update Plan" : "Create Plan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-space-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : plans?.length === 0 ? (
        <Card className="p-space-12 text-center">
          <p className="text-muted-foreground mb-space-4">No subscription plans yet.</p>
          <p className="text-sm text-muted-foreground">
            Create a plan to allow customers to subscribe to your meals.
          </p>
        </Card>
      ) : (
        <div className="grid gap-space-4">
          {plans?.map((plan) => {
            const menuReady = hasPublishedMenu(plan.menu_category as MenuCategory);
            
            return (
              <Card key={plan.id}>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <div className="flex items-center gap-space-2 flex-wrap">
                      <CardTitle>{plan.name}</CardTitle>
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {menuReady ? (
                        <Badge variant="outline" className="text-accent border-accent">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Menu Ready
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          No Menu
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-space-2 mt-space-1">
                      {MENU_CATEGORIES.find(c => c.value === plan.menu_category)?.icon}
                      <span className="text-sm text-muted-foreground capitalize">
                        {plan.menu_category?.replace("_", " ") || "Standard"} Menu
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground mt-space-1">{plan.description}</p>
                    )}
                  </div>
                  <div className="flex gap-space-2">
                    <Button variant="secondary" size="icon" onClick={() => openEditDialog(plan)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => deletePlanMutation.mutate(plan.id)}
                      disabled={deletePlanMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-space-4 text-sm mb-space-4">
                    <div>
                      <span className="text-muted-foreground">Price</span>
                      <div className="font-medium flex items-center gap-space-1">
                        <DollarSign className="h-4 w-4 text-accent" />
                        {formatUSD(plan.price_per_week_sats)}/week
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Meal Time</span>
                      <div className="font-medium">{plan.meal_time || "13:00"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max Duration</span>
                      <div className="font-medium">{plan.max_duration_weeks || 4} weeks</div>
                    </div>
                  </div>
                  
                  {!menuReady && (
                    <div className="p-space-3 bg-amber-50 dark:bg-amber-900/20 rounded-radius-md">
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        This plan needs a published {plan.menu_category?.replace("_", " ")} menu before it can be activated.{" "}
                        <Link 
                          to={`/restaurant/${restaurantId}/menu?category=${plan.menu_category}`}
                          className="underline font-medium"
                        >
                          Create menu →
                        </Link>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </RestaurantAdminLayout>
  );
};

export default PlansManagementPage;
