/**
 * Admin Panel navigation. Kept intentionally compact so the sidebar stays
 * scannable. Cross-cutting things collapse into ONE page with tabs, not a
 * separate nav entry:
 *   Marketplace → Services · Providers (with a Pending-applications tab) ·
 *                 Plans · Subscriptions
 *   People → Users (with a Cleaning-clients tab)
 * Categories were retired in favor of Services (archetypes).
 * OPERATIONS = physical scheduling (slots, courts, therapist calendars) that
 * doesn't fit a marketplace list.
 */

import {
  BarChart3, CalendarDays, CreditCard, DollarSign,
  FileText, Layers, LayoutDashboard, MapPin, Megaphone,
  ShieldCheck, Users, Building2,
} from "lucide-react";
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
export const MARKETPLACE_SECTION: NavSection = {
  title: "Marketplace",
  items: [
    { label: "Services",      path: adminRoutes.superAdminServices,                 icon: Layers,
      permissions: ["admin_settings.read"] },
    { label: "Providers",     path: adminRoutes.superAdminMarketplaceProviders,     icon: Building2,
      // Applications is a TAB inside Providers, not its own nav item — a
      // separate entry duplicated a surface that's one click away. Keep the
      // parent highlighted while the admin is triaging there.
      alsoActiveOn: [adminRoutes.superAdminProviderApplications],
      permissions: ["admin_settings.read"] },
    { label: "Plans",         path: adminRoutes.superAdminMarketplacePlans,         icon: CreditCard,
      permissions: ["cleaning_plans.read"] },
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
 * reached by opening that provider from Marketplace → Providers.
 */
export const NAV_SECTIONS: NavSection[] = [
  OVERVIEW_SECTION,
  MARKETPLACE_SECTION,
  PEOPLE_SECTION,
  SETTINGS_SECTION,
];
