/**
 * Centralized Admin Panel navigation configuration.
 *
 * To add a new service (e.g. Food Delivery):
 *   1. Add its routes to adminRoutes.ts
 *   2. Add a new entry to SERVICES below
 *   3. Done — sidebar picks it up automatically
 */

import {
  LayoutDashboard,
  Zap,
  Users,
  UserCheck,
  SparklesIcon,
  Car,
  CreditCard,
  ClipboardList,
  BarChart3,
  Settings,
  ShieldCheck,
  FileText,
  MapPin,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminRoutes } from "./adminRoutes";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface ServiceGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Colour class for the service icon dot (Tailwind bg-* class) */
  color: string;
  /** The "home" route for the service — navigated when the parent header is clicked */
  rootPath: string;
  items: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// ─── Platform (flat links) ────────────────────────────────────────────────────
export const PLATFORM_SECTION: NavSection = {
  title: "Platform",
  items: [
    { label: "Overview",  path: adminRoutes.superAdminDashboard, icon: LayoutDashboard },
    { label: "Finance",   path: adminRoutes.superAdminPayments,  icon: Zap           },
    { label: "Users",     path: adminRoutes.superAdminUsers,     icon: Users         },
    { label: "Clients",   path: adminRoutes.superAdminClients,   icon: UserCheck     },
  ],
};

// ─── Services (collapsible groups) ───────────────────────────────────────────
export const SERVICES: ServiceGroup[] = [
  {
    id: "cleaning",
    label: "Cleaning",
    icon: SparklesIcon,
    color: "bg-blue-500",
    rootPath: adminRoutes.superAdminCleaning,
    items: [
      { label: "Plans",         path: adminRoutes.superAdminCleaningPlans, icon: CreditCard   },
      { label: "Subscriptions", path: adminRoutes.superAdminSubscriptions, icon: ClipboardList },
      { label: "Operations",    path: adminRoutes.superAdminCleaning,      icon: Wrench        },
    ],
  },
  {
    id: "car-rentals",
    label: "Car Rentals",
    icon: Car,
    color: "bg-orange-500",
    rootPath: adminRoutes.superAdminCarRentalsAnalytics,
    items: [
      { label: "Analytics",     path: adminRoutes.superAdminCarRentalsAnalytics,    icon: BarChart3    },
      { label: "Vehicles",      path: adminRoutes.superAdminCarRentals,             icon: Car          },
      { label: "Reservations",  path: adminRoutes.superAdminCarRentalsReservations, icon: ClipboardList },
      { label: "Customers",     path: adminRoutes.superAdminCarRentalsCustomers,    icon: UserCheck    },
      { label: "Delivery",      path: adminRoutes.superAdminCarRentalsDelivery,     icon: MapPin       },
    ],
  },
  // ── Add future services here ─────────────────────────────────────────────
  // {
  //   id: "food-delivery",
  //   label: "Food Delivery",
  //   icon: UtensilsCrossed,
  //   color: "bg-red-500",
  //   rootPath: "/admin/food/analytics",
  //   items: [
  //     { label: "Analytics", path: "/admin/food/analytics",   icon: BarChart3 },
  //     { label: "Menu",      path: "/admin/food/menu",        icon: BookOpen  },
  //     { label: "Orders",    path: "/admin/food/orders",      icon: ShoppingBag },
  //   ],
  // },
];

// ─── Settings (flat links) ────────────────────────────────────────────────────
export const SETTINGS_SECTION: NavSection = {
  title: "Settings",
  items: [
    { label: "Roles",      path: adminRoutes.superAdminRoles,     icon: ShieldCheck },
    { label: "Audit Logs", path: adminRoutes.superAdminAuditLogs, icon: FileText    },
    { label: "Settings",   path: adminRoutes.superAdminSettings,  icon: Settings    },
  ],
};

/** Returns true if the current pathname is inside a service group */
export function getActiveService(pathname: string): string | null {
  for (const service of SERVICES) {
    if (
      pathname === service.rootPath ||
      service.items.some((item) => pathname === item.path || pathname.startsWith(item.path + "/"))
    ) {
      return service.id;
    }
  }
  return null;
}
