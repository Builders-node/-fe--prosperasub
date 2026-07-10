import { BookOpen, LayoutDashboard, Package, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Provider capabilities — the atomic units of "what a business offers".
 * The provider row in `public.providers.capabilities[]` stores a subset
 * of these keys. UI reads it to decide which tabs to render, which
 * checkout to allow, which admin sections to enable.
 *
 * Booking-related caps (`hourly_bookings`, `date_range_booking`) were retired
 * — every provider now gets the shared UnifiedBookingCalendar tab; the caps
 * no longer gate any UI. Legacy DB values are harmlessly ignored on read.
 *
 * Adding a new capability = add one entry here + wire a tab renderer.
 */
export type CapabilityKey =
  | "subscription_plans"
  | "catalog_items"
  | "delivery";

export interface CapabilityMeta {
  key: CapabilityKey;
  label: string;
  description: string;
  icon: LucideIcon;
  tabValue: string;
  tabLabel: string;
  tabMobileLabel?: string;
}

export const CAPABILITIES: Record<CapabilityKey, CapabilityMeta> = {
  subscription_plans: {
    key: "subscription_plans",
    label: "Subscription plans",
    description: "Recurring memberships / meal plans / packages",
    icon: BookOpen,
    tabValue: "plans",
    tabLabel: "Plans",
  },
  catalog_items: {
    key: "catalog_items",
    label: "Catalog",
    description: "Fixed menu / vehicle fleet / product list",
    icon: Package,
    tabValue: "catalog",
    tabLabel: "Catalog",
  },
  delivery: {
    key: "delivery",
    label: "Delivery",
    description: "Ships items to the customer's address",
    icon: Truck,
    tabValue: "delivery",
    tabLabel: "Delivery",
  },
};

export const ALL_CAPABILITIES: CapabilityMeta[] = Object.values(CAPABILITIES);

/** The one universal tab every provider gets. Named "Overview" everywhere for
 * consistency with the legacy portal shape (Overview → Offerings → Bookings →
 * Operations → Team). Batch 4 will fold the KPI widget in here as well. */
export const INFO_TAB_META = {
  tabValue: "info",
  tabLabel: "Overview",
  tabMobileLabel: "Overview",
  icon: LayoutDashboard,
};

/**
 * Placeholder tab body for capabilities whose real UI hasn't been built
 * yet. Keeps the portal usable end-to-end for new categories even before
 * every capability has its dedicated editor.
 */
export function ComingSoonTab({ capability }: { capability: CapabilityMeta }): ReactNode {
  const I = capability.icon;
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <I className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="font-semibold text-foreground">{capability.label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{capability.description}</p>
      <p className="mt-3 text-xs text-muted-foreground/70">Editor coming soon.</p>
    </div>
  );
}
