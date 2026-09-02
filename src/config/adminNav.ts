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
  FileText, Layers, LayoutDashboard, MapPin, Megaphone,
  LifeBuoy, ShieldCheck, Users, Building2, } from "lucide-react";
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
export const OVERVIEW_SECTION: NavSection = {
  title: "Overview",
  items: [
    // Dashboard is the landing page for every admin — no permission gate, or a
    // limited role would log in to a redirect loop.
    { label: "Dashboard", path: adminRoutes.superAdminDashboard, icon: LayoutDashboard },
    { label: "Analytics", path: adminRoutes.superAdminAnalytics, icon: BarChart3,
      permissions: ["subscriptions.read", "payments.read"] },
    { label: "Finance",   path: adminRoutes.superAdminPayments,  icon: DollarSign,
      permissions: ["payments.read"] },
  ],
};

// ─── MARKETPLACE — the model itself ─────────────────────────────────────
// Services / Categories / Providers / Plans / Applications are all reached
// through the Marketplace hub — as per-service tabs, or via the hub's footer
// links for the cross-service views. None of them gets a sidebar entry: an
// entry that lands on a page already one click away is pure duplication.
//
// That includes the flat Providers list. It used to be kept as the only way to
// see providers orphaned by a deleted service (`archetype_key` is ON DELETE SET
// NULL) — the hub's "Unassigned" card covers that case now, so the nav entry
// was doing nothing the hub didn't.
//
// Subscriptions stays: it's the transaction ledger, not part of the
// Service → Category → Provider → Plan tree, and appears nowhere in the hub.
export const MARKETPLACE_SECTION: NavSection = {
  title: "Marketplace",
  items: [
    // Cars are NOT listed separately. Every other service is managed inside its
    // provider's workspace — that rule is why Categories, Plans, Applications
    // and Beach courts left this menu — and a rental company is an ordinary
    // provider now. /admin/car-rentals still resolves for old bookmarks and is
    // what the workspace's Fleet tab renders, scoped to one business.
    { label: "Marketplace",   path: adminRoutes.superAdminMarketplace,              icon: Layers,
      // Every flat list is still routable (old bookmarks, links from other
      // pages) — keep the hub lit while the admin is on one of them.
      alsoActiveOn: [
        adminRoutes.superAdminCarRentals,
        "/admin/marketplace/service",
        adminRoutes.superAdminServices,
        adminRoutes.superAdminMarketplacePlans,
        adminRoutes.superAdminMarketplaceProviders,
        adminRoutes.superAdminProviderApplications,
      ],
      permissions: ["admin_settings.read"] },
    { label: "Subscriptions", path: adminRoutes.superAdminMarketplaceSubscriptions, icon: CalendarDays,
      permissions: ["subscriptions.read"] },
  ],
};

// ─── PEOPLE ─────────────────────────────────────────────────────────────
export const PEOPLE_SECTION: NavSection = {
  title: "People",
  items: [
    { label: "Users", path: adminRoutes.superAdminUsers, icon: Users,
      permissions: ["users.read"] },
    // Clients are the businesses and households we bill; Users are individual
    // accounts. Same section, deliberately separate entries.
    { label: "Clients", path: adminRoutes.superAdminClients, icon: Building2,
      permissions: ["users.read"] },
    { label: "Support", path: adminRoutes.superAdminSupport, icon: LifeBuoy,
      permissions: ["users.read"] },
  ],
};

// ─── SETTINGS ───────────────────────────────────────────────────────────
// No "Platform config" entry: /admin/settings is a redirect to /admin/payments
// (PlatformSettings.tsx was deleted when platform config moved into Finance).
// A nav item that silently lands on another page — and highlights *that* page
// in the sidebar — is worse than no item at all.
export const SETTINGS_SECTION: NavSection = {
  title: "Settings",
  items: [
    { label: "Locations",  path: adminRoutes.superAdminLocations, icon: MapPin,
      permissions: ["admin_settings.read"] },
    { label: "Ads",        path: adminRoutes.superAdminAds,       icon: Megaphone,
      permissions: ["admin_settings.read"] },
    { label: "Roles",      path: adminRoutes.superAdminRoles,     icon: ShieldCheck,
      permissions: ["role_management.read"] },
    { label: "Audit Logs", path: adminRoutes.superAdminAuditLogs, icon: FileText,
      permissions: ["admin_settings.read"] },
  ],
};

/**
 * Ordered list rendered top-to-bottom in the sidebar.
 *
 * No OPERATIONS section: /admin/cleaning is a redirect to the providers list —
 * cleaning ops live inside the cleaning provider's workspace (Operations tab),
 * reached by opening that provider from Marketplace → Cleaning → Providers.
 */
export const NAV_SECTIONS: NavSection[] = [
  OVERVIEW_SECTION,
  MARKETPLACE_SECTION,
  PEOPLE_SECTION,
  SETTINGS_SECTION,
];
