import { Bell, CalendarDays, Compass } from "lucide-react";
import { AppRole } from "@/contexts/AuthContext";
import { LucideIcon } from "lucide-react";

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  /** Paths that should also mark this nav item as active */
  activePatterns?: string[];
  /** If true, tapping while unauthenticated opens the login modal instead of navigating */
  requiresAuth?: boolean;
}

export interface NavigationConfig {
  items: NavItem[];
  /** Roles this config applies to */
  roles: AppRole[];
}

/**
 * Navigation items for regular users
 */
const USER_NAV: NavItem[] = [
  {
    icon: Compass,
    label: "Services",
    path: "/discovery",
    activePatterns: ["/discovery"],
  },
  {
    icon: CalendarDays,
    label: "My Subs",
    path: "/my-subscriptions",
    activePatterns: ["/cleaning/my-bookings"],
    requiresAuth: true,
  },
  {
    icon: Bell,
    label: "Notifications",
    path: "/notifications",
    requiresAuth: true,
  },
];

/**
 * All roles share the same bottom nav — admin areas are accessible via account menu.
 */

/**
 * Get navigation items based on user roles.
 * Priority: super_admin > user
 */
export function getNavigationForRoles(_roles: AppRole[]): NavItem[] {
  return USER_NAV;
}

/**
 * Check if a nav item is active based on current path
 */
export function isNavItemActive(item: NavItem, currentPath: string): boolean {
  // Exact match
  if (currentPath === item.path) {
    return true;
  }
  
  // Check active patterns
  if (item.activePatterns) {
    return item.activePatterns.some(pattern => currentPath.startsWith(pattern));
  }
  
  return false;
}
