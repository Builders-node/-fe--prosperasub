/**
 * Admin Panel navigation — one word per thing, the same word on the page:
 *   Work: Today · Orders · Applications · Support
 *   Catalog: Businesses · Plans · Vehicles · Reviews · Services & categories
 *   People & money: Customers · Finance · Analytics
 *   Marketing: Banners · Collections · Promotions · Promo codes · Discounts · Announcements
 *   Settings: Payments · Locations · Delivery · Tags · Team · Audit log · Diagnostics
 * A URL takes the permission of the nav item that covers it (permissionsForPath).
 */

import {
  BarChart3, CalendarDays, DollarSign,
  BellRing, FileText, Layers, LayoutDashboard, MapPin, Megaphone, Sparkles, TicketPercent,
  LifeBuoy, ShieldCheck, Users, Building2, CarFront, Star, Wrench, LayoutGrid, Tag, Truck,
  Inbox, ListChecks, CreditCard, BadgePercent } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminRoutes } from "./adminRoutes";
import { tr } from "@/lib/tr";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /**
   * Additional URL prefixes that should also mark this nav item as active.
   * Use for pages that live under a different URL but conceptually belong to
   * this section (e.g. Provider applications belongs to Providers).
   */
  alsoActiveOn?: string[];
  /**
   * RBAC permission(s) that make this item usable. The sidebar hides the item
   * unless the admin holds at least one; ProtectedRoute enforces the same list
   * on the route so a pasted URL can't bypass it. Omit for pages every admin
   * may see. Owners hold "*" and always pass.
   */
  permissions?: string[];
  /** A live count shown beside the label (see useAdminNavBadges). */
  badge?: NavBadge;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Grouped by why you go there, not by the table.
 *
 * Work is the daily queue (with counts on Applications and Support, so you do
 * not have to open Today to learn whether there is anything to do). Catalog is
 * what is on sale. People & money is who bought it and what it earned.
 * Marketing grows it. Settings is what you rarely touch.
 *
 * Applications and Plans have their own items: they used to be reachable only
 * through a banner on Businesses or a tab inside Services.
 */
export type NavBadge = "applications" | "support";

export const WORK_SECTION: NavSection = {
  title: tr("Work"),
  items: [
    { label: tr("Today"), path: adminRoutes.superAdminDashboard, icon: LayoutDashboard },
    { label: tr("Orders"), path: adminRoutes.superAdminMarketplaceSubscriptions, icon: CalendarDays,
      permissions: ["subscriptions.read"] },
    { label: tr("Applications"), path: adminRoutes.superAdminProviderApplications, icon: Inbox,
      badge: "applications",
      permissions: ["admin_settings.read"] },
    { label: tr("Support"), path: adminRoutes.superAdminSupport, icon: LifeBuoy,
      badge: "support",
      permissions: ["users.read"] },
  ],
};

export const CATALOG_SECTION: NavSection = {
  title: tr("Catalog"),
  items: [
    { label: tr("Businesses"), path: adminRoutes.superAdminMarketplaceProviders, icon: Building2,
      alsoActiveOn: [
        // Per-service admin pages still reachable by URL (courts, cleaning
        // operations) — listed so they take this item's permission.
        "/admin/beach-club",
        "/admin/cleaning",
        "/admin/food",
      ],
      permissions: ["admin_settings.read"] },
    { label: tr("Plans"), path: adminRoutes.superAdminMarketplacePlans, icon: ListChecks,
      permissions: ["admin_settings.read"] },
    { label: tr("Vehicles"), path: adminRoutes.superAdminTransport, icon: CarFront,
      alsoActiveOn: [adminRoutes.superAdminCarRentals],
      permissions: ["subscriptions.read"] },
    { label: tr("Reviews"), path: adminRoutes.superAdminMarketplaceReviews, icon: Star,
      permissions: ["admin_settings.read"] },
    { label: tr("Services & categories"), path: adminRoutes.superAdminMarketplace, icon: Layers,
      alsoActiveOn: [
        "/admin/marketplace/service",
        adminRoutes.superAdminServices,
      ],
      permissions: ["admin_settings.read"] },
  ],
};

