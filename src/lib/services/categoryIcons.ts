import {
  Car, ChefHat, Droplets, Dumbbell, Flower2, GraduationCap, HeartPulse,
  Home, ShoppingBag, SparklesIcon, Store, Trophy, UtensilsCrossed,
  Waves, Wrench, type LucideIcon,
} from "lucide-react";

/**
 * Curated list of icons available for service categories.
 * Categories store an `icon` string in the DB; this map resolves it to a
 * Lucide component at render time. Adding a new icon = add one line here.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "sparkles":         SparklesIcon,
  "utensils-crossed": UtensilsCrossed,
  "chef-hat":         ChefHat,
  "car":              Car,
  "heart-pulse":      HeartPulse,
  // Spa/wellness. heart-pulse is the only near neighbour already here and it
  // reads as medical, which a massage room is not.
  "flower-2":         Flower2,
  "waves":            Waves,
  // Drinking-water delivery (Sun Water).
  "droplets":         Droplets,
  "trophy":           Trophy,
  "dumbbell":         Dumbbell,
  "graduation-cap":   GraduationCap,
  "home":             Home,
  "shopping-bag":     ShoppingBag,
  "store":            Store,
  "wrench":           Wrench,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

/** Resolve an icon string with a safe fallback (Store) for unknown values. */
export function resolveCategoryIcon(key: string | null | undefined): LucideIcon {
  return (key && CATEGORY_ICONS[key]) || Store;
}

// No accent palette: a service is told apart by its icon on bg-inset, not by a
// colour of its own (DESIGN.md — one accent). The DB's `accent` column is left
// in place for old rows and no longer read for display.
