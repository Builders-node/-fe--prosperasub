import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import RestaurantAdminLayout from "@/components/restaurant/RestaurantAdminLayout";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Trash2, Edit, Leaf, Wheat, Milk, Upload, X, AlertCircle, ChevronLeft, ChevronRight, Coffee, Sun, Moon, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { 
  getWeeklyMenus, 
  createWeeklyMenu, 
  createMenuItem, 
  updateMenuItem, 
  deleteMenuItem, 
  updateMenuStatus,
  type MenuCategory
} from "@/lib/supabaseHelpers";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const TAGS = ["vegan", "vegetarian", "gluten_free", "lactose_free", "keto"];

const MEAL_ICONS: Record<typeof MEAL_TYPES[number], React.ReactNode> = {
  breakfast: <Coffee className="h-4 w-4" />,
  lunch: <Sun className="h-4 w-4" />,
  dinner: <Moon className="h-4 w-4" />,
};

const MENU_CATEGORIES: { value: MenuCategory; label: string; icon?: React.ReactNode }[] = [
  { value: "standard", label: "Standard" },
  { value: "vegetarian", label: "Vegetarian", icon: <Leaf className="h-4 w-4 text-accent" /> },
  { value: "vegan", label: "Vegan", icon: <Leaf className="h-4 w-4 text-accent" /> },
  { value: "keto", label: "Keto" },
  { value: "gluten_free", label: "Gluten-Free", icon: <Wheat className="h-4 w-4 text-amber-500" /> },
  { value: "lactose_free", label: "Lactose-Free", icon: <Milk className="h-4 w-4 text-blue-400" /> },
];