export const PEOPLE_MONEY_SECTION: NavSection = {
  title: tr("People & money"),
  items: [
    { label: tr("Customers"), path: adminRoutes.superAdminUsers, icon: Users,
      alsoActiveOn: ["/admin/customers"],
      permissions: ["users.read"] },
    { label: tr("Finance"),   path: adminRoutes.superAdminPayments,  icon: DollarSign,
      permissions: ["payments.read"] },
    { label: tr("Analytics"), path: adminRoutes.superAdminAnalytics, icon: BarChart3,
      permissions: ["subscriptions.read", "payments.read"] },
  ],
};

export const GROWTH_SECTION: NavSection = {
  title: tr("Marketing"),
  items: [
    { label: tr("Banners"), path: adminRoutes.superAdminAds, icon: Megaphone,
      permissions: ["admin_settings.read"] },
    { label: tr("Collections"), path: adminRoutes.superAdminCollections, icon: LayoutGrid,
      permissions: ["admin_settings.read"] },
    { label: tr("Promotions"), path: adminRoutes.superAdminPromotions, icon: Sparkles,
      permissions: ["payments.read"] },
    { label: tr("Promo codes"), path: adminRoutes.superAdminPromoCodes, icon: TicketPercent,
      permissions: ["payments.read"] },
    { label: tr("Discounts"), path: adminRoutes.superAdminDiscounts, icon: BadgePercent,
      permissions: ["payments.read"] },
    { label: tr("Announcements"), path: adminRoutes.superAdminAnnouncements, icon: BellRing,
      permissions: ["users.read"] },
  ],
};

export const SETTINGS_SECTION: NavSection = {
  title: tr("Settings"),
  items: [
    { label: tr("Payments"), path: adminRoutes.superAdminPaymentSettings, icon: CreditCard,
      permissions: ["payments.read"] },
    { label: tr("Locations"),  path: adminRoutes.superAdminLocations, icon: MapPin,
      permissions: ["admin_settings.read"] },
    { label: tr("Delivery"), path: adminRoutes.superAdminDelivery, icon: Truck,
      permissions: ["admin_settings.read"] },
    { label: tr("Tags"), path: adminRoutes.superAdminTags, icon: Tag,
      permissions: ["admin_settings.read"] },
    { label: tr("Team"), path: adminRoutes.superAdminRoles, icon: ShieldCheck,
      permissions: ["role_management.read"] },
    { label: tr("Audit log"), path: adminRoutes.superAdminAuditLogs, icon: FileText,
      permissions: ["admin_settings.read"] },
    { label: tr("Diagnostics"), path: "/admin/diagnostics", icon: Wrench,
      permissions: ["admin_settings.read"] },
  ],
};

export const NAV_SECTIONS: NavSection[] = [
  WORK_SECTION,
  CATALOG_SECTION,
  PEOPLE_MONEY_SECTION,
  GROWTH_SECTION,
  SETTINGS_SECTION,
];

/**
 * The permissions an admin URL needs, read from the same items the sidebar
 * draws — so hiding a link and guarding its page cannot disagree. The item
 * whose path (or alsoActiveOn) is the LONGEST prefix of the URL wins. A URL no
 * item covers needs no extra permission (being an admin is enough).
 */
export function permissionsForPath(pathname: string): string[] | undefined {
  let best: { len: number; perms?: string[] } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      for (const p of [item.path, ...(item.alsoActiveOn ?? [])]) {
        if ((pathname === p || pathname.startsWith(p + "/")) && (!best || p.length > best.len)) {
          best = { len: p.length, perms: item.permissions };
        }
      }
    }
  }
  return best?.perms;
}
