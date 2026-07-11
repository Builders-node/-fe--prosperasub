import {
  Leaf, Salad, Dumbbell, Beef, Wheat, Heart, Fish, Sun, Baby, WheatOff, Scale, Flame,
  type LucideIcon,
} from "lucide-react";

/**
 * Fixed vocabulary of dietary tags a restaurant can attach to a meal plan.
 * Add a tag → update both this file and the DB CHECK constraint (see the
 * `food_meal_plans_dietary_tags` migration). Keys are what get persisted;
 * label/icon are display-only.
 *
 * Colors follow the same accent tokens used by service archetypes so a Keto
 * chip on the plan card matches other status pills in the app.
 */
export const DIETARY_TAGS = {
  keto:          { label: "Keto",           icon: Flame,     tint: "bg-orange-500/15 text-orange-500" },
  vegan:         { label: "Vegan",          icon: Leaf,      tint: "bg-emerald-500/15 text-emerald-500" },
  vegetarian:    { label: "Vegetarian",     icon: Salad,     tint: "bg-green-500/15 text-green-500" },
  gym:           { label: "Gym",            icon: Dumbbell,  tint: "bg-primary/15 text-primary" },
  high_protein:  { label: "High-protein",   icon: Beef,      tint: "bg-red-500/15 text-red-400" },
  low_carb:      { label: "Low-carb",       icon: Wheat,     tint: "bg-amber-500/15 text-amber-500" },
  diabetic:      { label: "Diabetic",       icon: Heart,     tint: "bg-rose-500/15 text-rose-400" },
  pescatarian:   { label: "Pescatarian",    icon: Fish,      tint: "bg-sky-500/15 text-sky-400" },
  mediterranean: { label: "Mediterranean",  icon: Sun,       tint: "bg-yellow-500/15 text-yellow-400" },
  kids:          { label: "Kids",           icon: Baby,      tint: "bg-fuchsia-500/15 text-fuchsia-400" },
  gluten_free:   { label: "Gluten-free",    icon: WheatOff,  tint: "bg-lime-500/15 text-lime-400" },
  balanced:      { label: "Balanced",       icon: Scale,     tint: "bg-blue-500/15 text-blue-400" },
} as const;

export type DietaryTag = keyof typeof DIETARY_TAGS;

export const DIETARY_TAG_KEYS = Object.keys(DIETARY_TAGS) as DietaryTag[];

export interface DietaryTagMeta {
  label: string;
  icon: LucideIcon;
  tint: string;
}

/** Safe accessor — unknown keys (e.g. legacy) fall back to a neutral chip. */
export function dietaryTagMeta(key: string): DietaryTagMeta | null {
  return (DIETARY_TAGS as Record<string, DietaryTagMeta>)[key] ?? null;
}