const MenuManagementPage = () => {
  const { restaurantId, activeRestaurant } = useRestaurant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>("standard");
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<typeof DAYS_OF_WEEK[number]>("monday");
  const [selectedMealType, setSelectedMealType] = useState<typeof MEAL_TYPES[number]>("lunch");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  // Form state
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [itemImage, setItemImage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Link Plan modal state
  const [isLinkPlanDialogOpen, setIsLinkPlanDialogOpen] = useState(false);
  const [linkPlanCategory, setLinkPlanCategory] = useState<MenuCategory>("standard");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Handle URL param for pre-selecting category
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam && MENU_CATEGORIES.some(c => c.value === categoryParam)) {
      setSelectedCategory(categoryParam as MenuCategory);
    }
  }, [searchParams]);

  const weekStart = startOfWeek(addWeeks(new Date(), selectedWeek), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), selectedWeek), { weekStartsOn: 1 });

  const { data: menus, isLoading: menusLoading } = useQuery({
    queryKey: ["weekly-menus", restaurantId, selectedWeek],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      const { data, error } = await getWeeklyMenus(
        format(weekStart, "yyyy-MM-dd"),
        format(weekEnd, "yyyy-MM-dd"),
        restaurantId
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Fetch subscription plans to show which plans use each category
  const { data: subscriptionPlans } = useQuery({
    queryKey: ["subscription-plans-for-menu", restaurantId],
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

  // Helper to get plans for a category
  const getPlansForCategory = (category: MenuCategory) => {
    return subscriptionPlans?.filter(p => p.menu_category === category) || [];
  };

  const createMenuMutation = useMutation({
    mutationFn: async (category: MenuCategory) => {
      if (!restaurantId) throw new Error("No restaurant selected");
      const { data, error } = await createWeeklyMenu(
        format(weekStart, "yyyy-MM-dd"),
        format(weekEnd, "yyyy-MM-dd"),
        restaurantId,
        category
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Menu created!");
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMenuId || !restaurantId) throw new Error("No menu selected");
      
      const { error } = await createMenuItem(
        selectedMenuId,
        restaurantId,
        selectedDay,
        selectedMealType,
        itemName.trim(),
        itemDescription.trim() || null,
        itemTags,
        itemImage.trim() || null
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item added!");
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
      closeItemDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await updateMenuItem(
        itemId,
        itemName.trim(),
        itemDescription.trim() || null,
        itemTags,
        itemImage.trim() || null
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item updated!");
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
      closeItemDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await deleteMenuItem(itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted!");
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMenuStatusMutation = useMutation({
    mutationFn: async ({ menuId, status }: { menuId: string; status: "draft" | "published" }) => {
      const { error } = await updateMenuStatus(menuId, status);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Menu status updated!");
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Link plan to menu mutation
  const linkPlanMutation = useMutation({
    mutationFn: async ({ menuId, planId }: { menuId: string; planId: string | null }) => {
      if (!menuId) throw new Error("No menu selected");
      
      const { error } = await supabase
        .from("weekly_menus")
        .update({ plan_id: planId })
        .eq("id", menuId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan linked to menu!");
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
      closeLinkPlanDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeLinkPlanDialog = () => {
    setIsLinkPlanDialogOpen(false);
    setSelectedPlanId(null);
  };

  const openLinkPlanDialog = (category: MenuCategory, currentPlanId?: string | null) => {
    setLinkPlanCategory(category);
    setSelectedPlanId(currentPlanId || null);
    setIsLinkPlanDialogOpen(true);
  };

  const handleLinkPlan = () => {
    const menu = menus?.find((m: any) => m.category === linkPlanCategory);
    if (!menu) {
      toast.error("No menu found for this category");
      return;
    }
    linkPlanMutation.mutate({ menuId: menu.id, planId: selectedPlanId });
  };

  const resetItemForm = () => {
    setItemName("");
    setItemDescription("");
    setItemTags([]);
    setItemImage("");
    setEditingItemId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${restaurantId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("menu-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("menu-images")
        .getPublicUrl(filePath);

      setItemImage(publicUrl);
      toast.success("Image uploaded!");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = () => {
    setItemImage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeItemDialog = () => {
    setIsItemDialogOpen(false);
    resetItemForm();
  };

  const openAddItemDialog = (day: typeof DAYS_OF_WEEK[number], mealType: typeof MEAL_TYPES[number], menuId: string) => {
    resetItemForm();
    setSelectedDay(day);
    setSelectedMealType(mealType);
    setSelectedMenuId(menuId);
    setIsItemDialogOpen(true);
  };

  const openEditItemDialog = (item: any, menuId: string) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemTags(item.tags || []);
    setItemImage(item.image_url || "");
    setSelectedDay(item.day_of_week);
    setSelectedMealType(item.meal_type);
    setSelectedMenuId(menuId);
    setIsItemDialogOpen(true);
  };

  const handleSaveItem = () => {
    if (!itemName.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (editingItemId) {
      updateItemMutation.mutate(editingItemId);
    } else {
      addItemMutation.mutate();
    }
  };

  // Get menu for the selected category
  const currentMenu = menus?.find((m: any) => m.category === selectedCategory);

  // Calculate menu completion stats
  const getMenuStats = (menu: any) => {
    const menuItems = menu?.menu_items as any[] || [];
    const totalSlots = DAYS_OF_WEEK.length * MEAL_TYPES.length;
    const filledSlots = menuItems.length;
    return { filled: filledSlots, total: totalSlots, percentage: Math.round((filledSlots / totalSlots) * 100) };
  };

  const renderWeekGrid = (menu: any) => {
    const menuItems = menu?.menu_items as any[] || [];
    const stats = getMenuStats(menu);
    const isComplete = stats.percentage === 100;
    const isDraft = menu.status === "draft";

    const getProgressColor = () => {
      if (stats.percentage === 100) return "text-success";
      if (stats.percentage >= 50) return "text-warning";
      return "text-muted-foreground";
    };

    return (
      <div className="space-y-space-6">
        {/* Menu Header with Status */}
        <Card>
          <CardContent className="p-space-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-4">
                <Badge 
                  variant={menu.status === "published" ? "default" : isComplete ? "outline" : "secondary"} 
                  className={`text-sm ${isComplete && isDraft ? "border-success text-success bg-success/10" : ""}`}
                >
                  {menu.status === "published" ? (
                    <><Check className="h-3 w-3 mr-1" /> Published</>
                  ) : isComplete ? (
                    <><Check className="h-3 w-3 mr-1" /> Ready to Publish</>
                  ) : (
                    "Draft"
                  )}
                </Badge>
                <div className={`text-sm font-medium ${getProgressColor()}`}>
                  {stats.filled}/{stats.total} meals ({stats.percentage}%)
                </div>
              </div>
              <div className="flex gap-space-2">
                {menu.status === "draft" ? (
                  <Button
                    onClick={() => updateMenuStatusMutation.mutate({ menuId: menu.id, status: "published" })}
                    loading={updateMenuStatusMutation.isPending}
                    size="sm"
                  >
                    Publish Menu
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => updateMenuStatusMutation.mutate({ menuId: menu.id, status: "draft" })}
                    disabled={updateMenuStatusMutation.isPending}
                    size="sm"
                  >
                    Unpublish
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Week Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-space-3">
          {DAYS_OF_WEEK.map((day, dayIndex) => {
            const dayDate = addDays(weekStart, dayIndex);
            const dayItems = menuItems.filter((item: any) => item.day_of_week === day);
            
            return (
              <Card key={day} className="overflow-hidden">
                <CardHeader className="p-space-3 bg-muted/30">
                  <div className="text-center">
                    <div className="font-semibold capitalize text-sm">{day}</div>
                    <div className="text-xs text-muted-foreground">{format(dayDate, "MMM d")}</div>
                  </div>
                </CardHeader>
                <CardContent className="p-space-2 space-y-space-2">
                  {MEAL_TYPES.map((mealType) => {
                    const mealItem = dayItems.find((item: any) => item.meal_type === mealType);
                    
                    return (
                      <div 
                        key={mealType} 
                        className={`p-space-2 rounded-radius-md transition-all ${
                          mealItem 
                            ? "bg-primary/5 hover:bg-primary/10" 
                            : "bg-muted/20 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-space-1 mb-space-1">
                          {MEAL_ICONS[mealType]}
                          <span className="text-xs font-medium capitalize">{mealType}</span>
                        </div>
                        
                        {mealItem ? (
                          <div 
                            className="cursor-pointer group"
                            onClick={() => openEditItemDialog(mealItem, menu.id)}
                          >
                            <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                              {mealItem.name}
                            </div>
                            {mealItem.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-space-1 mt-space-1">
                                {mealItem.tags.slice(0, 2).map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-space-1 py-0">
                                    {tag.replace("_", " ")}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="tertiary"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => openAddItemDialog(day, mealType, menu.id)}
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <RestaurantAdminLayout 
      title="Menu Management"
      subtitle={activeRestaurant?.name}
    >
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-space-6">
        <div className="flex items-center gap-space-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setSelectedWeek(w => w - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-[180px] text-center">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setSelectedWeek(w => w + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {selectedWeek !== 0 && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setSelectedWeek(0)}
            >
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as MenuCategory)} variant="icon" className="mb-space-6">
        <TabsList wrap className="h-auto">
          {MENU_CATEGORIES.map((cat) => {
            const menu = menus?.find((m: any) => m.category === cat.value);
            const plans = getPlansForCategory(cat.value);
            
            return (
              <TabsTrigger key={cat.value} value={cat.value}>
                {cat.icon}
                {cat.label}
                {menu && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-space-2">
                    {menu.status === "published" ? "✓" : "draft"}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {MENU_CATEGORIES.map((cat) => {
          const menu = menus?.find((m: any) => m.category === cat.value);
          const plans = getPlansForCategory(cat.value);
          
          return (
            <TabsContent key={cat.value} value={cat.value}>
              {menusLoading ? (
                <div className="flex justify-center py-space-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : menu ? (
                <>
                  {/* Plans using this category */}
                  {plans.length > 0 && (
                    <div className="mb-space-4 flex items-center gap-space-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">Used by plans:</span>
                      {plans.map((plan) => (
                        <Badge key={plan.id} variant={plan.is_active ? "default" : "secondary"}>
                          {plan.name}
                        </Badge>
                      ))}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openLinkPlanDialog(cat.value, menu.plan_id)}
                      >
                        {menu.plan_id ? "Change Plan" : "Link Plan"}
                      </Button>
                    </div>
                  )}
                  {renderWeekGrid(menu)}
                </>
              ) : (
                <Card className="p-space-12 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-space-4" />
                  <CardTitle className="mb-space-2">No {cat.label} Menu</CardTitle>
                  <p className="text-muted-foreground mb-space-4">
                    Create a {cat.label.toLowerCase()} menu for this week
                  </p>
                  <Button onClick={() => createMenuMutation.mutate(cat.value)} loading={createMenuMutation.isPending}>
                    {!createMenuMutation.isPending && <Plus className="h-4 w-4" />}
                    Create {cat.label} Menu
                  </Button>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Item Dialog */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItemId ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
            <DialogDescription>
              {selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)} - {selectedMealType.charAt(0).toUpperCase() + selectedMealType.slice(1)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-space-4">
            <div>
              <Label htmlFor="itemName">Item Name *</Label>
              <Input
                id="itemName"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g., Grilled Chicken Salad"
              />
            </div>
            
            <div>
              <Label htmlFor="itemDesc">Description</Label>
              <Textarea
                id="itemDesc"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Brief description..."
                rows={2}
              />
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-space-2 mt-space-2">
                {TAGS.map((tag) => (
                  <div key={tag} className="flex items-center gap-space-1">
                    <Checkbox
                      id={tag}
                      checked={itemTags.includes(tag)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setItemTags([...itemTags, tag]);
                        } else {
                          setItemTags(itemTags.filter(t => t !== tag));
                        }
                      }}
                    />
                    <Label htmlFor={tag} className="text-sm capitalize cursor-pointer">
                      {tag.replace("_", " ")}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Image</Label>
              <div className="mt-space-2">
                {itemImage ? (
                  <div className="relative inline-block">
                    <img src={itemImage} alt="" className="w-24 h-24 object-cover rounded" />
                    <Button
                      variant="destructive"
                      size="iconXs"
                      className="absolute -top-2 -right-2"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      loading={isUploading}
                    >
                      {!isUploading && <Upload className="h-4 w-4" />}
                      Upload Image
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-space-2">
            {editingItemId && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteItemMutation.mutate(editingItemId);
                  closeItemDialog();
                }}
                disabled={deleteItemMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={closeItemDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveItem} loading={addItemMutation.isPending || updateItemMutation.isPending}>
              {editingItemId ? "Update" : "Add"} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Plan Dialog */}
      <Dialog open={isLinkPlanDialogOpen} onOpenChange={setIsLinkPlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Subscription Plan</DialogTitle>
            <DialogDescription>
              Choose which subscription plan uses the {linkPlanCategory.replace("_", " ")} menu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-space-4">
            <Select value={selectedPlanId || ""} onValueChange={(v) => setSelectedPlanId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No plan linked</SelectItem>
                {getPlansForCategory(linkPlanCategory).map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} {plan.is_active ? "" : "(inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeLinkPlanDialog}>Cancel</Button>
            <Button onClick={handleLinkPlan} loading={linkPlanMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RestaurantAdminLayout>
  );
};

export default MenuManagementPage;
