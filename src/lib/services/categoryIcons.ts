import {
  Car, ChefHat, Dumbbell, GraduationCap, HeartPulse,
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
  "waves":            Waves,
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

/**
 * Accent color options for category badges. Matches the Tailwind palette
 * already used across the app; the value is a raw `bg-*` class kept as text
 * so it can round-trip through the DB.
 */
export const CATEGORY_ACCENTS = [
  { value: "bg-blue-500",    label: "Blue"    },
  { value: "bg-emerald-500", label: "Emerald" },
  { value: "bg-orange-500",  label: "Orange"  },
  { value: "bg-rose-500",    label: "Rose"    },
  { value: "bg-cyan-500",    label: "Cyan"    },
  { value: "bg-amber-500",   label: "Amber"   },
  { value: "bg-purple-500",  label: "Purple"  },
  { value: "bg-lime-500",    label: "Lime"    },
];
