/**
 * Admin Panel navigation. Kept intentionally compact so the sidebar stays
 * scannable. Cross-cutting things collapse into ONE page with tabs, not a
 * separate nav entry:
 *   Marketplace → hub of services; each opens Categories · Providers · Plans ·
 *                 Applications, all scoped to that service. Cross-service
 *                 lists hang off the hub's footer, not the sidebar.
 *   People      → Users (with a Cleaning-clients tab)
 */

import {
  BarChart3, CalendarDays, DollarSign,
  BellRing, FileText, Layers, LayoutDashboard, MapPin, Megaphone, TicketPercent,
  LifeBuoy, ShieldCheck, Users, Building2, CarFront, Star, Wrench, } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminRoutes } from "./adminRoutes";

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
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// ─── OVERVIEW ───────────────────────────────────────────────────────────
/**
 * Grouped by the job, not by the table.
 *
 * The old groups were the data model — Overview / Marketplace / Vehicles /
 * People / Settings — so marketing lived in three places (Promo codes under
 * Marketplace, Announcements under People, Ads under Settings), Reviews had
 * no entry at all, and a whole section held one item. Now: what needs you,
 * the businesses you run, what they sold, who bought it, the money, growing
 * it, and the settings you rarely touch.
 */
export const TODAY_SECTION: NavSection = {
  title: "Today",
  items: [
    { label: "Today", path: adminRoutes.superAdminDashboard, icon: LayoutDashboard },
  ],
};

export const BUSINESSES_SECTION: NavSection = {
  title: "Businesses",
  items: [
    { label: "Businesses", path: adminRoutes.superAdminMarketplace, icon: Layers,
      alsoActiveOn: [
        "/admin/marketplace/service",
        adminRoutes.superAdminServices,
        adminRoutes.superAdminMarketplacePlans,
        adminRoutes.superAdminMarketplaceProviders,
        adminRoutes.superAdminProviderApplications,
      ],
      permissions: ["admin_settings.read"] },
    { label: "Vehicles", path: adminRoutes.superAdminTransport, icon: CarFront,
      alsoActiveOn: [adminRoutes.superAdminCarRentals, "/admin/marketplace/service/vehicles"],
      permissions: ["subscriptions.read"] },
  ],
};

export const SALES_SECTION: NavSection = {
  title: "Sales",
  items: [
    { label: "Subscriptions", path: adminRoutes.superAdminMarketplaceSubscriptions, icon: CalendarDays,
      permissions: ["subscriptions.read"] },
    { label: "Promo codes", path: adminRoutes.superAdminPromoCodes, icon: TicketPercent,
      permissions: ["payments.read"] },
  ],
};

export const CUSTOMERS_SECTION: NavSection = {
  title: "Customers",
  items: [
    { label: "Customers", path: adminRoutes.superAdminUsers, icon: Users,
      alsoActiveOn: [adminRoutes.superAdminClients, "/admin/customers"],
      permissions: ["users.read"] },
    { label: "Support", path: adminRoutes.superAdminSupport, icon: LifeBuoy,
      permissions: ["users.read"] },
  ],
};

export const MONEY_SECTION: NavSection = {
  title: "Money",
  items: [
    { label: "Finance",   path: adminRoutes.superAdminPayments,  icon: DollarSign,
      permissions: ["payments.read"] },
    { label: "Analytics", path: adminRoutes.superAdminAnalytics, icon: BarChart3,
      permissions: ["subscriptions.read", "payments.read"] },
  ],
};

export const GROWTH_SECTION: NavSection = {
  title: "Growth",
  items: [
    { label: "Announcements", path: adminRoutes.superAdminAnnouncements, icon: BellRing,
      permissions: ["users.read"] },
    { label: "Ads", path: adminRoutes.superAdminAds, icon: Megaphone,
      permissions: ["admin_settings.read"] },
    { label: "Reviews", path: adminRoutes.superAdminMarketplaceReviews, icon: Star,
      permissions: ["admin_settings.read"] },
  ],
};

export const SETTINGS_SECTION: NavSection = {
  title: "Settings",
  items: [
    { label: "Locations",  path: adminRoutes.superAdminLocations, icon: MapPin,
      permissions: ["admin_settings.read"] },
    { label: "Team & roles", path: adminRoutes.superAdminRoles, icon: ShieldCheck,
      permissions: ["role_management.read"] },
    { label: "Audit log", path: adminRoutes.superAdminAuditLogs, icon: FileText,
      permissions: ["admin_settings.read"] },
    { label: "Diagnostics", path: "/admin/diagnostics", icon: Wrench,
      permissions: ["admin_settings.read"] },
  ],
};

export const NAV_SECTIONS: NavSection[] = [
  TODAY_SECTION,
  BUSINESSES_SECTION,
  SALES_SECTION,
  CUSTOMERS_SECTION,
  MONEY_SECTION,
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
