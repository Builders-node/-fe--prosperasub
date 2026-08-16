import { LayoutDashboard, Truck, type LucideIcon } from "lucide-react";

/**
 * What a business does that changes the app's behaviour.
 *
 * `providers.capabilities[]` used to list five things and then three, and the
 * workspace read none of them: every provider gets the same tab strip, so
 * "Subscription plans" and "Catalog" were switches wired to nothing. An admin
 * could toggle them, the archetype could default them, approval merged them —
 * and no screen anywhere changed. They are gone.
 *
 * What is left is the one capability something actually reads: `delivery`,
 * which is why the Overview tab shows delivery details. Old values still
 * sitting in the column are ignored on read.
 *
 * Adding a capability here is only honest if some screen branches on it.
 */
export type CapabilityKey = "delivery";

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
