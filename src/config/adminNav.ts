/**
 * Admin Panel navigation, aligned with the Categories → Providers → Plans →
 * Customers model. No per-service SERVICES section anymore: everything that
 * fits the model lives in MARKETPLACE; the only exceptions are OPERATIONS
 * — physical scheduling tools (cleaner slot calendars, court bookings)
 * that cannot be flattened into a marketplace list.
 *
 * Legacy per-service pages (FoodProviders, CleaningProviders, etc.) still
 * work by URL for old bookmarks; they just don't clutter the sidebar.
 */

import {
  BarChart3, CalendarDays, ClipboardList, CreditCard, DollarSign,
  FileText, LandPlot, LayoutDashboard, MapPin, Megaphone, Settings,
  ShieldCheck, Store, UserCheck, Users, Wrench, Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminRoutes } from "./adminRoutes";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
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
    { label: "Categories",    path: adminRoutes.superAdminCategories,                icon: Store         },
    { label: "Providers",     path: adminRoutes.superAdminMarketplaceProviders,      icon: Building2     },
    { label: "Plans",         path: adminRoutes.superAdminMarketplacePlans,          icon: CreditCard    },
    { label: "Customers",     path: adminRoutes.superAdminMarketplaceSubscriptions,  icon: ClipboardList },
    { label: "Applications",  path: adminRoutes.superAdminProviderApplications,      icon: ClipboardList },
  ],
};

// ─── PEOPLE ─────────────────────────────────────────────────────────────
export const PEOPLE_SECTION: NavSection = {
  title: "People",
  items: [
    { label: "Users",   path: adminRoutes.superAdminUsers,   icon: Users     },
    { label: "Clients", path: adminRoutes.superAdminClients, icon: UserCheck },
  ],
};

// ─── OPERATIONS — physical scheduling, cannot be abstracted ─────────────
// These carry domain-specific constraints (slot capacity, court availability,
// therapist calendars) that don't fit a "list all rows" view.
export const OPERATIONS_SECTION: NavSection = {
  title: "Operations",
  items: [
    { label: "Cleaning slots", path: adminRoutes.superAdminCleaning,        icon: Wrench       },
    { label: "Massage cal.",   path: adminRoutes.superAdminMassageCalendar, icon: CalendarDays },
    { label: "Beach courts",   path: adminRoutes.superAdminBeachClubCourts, icon: LandPlot     },
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
    { label: "Settings",   path: adminRoutes.superAdminSettings,  icon: Settings    },
  ],
};

/** Ordered list rendered top-to-bottom in the sidebar. */
export const NAV_SECTIONS: NavSection[] = [
  OVERVIEW_SECTION,
  MARKETPLACE_SECTION,
  PEOPLE_SECTION,
  OPERATIONS_SECTION,
  SETTINGS_SECTION,
];

// ── Legacy exports so old imports keep compiling ───────────────────────
export const PLATFORM_SECTION: NavSection = OVERVIEW_SECTION;
export const NAV_SECTIONS_BELOW: NavSection[] = [];
export interface ServiceGroup { id: string; label: string; icon: LucideIcon; color: string; rootPath: string; items: NavItem[]; }
export const SERVICES: ServiceGroup[] = [];
export function getActiveService(_pathname: string): string | null { return null; }
