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
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// ─── OVERVIEW ───────────────────────────────────────────────────────────
export const OVERVIEW_SECTION: NavSection = {
  title: "Overview",
  items: [
    { label: "Dashboard", path: adminRoutes.superAdminDashboard, icon: LayoutDashboard },
    { label: "Analytics", path: adminRoutes.superAdminAnalytics, icon: BarChart3       },
    { label: "Finance",   path: adminRoutes.superAdminPayments,  icon: DollarSign      },
  ],
};

// ─── MARKETPLACE — the model itself ─────────────────────────────────────
export const MARKETPLACE_SECTION: NavSection = {
  title: "Marketplace",
  items: [
    { label: "Services",      path: adminRoutes.superAdminServices,                 icon: Layers       },
    { label: "Providers",     path: adminRoutes.superAdminMarketplaceProviders,     icon: Building2    },
    { label: "Plans",         path: adminRoutes.superAdminMarketplacePlans,         icon: CreditCard   },
    { label: "Subscriptions", path: adminRoutes.superAdminMarketplaceSubscriptions, icon: CalendarDays },
  ],
};

// ─── PEOPLE ─────────────────────────────────────────────────────────────
export const PEOPLE_SECTION: NavSection = {
  title: "People",
  items: [
    { label: "Users", path: adminRoutes.superAdminUsers, icon: Users },
  ],
};

// ─── SETTINGS ───────────────────────────────────────────────────────────
export const SETTINGS_SECTION: NavSection = {
  title: "Settings",
  items: [
    { label: "Locations",  path: adminRoutes.superAdminLocations, icon: MapPin      },
    { label: "Ads",        path: adminRoutes.superAdminAds,       icon: Megaphone   },
    { label: "Roles",      path: adminRoutes.superAdminRoles,     icon: ShieldCheck },
    { label: "Audit Logs", path: adminRoutes.superAdminAuditLogs, icon: FileText    },
  ],
};

/** Ordered list rendered top-to-bottom in the sidebar. */
export const NAV_SECTIONS: NavSection[] = [
  OVERVIEW_SECTION,
  MARKETPLACE_SECTION,
  PEOPLE_SECTION,
  SETTINGS_SECTION,
];

// ── Legacy exports so old imports keep compiling ───────────────────────
export const PLATFORM_SECTION: NavSection = OVERVIEW_SECTION;
export const NAV_SECTIONS_BELOW: NavSection[] = [];
export interface ServiceGroup { id: string; label: string; icon: LucideIcon; color: string; rootPath: string; items: NavItem[]; }
export const SERVICES: ServiceGroup[] = [];
export function getActiveService(_pathname: string): string | null { return null; }
