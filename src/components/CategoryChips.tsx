import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  Utensils, 
  Leaf, 
  Salad, 
  Flame, 
  WheatOff, 
  Milk 
} from "lucide-react";
import { TranslationKey, useI18n } from "@/i18n";

interface Category {
  id: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
}

const categories: Category[] = [
  { id: "all", labelKey: "category.all", icon: Utensils },
  { id: "standard", labelKey: "category.standard", icon: Utensils },
  { id: "vegetarian", labelKey: "category.vegetarian", icon: Leaf },
  { id: "vegan", labelKey: "category.vegan", icon: Salad },
  { id: "keto", labelKey: "category.keto", icon: Flame },
  { id: "gluten_free", labelKey: "category.glutenFree", icon: WheatOff },
  { id: "lactose_free", labelKey: "category.lactoseFree", icon: Milk },
];

interface CategoryChipsProps {
  selected: string;
  onSelect: (id: string) => void;
  className?: string;
  rightContent?: React.ReactNode;
}

export function CategoryChips({ selected, onSelect, className, rightContent }: CategoryChipsProps) {
  const { t } = useI18n();

  return (
    <div className={cn("market-category-rail flex items-center gap-0 overflow-x-auto scrollbar-hide", className)}>
      <div className="flex min-w-0 flex-1 gap-0 overflow-x-auto scrollbar-hide">
        {categories.map((category) => (
          <Button
            key={category.id}
            type="button"
            variant="chip"
            size="chip"
            data-state={selected === category.id ? "active" : "inactive"}
            onClick={() => onSelect(category.id)}
          >
            <span className="whitespace-nowrap">{t(category.labelKey)}</span>
          </Button>
        ))}
      </div>
      {rightContent && (
        <div className="shrink-0 pl-space-1">
          {rightContent}
        </div>
      )}
    </div>
  );
}
