import {
  Car,
  HeartPulse,
  SparklesIcon,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for every "service category" on the platform.
 *
 * Anything that iterates categories — Discovery tiles, admin sidebar,
 * visibility flags, MySubscriptions, PaymentMethodBadge routing — MUST read
 * from this registry rather than duplicating a hardcoded 4-tuple.
 *
 * Adding a new category (e.g. "Yoga"):
 *   1. Add its entry below.
 *   2. Add its `visibility_key` row in `global_settings` (default true).
 *   3. Add its listing page + checkout page.
 *   4. Add admin sub-nav entries in `adminNav.ts` (uses `icon`/`accent` from here).
 * Discovery, MySubscriptions, and visibility gating pick it up automatically.
 */

export type ServiceKey = "cleaning" | "cars" | "food" | "beach" | "massage";

/**
 * Optional provider-side configuration. Categories where the platform itself
 * *is* the operator (cleaning, beach club) omit this — they don't have
 * third-party providers to onboard.
 *
 * Categories with providers (food/cars/massage/...) share the same lifecycle:
 * anyone applies through /become-a-provider → admin reviews the application
 * → on approval a row is created in the service's `*_providers` table.
 */
export interface ProviderConfig {
  /** Provider table for this service (`food_providers`, `rental_providers`, …). */
  table: string;
  /** Human labels used in Become-a-provider / My Business / admin. */
  labels: {
    singular: string;   // "Restaurant"
    plural: string;     // "Restaurants"
    apply: string;      // "Open your restaurant on ProsperaSub"
  };
  /** Which sections a provider portal should render for this service. */
  features: Array<
    | "info"        // universal name/avatar/banner/location/hours
    | "plans"       // meal plans, massage plans, vehicles, etc.
    | "menu"        // weekly menu (food)
    | "vehicles"    // rental vehicles
    | "bookings"    // paid subscriptions / reservations
    | "staff"       // restaurant/provider staff access
    | "analytics"   // provider analytics
  >;
  /** URL of the admin list page for this provider (per-service admin CRUD). */
  adminListHref: string;
  /** Optional staff/delegated-manager table. Some services only have owners. */
  managerTable?: string;
  /** Route to the provider's own portal page for a specific business. */
  portalRoute?: (providerId: string) => string;
}

export interface ServiceConfig {
  key: ServiceKey;
  label: string;
  icon: LucideIcon;

  // Visual identity (Tailwind classes). Kept together so admin nav, Discovery
  // tiles, and badges stay in sync.
  tint: string;   // Card background (Discovery tiles).
  chip: string;   // Icon chip background.
  accent: string; // Solid accent for admin sidebar dot / badges.

  // Routing.
  tileHref: string;                     // Discovery → listing page.
  detailHref?: (id: string) => string;  // Deep-link into a specific plan/vehicle/etc.
  adminRootHref?: string;               // First admin page for this service.

  // Platform Settings visibility gate.
  visibilityKey: string;                // Row key in `global_settings`.

  // Data layer — where the paid subscriptions live.
  subscriptionsTable: string;
  /** The column that carries subscription lifecycle (differs by legacy table). */
  statusField: "status" | "subscription_status";

  /**
   * Categories that accept third-party providers. Presence of this field is
   * the source of truth for "is this a marketplace category" — Discovery /
   * Become-a-provider / admin / My Business all key off it.
   */
  providers?: ProviderConfig;

  // Optional flags for the UI.
  badge?: string; // e.g. "NEW"
}

export const SERVICES: Record<ServiceKey, ServiceConfig> = {
  cleaning: {
    key: "cleaning",
    label: "Cleaning",
    icon: SparklesIcon,
    tint: "bg-sky-50 dark:bg-sky-950/40",
    chip: "bg-sky-500",
    accent: "bg-blue-500",
    tileHref: "/cleaning",
    adminRootHref: "/admin/cleaning/plans",
    visibilityKey: "category_cleaning_visible",
    subscriptionsTable: "cleaning_subscriptions",
    statusField: "subscription_status",
    providers: {
      table: "cleaning_providers",
      labels: {
        singular: "Cleaning company",
        plural: "Cleaning companies",
        apply: "Offer cleaning on ProsperaSub",
      },
      features: ["info", "plans", "bookings", "staff"],
      adminListHref: "/admin/cleaning/providers",
      managerTable: "cleaning_provider_managers",
      portalRoute: (id) => `/my-cleaning?providerId=${id}`,
    },
  },
  cars: {
    key: "cars",
    label: "Car Rental",
    icon: Car,
    tint: "bg-orange-50 dark:bg-orange-950/40",
    chip: "bg-orange-500",
    accent: "bg-orange-500",
    tileHref: "/cars",
    adminRootHref: "/admin/car-rentals/providers",
    visibilityKey: "category_cars_visible",
    subscriptionsTable: "rental_bookings",
    statusField: "status",
    providers: {
      table: "rental_providers",
      labels: {
        singular: "Rental agency",
        plural: "Rental agencies",
        apply: "List your rental fleet on ProsperaSub",
      },
      features: ["info", "vehicles", "bookings", "staff"],
      adminListHref: "/admin/car-rentals/providers",
      managerTable: "rental_provider_managers",
      portalRoute: (id) => `/my-car-rental?providerId=${id}`,
    },
  },
  food: {
    key: "food",
    label: "Food",
    icon: UtensilsCrossed,
    tint: "bg-emerald-50 dark:bg-emerald-950/40",
    chip: "bg-emerald-500",
    accent: "bg-orange-500",
    tileHref: "/food",
    adminRootHref: "/admin/food/providers",
    visibilityKey: "category_food_visible",
    subscriptionsTable: "food_subscriptions",
    statusField: "status",
    providers: {
      table: "food_providers",
      labels: {
        singular: "Restaurant",
        plural: "Restaurants",
        apply: "Open your restaurant on ProsperaSub",
      },
      features: ["info", "plans", "menu", "bookings", "staff", "analytics"],
      adminListHref: "/admin/food/providers",
      managerTable: "food_restaurant_managers",
      portalRoute: (id) => `/my-restaurant?providerId=${id}`,
    },
  },
  beach: {
    key: "beach",
    label: "Beach Club",
    icon: Waves,
    tint: "bg-cyan-50 dark:bg-cyan-950/40",
    chip: "bg-cyan-500",
    accent: "bg-cyan-500",
    tileHref: "/beach-club",
    adminRootHref: "/admin/beach-club/plans",
    visibilityKey: "category_beach_visible",
    subscriptionsTable: "beach_club_subscriptions",
    statusField: "status",
  },
  massage: {
    key: "massage",
    label: "Massage",
    icon: HeartPulse,
    tint: "bg-rose-50 dark:bg-rose-950/40",
    chip: "bg-rose-500",
    accent: "bg-rose-500",
    tileHref: "/massage",
    adminRootHref: "/admin/massage/providers",
    visibilityKey: "category_massage_visible",
    subscriptionsTable: "massage_subscriptions",
    statusField: "status",
    badge: "NEW",
    providers: {
      table: "massage_providers",
      labels: {
        singular: "Massage practice",
        plural: "Massage practices",
        apply: "Offer massage on ProsperaSub",
      },
      features: ["info", "plans", "bookings", "staff"],
      adminListHref: "/admin/massage/providers",
      // No portalRoute yet — massage-side owner portal not built. Providers
      // still show up in listings; the row just won't link anywhere until
      // /my-massage exists.
    },
  },
};

/** Convenience: services that accept third-party provider applications. */
export const PROVIDER_SERVICES: ServiceConfig[] = Object.values(SERVICES).filter(
  (s): s is ServiceConfig & { providers: ProviderConfig } => Boolean(s.providers),
);

/** Stable iteration order for tiles / lists. */
export const SERVICE_KEYS: ServiceKey[] = [
  "cleaning", "cars", "food", "beach", "massage",
];

/** All service configs in the registry's canonical order. */
export const ALL_SERVICES: ServiceConfig[] = SERVICE_KEYS.map((k) => SERVICES[k]);

/** Map of visibility key → service key, used by useServiceVisibility. */
export const VISIBILITY_KEY_TO_SERVICE: Record<string, ServiceKey> =
  Object.fromEntries(ALL_SERVICES.map((s) => [s.visibilityKey, s.key])) as Record<string, ServiceKey>;
