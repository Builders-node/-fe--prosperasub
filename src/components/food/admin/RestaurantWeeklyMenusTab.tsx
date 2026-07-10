import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Edit, Trash2, ChevronDown, ChevronUp,
  Coffee, Sun, Moon, Apple, UtensilsCrossed, Flame, X,
  Copy, Eye, ImagePlus,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { ImageField } from "@/components/food/ImageField";
import { WeeklyMenuDisplay } from "@/components/food/WeeklyMenuDisplay";
import { getMealTypesForPlan, formatWeekLabel, addDaysToDate } from "@/lib/foodUtils";
import type {
  FoodWeeklyMenu, FoodMenuMeal, FoodMealPlan, DayOfWeek, MealType,
} from "@/types/food";
import { DAY_LABELS, DAYS_OF_WEEK, MEAL_TYPE_LABELS } from "@/types/food";

const MEAL_TYPE_META: Record<MealType, { icon: React.ReactNode; color: string }> = {
  breakfast: { icon: <Coffee  className="h-3.5 w-3.5" />, color: "text-amber-400"  },
  lunch:     { icon: <Sun     className="h-3.5 w-3.5" />, color: "text-yellow-400" },
  dinner:    { icon: <Moon    className="h-3.5 w-3.5" />, color: "text-indigo-400" },
  snack:     { icon: <Apple   className="h-3.5 w-3.5" />, color: "text-green-400"  },
  other:     { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
  meal:      { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, color: "text-muted-foreground" },
};

type MenuWithMeals = FoodWeeklyMenu & {
  meals: FoodMenuMeal[];
  plan: FoodMealPlan | null;
};

interface Props {
  providerId: string;
  providerName: string;
}

export function RestaurantWeeklyMenusTab({ providerId, providerName }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});

  const [menuDialog, setMenuDialog] = useState<{
    open: boolean; isNew: boolean; menu: MenuWithMeals | null;
  }>({ open: false, isNew: true, menu: null });
  const [menuForm, setMenuForm] = useState<{
    meal_plan_id: string;
    week_start_date: string;
    is_published: boolean;
    delivery_times: Record<string, string>;
  }>({
    meal_plan_id: "", week_start_date: "", is_published: false, delivery_times: {},
  });

  const [mealDialog, setMealDialog] = useState<{
    open: boolean; meal: FoodMenuMeal | null;
  }>({ open: false, meal: null });
  const [mealForm, setMealForm] = useState({
    meal_name: "", meal_description: "", image_url: "", calories: "",
  });

  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean; menu: MenuWithMeals | null;
  }>({ open: false, menu: null });
  const [duplicateDate, setDuplicateDate] = useState("");

  const [previewMenu, setPreviewMenu] = useState<MenuWithMeals | null>(null);
  const [deleteMenuTarget, setDeleteMenuTarget] = useState<MenuWithMeals | null>(null);
  const [deleteMealTarget, setDeleteMealTarget] = useState<FoodMenuMeal | null>(null);

  // Plans (scoped to this restaurant)
  const { data: plans = [] } = useQuery({
    queryKey: ["admin-food-meal-plans", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_meal_plans")
        .select("*")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FoodMealPlan[];
    },
  });

  // Menus (scoped to this restaurant). The plan is resolved at render time (below)
  // from the loaded plans — attaching it inside the query caused a stale-closure
  // race: menus loaded before plans showed "All plans" + wrong meal-type columns.
  const { data: rawMenus = [], isLoading } = useQuery({
    queryKey: ["admin-food-menus", providerId],
    queryFn: async () => {
      const { data: mData, error } = await supabaseDb
        .from("food_weekly_menus")
        .select("*")
        .eq("provider_id", providerId)
        .order("week_start_date", { ascending: false });
      if (error) throw error;
      if (!mData?.length) return [] as (FoodWeeklyMenu & { meals: FoodMenuMeal[] })[];

      const ids = mData.map((m) => m.id);
      const { data: meals } = await supabaseDb
        .from("food_menu_meals").select("*")
        .in("menu_id", ids).order("sort_order", { ascending: true });

      const mealMap: Record<string, FoodMenuMeal[]> = {};
      (meals ?? []).forEach((m: FoodMenuMeal) => {
        if (!mealMap[m.menu_id]) mealMap[m.menu_id] = [];
        mealMap[m.menu_id].push(m);
      });

      return mData.map((m: FoodWeeklyMenu) => ({
        ...m,
        meals: mealMap[m.id] ?? [],
      })) as (FoodWeeklyMenu & { meals: FoodMenuMeal[] })[];
    },
  });

  const menus = useMemo<MenuWithMeals[]>(() => {
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
    return rawMenus.map((m) => ({
      ...m,
      plan: m.meal_plan_id ? (planById[m.meal_plan_id] ?? null) : null,
    }));
  }, [rawMenus, plans]);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const saveMenuMutation = useMutation({
    mutationFn: async () => {
      // Only keep delivery times for meal types this plan actually serves.
      const planMealTypes = getMealTypesForPlan(
        plans.find((p) => p.id === menuForm.meal_plan_id) ?? null,
      );
      const delivery_times = Object.fromEntries(
        Object.entries(menuForm.delivery_times).filter(
          ([type, time]) => time && planMealTypes.includes(type as MealType),
        ),
      );
      const payload = {
        provider_id: providerId,
        meal_plan_id: menuForm.meal_plan_id || null,
        week_start_date: menuForm.week_start_date,
        is_published: menuForm.is_published,
        delivery_times,
        updated_at: new Date().toISOString(),
      };
      if (menuDialog.isNew) {
        const { data, error } = await supabaseDb
          .from("food_weekly_menus").insert(payload).select("id").single();
        if (error) throw error;
        await logAuditEvent(userData!.id, "create", "food_weekly_menu", data.id, payload);
      } else {
        const { error } = await supabaseDb
          .from("food_weekly_menus").update(payload).eq("id", menuDialog.menu!.id);
        if (error) throw error;
        await logAuditEvent(userData!.id, "edit", "food_weekly_menu", menuDialog.menu!.id, payload);
      }
    },
    onSuccess: () => {
      toast.success(menuDialog.isNew ? "Menu created" : "Menu updated");
      qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
      setMenuDialog({ open: false, isNew: true, menu: null });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMenuMutation = useMutation({
    mutationFn: async (m: MenuWithMeals) => {
      const { error } = await supabaseDb.from("food_weekly_menus").delete().eq("id", m.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "delete", "food_weekly_menu", m.id, {});
    },
    onSuccess: () => {
      toast.success("Menu deleted");
      qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
      setDeleteMenuTarget(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const togglePublish = async (id: string, is_published: boolean) => {
    const { error } = await supabaseDb
      .from("food_weekly_menus")
      .update({ is_published, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(is_published ? "Menu published" : "Menu unpublished");
      qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
    }
  };

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!duplicateDialog.menu) return;
      const { data: newMenu, error } = await supabaseDb
        .from("food_weekly_menus")
        .insert({
          provider_id: providerId,
          meal_plan_id: duplicateDialog.menu.meal_plan_id,
          week_start_date: duplicateDate,
          is_published: false,
          delivery_times: duplicateDialog.menu.delivery_times ?? {},
        })
        .select("id").single();
      if (error) throw error;

      const sourceMeals = duplicateDialog.menu.meals;
      if (sourceMeals.length > 0) {
        const newMeals = sourceMeals.map((m) => ({
          menu_id: newMenu.id,
          day_of_week: m.day_of_week,
          meal_type: m.meal_type,
          meal_name: m.meal_name,
          meal_description: m.meal_description,
          image_url: m.image_url,
          calories: m.calories,
          sort_order: m.sort_order,
        }));
        const { error: mealsErr } = await supabaseDb.from("food_menu_meals").insert(newMeals);
        if (mealsErr) throw mealsErr;
      }
      await logAuditEvent(userData!.id, "create", "food_weekly_menu", newMenu.id, {
        duplicated_from: duplicateDialog.menu.id, week_start_date: duplicateDate,
      });
    },
    onSuccess: () => {
      toast.success(`Menu duplicated to week of ${formatWeekLabel(duplicateDate)}`);
      qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
      setDuplicateDialog({ open: false, menu: null });
    },
    onError: (e) => toast.error(String(e)),
  });

  const saveMealDetailMutation = useMutation({
    mutationFn: async () => {
      if (!mealDialog.meal) return;
      const payload = {
        meal_name: mealForm.meal_name.trim(),
        meal_description: mealForm.meal_description.trim() || null,
        image_url: mealForm.image_url.trim() || null,
        calories: mealForm.calories ? parseInt(mealForm.calories) : null,
      };
      const { error } = await supabaseDb
        .from("food_menu_meals").update(payload).eq("id", mealDialog.meal.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_menu_meal", mealDialog.meal.id, payload);
    },
    onSuccess: () => {
      toast.success("Dish updated");
      qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
      setMealDialog({ open: false, meal: null });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMealMutation = useMutation({
    mutationFn: async (meal: FoodMenuMeal) => {
      const { error } = await supabaseDb.from("food_menu_meals").delete().eq("id", meal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dish removed");
      qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
      setDeleteMealTarget(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  // Quick add
  const quickAdd = async (menuId: string, day: DayOfWeek, mealType: MealType) => {
    const key = `${menuId}_${day}_${mealType}`;
    const name = (addInputs[key] ?? "").trim();
    if (!name) return;
    const menu = menus.find((m) => m.id === menuId);
    const sortOrder = (menu?.meals ?? []).filter(
      (m) => m.day_of_week === day && m.meal_type === mealType,
    ).length;
    const { error } = await supabaseDb.from("food_menu_meals").insert({
      menu_id: menuId, day_of_week: day, meal_type: mealType,
      meal_name: name, sort_order: sortOrder,
    });
    if (error) { toast.error(error.message); return; }
    setAddInputs((prev) => ({ ...prev, [key]: "" }));
    qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] });
  };

  // Open handlers
  const openNewMenu = () => {
    setMenuForm({ meal_plan_id: "", week_start_date: "", is_published: false, delivery_times: {} });
    setMenuDialog({ open: true, isNew: true, menu: null });
  };
  const openEditMenu = (menu: MenuWithMeals) => {
    setMenuForm({
      meal_plan_id: menu.meal_plan_id ?? "",
      week_start_date: menu.week_start_date,
      is_published: menu.is_published,
      delivery_times: menu.delivery_times ?? {},
    });
    setMenuDialog({ open: true, isNew: false, menu });
  };
  const openDuplicate = (menu: MenuWithMeals) => {
    setDuplicateDate(addDaysToDate(menu.week_start_date, 7));
    setDuplicateDialog({ open: true, menu });
  };
  const openEditMeal = (meal: FoodMenuMeal) => {
    setMealForm({
      meal_name: meal.meal_name,
      meal_description: meal.meal_description ?? "",
      image_url: meal.image_url ?? "",
      calories: meal.calories ? String(meal.calories) : "",
    });
    setMealDialog({ open: true, meal });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Weekly Menus</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build menus with dishes per meal type and day
          </p>
        </div>
        <Button onClick={openNewMenu} className="gap-2 rounded-full">
          <Plus className="h-4 w-4" /> New Menu
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : menus.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-14 text-center">
          <UtensilsCrossed className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold">No menus yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create a weekly menu to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {menus.map((menu) => {
            const isExpanded = expandedMenuId === menu.id;
            const mealTypes = getMealTypesForPlan(menu.plan);
            const totalDishes = menu.meals.filter((m) => mealTypes.includes(m.meal_type)).length;
            const daysWithContent = DAYS_OF_WEEK.filter((d) =>
              menu.meals.some((m) => m.day_of_week === d && mealTypes.includes(m.meal_type)),
            ).length;

            return (
              <div key={menu.id} className="overflow-hidden rounded-2xl bg-card">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {menu.plan ? (
                        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
                          {menu.plan.name} · {mealTypes.map((t) => MEAL_TYPE_LABELS[t]).join(" + ")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          All plans
                        </span>
                      )}
                      <span className="font-semibold text-foreground">
                        Week of {formatWeekLabel(menu.week_start_date)}
                      </span>
                      <Badge className={`rounded-full text-xs ${
                        menu.is_published
                          ? "bg-green-500/15 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {menu.is_published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {totalDishes} dish{totalDishes !== 1 ? "es" : ""} · {daysWithContent} day{daysWithContent !== 1 ? "s" : ""} filled
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 border-t border-border/40 pt-3 sm:border-t-0 sm:pt-0">
                    <Switch checked={menu.is_published}
                      onCheckedChange={(v) => togglePublish(menu.id, v)} />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Preview"
                      onClick={() => setPreviewMenu(menu)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Duplicate"
                      onClick={() => openDuplicate(menu)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditMenu(menu)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteMenuTarget(menu)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => setExpandedMenuId(isExpanded ? null : menu.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border">
                    {DAYS_OF_WEEK.map((day) => (
                      <div key={day} className="border-b border-border last:border-0">
                        <div className="bg-muted/40 px-4 py-2.5">
                          <h3 className="text-sm font-black tracking-wide text-foreground">
                            {DAY_LABELS[day]}
                          </h3>
                        </div>
                        <div className={`grid gap-0 divide-y divide-border/50 ${
                          mealTypes.length === 3
                            ? "md:grid-cols-3 md:divide-x md:divide-y-0"
                            : mealTypes.length === 2
                            ? "md:grid-cols-2 md:divide-x md:divide-y-0"
                            : ""
                        }`}>
                          {mealTypes.map((mealType) => {
                            const key = `${menu.id}_${day}_${mealType}`;
                            const dishes = menu.meals.filter(
                              (m) => m.day_of_week === day && m.meal_type === mealType,
                            );
                            const meta = MEAL_TYPE_META[mealType];

                            return (
                              <div key={mealType} className="flex flex-col gap-2 p-3">
                                <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${meta.color}`}>
                                  {meta.icon}
                                  {MEAL_TYPE_LABELS[mealType]}
                                </div>
                                {dishes.length > 0 && (
                                  <ul className="space-y-1">
                                    {dishes.map((meal) => (
                                      <li key={meal.id} className="group flex items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1.5">
                                        <DishImageButton meal={meal}
                                          onUpdate={() => qc.invalidateQueries({ queryKey: ["admin-food-menus", providerId] })} />
                                        <span className="flex-1 text-sm font-medium text-foreground leading-tight">
                                          {meal.meal_name}
                                        </span>
                                        {meal.calories && (
                                          <span className="shrink-0 text-xs text-orange-400 flex items-center gap-0.5">
                                            <Flame className="h-2.5 w-2.5" />{meal.calories}
                                          </span>
                                        )}
                                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                                            onClick={() => openEditMeal(meal)}>
                                            <Edit className="h-3 w-3" />
                                          </Button>
                                          <Button size="sm" variant="ghost"
                                            className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                                            onClick={() => setDeleteMealTarget(meal)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <input
                                    value={addInputs[key] ?? ""}
                                    onChange={(e) => setAddInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); quickAdd(menu.id, day, mealType); }
                                    }}
                                    placeholder="Add dish…"
                                    className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  <Button size="sm" variant="ghost"
                                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => quickAdd(menu.id, day, mealType)}
                                    disabled={!addInputs[key]?.trim()}>
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Menu create/edit dialog ─────────────────────────────────────── */}
      <Dialog open={menuDialog.open}
        onOpenChange={(o) => { if (!o) setMenuDialog({ open: false, isNew: true, menu: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{menuDialog.isNew ? "New Weekly Menu" : "Edit Menu"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Meal Plan</Label>
              <Select value={menuForm.meal_plan_id || "_none"}
                onValueChange={(v) => setMenuForm((f) => ({ ...f, meal_plan_id: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Any / all plans" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Any / all plans</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.meals_per_day} meal{p.meals_per_day !== 1 ? "s" : ""}/day
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {menuForm.meal_plan_id && (() => {
                const p = plans.find((pl) => pl.id === menuForm.meal_plan_id);
                const types = getMealTypesForPlan(p ?? null);
                return (
                  <p className="mt-1.5 text-xs text-orange-400">
                    Will show: {types.map((t) => MEAL_TYPE_LABELS[t]).join(" + ")}
                  </p>
                );
              })()}
            </div>
            <div>
              <Label>Week Start Date *</Label>
              <Input type="date" value={menuForm.week_start_date}
                onChange={(e) => setMenuForm((f) => ({ ...f, week_start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Delivery times</Label>
              <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
                When each meal is delivered this week. Leave blank if not fixed.
              </p>
              <div className="space-y-2">
                {getMealTypesForPlan(plans.find((p) => p.id === menuForm.meal_plan_id) ?? null).map((type) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="flex w-28 items-center gap-1.5 text-sm">
                      <span className={MEAL_TYPE_META[type].color}>{MEAL_TYPE_META[type].icon}</span>
                      {MEAL_TYPE_LABELS[type]}
                    </span>
                    <Input type="time" className="flex-1"
                      value={menuForm.delivery_times[type] ?? ""}
                      onChange={(e) => setMenuForm((f) => {
                        const next = { ...f.delivery_times };
                        if (e.target.value) next[type] = e.target.value;
                        else delete next[type];
                        return { ...f, delivery_times: next };
                      })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label className="cursor-pointer">Publish immediately</Label>
              <Switch checked={menuForm.is_published}
                onCheckedChange={(v) => setMenuForm((f) => ({ ...f, is_published: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost"
              onClick={() => setMenuDialog({ open: false, isNew: true, menu: null })}>Cancel</Button>
            <Button onClick={() => saveMenuMutation.mutate()}
              disabled={!menuForm.week_start_date || saveMenuMutation.isPending}>
              {saveMenuMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {menuDialog.isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Duplicate dialog ────────────────────────────────────────────── */}
      <Dialog open={duplicateDialog.open}
        onOpenChange={(o) => { if (!o) setDuplicateDialog({ open: false, menu: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Duplicate Menu</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copy all {duplicateDialog.menu?.meals.length ?? 0} dishes from{" "}
              <strong>{formatWeekLabel(duplicateDialog.menu?.week_start_date ?? "")}</strong> to a new week.
            </p>
            <div>
              <Label>New Week Start Date *</Label>
              <Input type="date" value={duplicateDate}
                onChange={(e) => setDuplicateDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDuplicateDialog({ open: false, menu: null })}>Cancel</Button>
            <Button onClick={() => duplicateMutation.mutate()}
              disabled={!duplicateDate || duplicateMutation.isPending}>
              {duplicateMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Preview dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!previewMenu} onOpenChange={(o) => { if (!o) setPreviewMenu(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-orange-400" />
              Customer Preview — {providerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {previewMenu?.plan && (
                <span className="rounded-full bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-400">
                  {previewMenu.plan.name}
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                Week of {formatWeekLabel(previewMenu?.week_start_date ?? "")}
              </span>
              <Badge className={`rounded-full text-xs ${
                previewMenu?.is_published
                  ? "bg-green-500/15 text-green-400"
                  : "bg-yellow-500/15 text-yellow-400"
              }`}>
                {previewMenu?.is_published ? "Published" : "Draft — not visible"}
              </Badge>
            </div>
            {previewMenu && (
              <WeeklyMenuDisplay meals={previewMenu.meals}
                mealTypes={getMealTypesForPlan(previewMenu.plan)}
                weekStartDate={previewMenu.week_start_date}
                showEmptyDays={true} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dish detail edit dialog ─────────────────────────────────────── */}
      <Dialog open={mealDialog.open}
        onOpenChange={(o) => { if (!o) setMealDialog({ open: false, meal: null }); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Dish</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Dish Name *</Label>
              <Input value={mealForm.meal_name}
                onChange={(e) => setMealForm((f) => ({ ...f, meal_name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={mealForm.meal_description}
                onChange={(e) => setMealForm((f) => ({ ...f, meal_description: e.target.value }))}
                rows={2} />
            </div>
            <ImageField label="Dish Photo" value={mealForm.image_url}
              onChange={(url) => setMealForm((f) => ({ ...f, image_url: url }))}
              pathPrefix="food/dishes" variant="card" />
            <div>
              <Label>Calories (kcal)</Label>
              <Input type="number" min={0} value={mealForm.calories}
                onChange={(e) => setMealForm((f) => ({ ...f, calories: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMealDialog({ open: false, meal: null })}>Cancel</Button>
            <Button onClick={() => saveMealDetailMutation.mutate()}
              disabled={!mealForm.meal_name.trim() || saveMealDetailMutation.isPending}>
              {saveMealDetailMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmations ─────────────────────────────────────────── */}
      <AlertDialog open={!!deleteMenuTarget}
        onOpenChange={(o) => { if (!o) setDeleteMenuTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete menu?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the weekly menu and all its dishes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMenuTarget && deleteMenuMutation.mutate(deleteMenuTarget)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteMealTarget}
        onOpenChange={(o) => { if (!o) setDeleteMealTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove dish?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &quot;{deleteMealTarget?.meal_name}&quot; from this menu?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMealTarget && deleteMealMutation.mutate(deleteMealTarget)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Inline image upload button per dish ──────────────────────────────────────
function DishImageButton({ meal, onUpdate }: { meal: FoodMenuMeal; onUpdate: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `food/dishes/${meal.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseDb.storage
        .from("vehicle-images").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabaseDb.storage.from("vehicle-images").getPublicUrl(path);
      const { error: updErr } = await supabaseDb
        .from("food_menu_meals").update({ image_url: data.publicUrl }).eq("id", meal.id);
      if (updErr) throw updErr;
      toast.success("Photo uploaded");
      onUpdate();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabaseDb
      .from("food_menu_meals").update({ image_url: null }).eq("id", meal.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Photo removed");
    onUpdate();
  };

  return (
    <div className="relative shrink-0">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        title={meal.image_url ? "Replace photo" : "Add photo"}
        className={`relative h-7 w-7 rounded-md overflow-hidden border transition-all ${
          meal.image_url
            ? "border-border hover:ring-2 hover:ring-orange-500/50"
            : "border-dashed border-muted-foreground/30 bg-muted/30 hover:border-orange-500/50 hover:bg-orange-500/10"
        } ${uploading ? "opacity-50 cursor-wait" : "cursor-pointer"}`}>
        {uploading ? (
          <Spinner size="xs" className="text-muted-foreground absolute inset-0 m-auto" />
        ) : meal.image_url ? (
          <img src={meal.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-3.5 w-3.5 text-muted-foreground absolute inset-0 m-auto" />
        )}
      </button>
      {meal.image_url && !uploading && (
        <button type="button" onClick={removePhoto}
          className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center"
          title="Remove photo">
          <X className="h-2 w-2" />
        </button>
      )}
    </div>
  );
}
