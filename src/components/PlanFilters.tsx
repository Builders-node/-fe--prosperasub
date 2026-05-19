import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { SlidersHorizontal, X, Truck, Sun, Coffee, Moon, Leaf, Salad, Flame, WheatOff, Milk } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatUSD } from "@/lib/pricing";
import { TranslationKey, useI18n } from "@/i18n";

export interface PlanFiltersState {
  supportsDelivery: boolean | null;
  mealTime: "breakfast" | "lunch" | "dinner" | null;
  menuCategory: string | null;
  maxPricePerWeek: number | null;
}

const initialFilters: PlanFiltersState = {
  supportsDelivery: null,
  mealTime: null,
  menuCategory: null,
  maxPricePerWeek: null,
};

const mealTimeOptions: Array<{ value: "breakfast" | "lunch" | "dinner"; labelKey: TranslationKey; icon: typeof Coffee }> = [
  { value: "breakfast", labelKey: "meal.breakfast", icon: Coffee },
  { value: "lunch", labelKey: "meal.lunch", icon: Sun },
  { value: "dinner", labelKey: "meal.dinner", icon: Moon },
] as const;

const dietaryOptions = [
  { value: "standard", labelKey: "diet.standard", icon: null },
  { value: "vegetarian", labelKey: "diet.vegetarian", icon: Leaf },
  { value: "vegan", labelKey: "diet.vegan", icon: Salad },
  { value: "keto", labelKey: "diet.keto", icon: Flame },
  { value: "gluten_free", labelKey: "diet.glutenFree", icon: WheatOff },
  { value: "lactose_free", labelKey: "diet.lactoseFree", icon: Milk },
] as const;

interface PlanFiltersProps {
  filters: PlanFiltersState;
  onFiltersChange: (filters: PlanFiltersState) => void;
  className?: string;
}

export function PlanFilters({ filters, onFiltersChange, className }: PlanFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const { t } = useI18n();
  
  const activeFilterCount = [
    filters.supportsDelivery !== null,
    filters.mealTime !== null,
    filters.menuCategory !== null,
    filters.maxPricePerWeek !== null,
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof PlanFiltersState>(
    key: K,
    value: PlanFiltersState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange(initialFilters);
  };

  const toggleMealTime = (value: "breakfast" | "lunch" | "dinner") => {
    updateFilter("mealTime", filters.mealTime === value ? null : value);
  };

  const toggleCategory = (value: string) => {
    updateFilter("menuCategory", filters.menuCategory === value ? null : value);
  };

  const filterContent = (
    <>
      <div className="flex-1 overflow-y-auto space-y-space-8 pr-space-2">
        {/* Delivery Toggle */}
        <div className="space-y-space-3">
          <Label className="text-body flex items-center gap-space-2">
            <Truck className="h-4 w-4" />
            {t("filters.deliveryAvailable")}
          </Label>
          <div className="flex items-center gap-space-3">
            <Switch
              checked={filters.supportsDelivery === true}
              onCheckedChange={(checked) => updateFilter("supportsDelivery", checked ? true : null)}
            />
            <span className="text-sm text-muted-foreground">
              {t("filters.deliveryOnly")}
            </span>
          </div>
        </div>

        {/* Meal Time */}
        <div className="space-y-space-3">
          <Label className="text-body">{t("filters.mealTime")}</Label>
          <div className="flex gap-space-2 flex-wrap">
            {mealTimeOptions.map((option) => (
              <Button
                key={option.value}
                variant={filters.mealTime === option.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => toggleMealTime(option.value)}
              >
                <option.icon className="h-4 w-4" />
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </div>

        {/* Dietary Preferences */}
        <div className="space-y-space-3">
          <Label className="text-body">{t("filters.dietaryPreference")}</Label>
          <div className="flex gap-space-2 flex-wrap">
            {dietaryOptions.map((option) => (
              <Button
                key={option.value}
                variant={filters.menuCategory === option.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => toggleCategory(option.value)}
              >
                {option.icon && <option.icon className="h-4 w-4" />}
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </div>

        {/* Price Range */}
        <div className="space-y-space-4">
          <Label className="text-body">
            {t("filters.maxPrice")}
            {filters.maxPricePerWeek && (
              <span className="font-normal text-muted-foreground ml-2">
                (≤ {formatUSD(filters.maxPricePerWeek)})
              </span>
            )}
          </Label>
          <Slider
            value={[filters.maxPricePerWeek || 10000]}
            onValueChange={([value]) => updateFilter("maxPricePerWeek", value === 10000 ? null : value)}
            min={500}
            max={10000}
            step={500}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$5</span>
            <span>{t("filters.noLimit")}</span>
          </div>
        </div>
      </div>

      {/* Sticky button at bottom */}
      <div className="sticky bottom-0 pt-space-4 pb-space-2 bg-background border-t mt-space-4">
        <Button className="w-full" onClick={() => setIsOpen(false)}>
          {t("filters.apply")}
        </Button>
      </div>
    </>
  );

  return (
    <div className={cn("flex items-center gap-space-2", className)}>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="tertiary"
            size="chip"
            className="relative bg-background hover:bg-background/90"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("filters.title")}
            {activeFilterCount > 0 && (
              <Badge 
                variant="default" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent 
          side={isMobile ? "bottom" : "right"} 
          className={cn(
            "flex flex-col",
            isMobile ? "h-screen w-screen max-w-none rounded-none" : "w-[400px] sm:w-[540px]"
          )}
        >
          <SheetHeader className="mb-space-6">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-display">{t("filters.panelTitle")}</SheetTitle>
              {activeFilterCount > 0 && (
                <Button variant="tertiary" size="sm" onClick={clearFilters} className="text-destructive hover:text-destructive">
                  {t("filters.clearAll")}
                </Button>
              )}
            </div>
          </SheetHeader>
          
          {filterContent}
        </SheetContent>
      </Sheet>

      {/* Quick filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex gap-space-2 overflow-x-auto scrollbar-hide">
          {filters.supportsDelivery && (
            <Badge variant="secondary" className="gap-space-1 cursor-pointer" onClick={() => updateFilter("supportsDelivery", null)}>
              <Truck className="h-3 w-3" />
              {t("filters.delivery")}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.mealTime && (
            <Badge variant="secondary" className="gap-space-1 cursor-pointer" onClick={() => updateFilter("mealTime", null)}>
              {t(mealTimeOptions.find((option) => option.value === filters.mealTime)?.labelKey || "filters.mealTime")}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.menuCategory && (
            <Badge variant="secondary" className="gap-space-1 cursor-pointer" onClick={() => updateFilter("menuCategory", null)}>
              {t(dietaryOptions.find((option) => option.value === filters.menuCategory)?.labelKey || "filters.dietaryPreference")}
              <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export { initialFilters };
