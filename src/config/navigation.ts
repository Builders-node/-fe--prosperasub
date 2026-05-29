import { LayoutGrid, CalendarDays, Truck, UtensilsCrossed, Shield, SparklesIcon } from "lucide-react";
import { AppRole } from "@/contexts/AuthContext";
import { LucideIcon } from "lucide-react";

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  /** Paths that should also mark this nav item as active */
  activePatterns?: string[];
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
    icon: LayoutGrid, 
    label: "Discover", 
    path: "/",
    activePatterns: ["/restaurants", "/plan/"]
  },
  { 
    icon: SparklesIcon, 
    label: "Cleaning", 
    path: "/cleaning",
    activePatterns: ["/cleaning/"]
  },
  { 
    icon: CalendarDays, 
    label: "My Bookings", 
    path: "/my-subscriptions",
    activePatterns: ["/subscription/", "/cleaning/my-bookings"]
  },
];

/**
 * Navigation items for restaurant admins
 */
const RESTAURANT_ADMIN_NAV: NavItem[] = [
  { 
    icon: UtensilsCrossed, 
    label: "Restaurant", 
    path: "/restaurant",
    activePatterns: ["/restaurant/"]
  },
  { 
    icon: LayoutGrid, 
    label: "Discover", 
    path: "/" 
  },
  { 
    icon: SparklesIcon, 
    label: "Cleaning", 
    path: "/cleaning",
    activePatterns: ["/cleaning/"]
  },
];

/**
 * Navigation items for drivers
 */
const DRIVER_NAV: NavItem[] = [
  { 
    icon: Truck, 
    label: "Deliveries", 
    path: "/driver/deliveries" 
  },
  { 
    icon: LayoutGrid, 
    label: "Available", 
    path: "/driver/available" 
  },
];

/**
 * Navigation items for super admins
 */
const SUPER_ADMIN_NAV: NavItem[] = [
  {
    icon: Shield,
    label: "Platform",
    path: "/admin/dashboard",
    activePatterns: ["/admin/"]
  },
  {
    icon: UtensilsCrossed,
    label: "Restaurant",
    path: "/restaurant",
    activePatterns: ["/restaurant/"]
  },
  {
    icon: LayoutGrid,
    label: "Discover",
    path: "/"
  },
  {
    icon: SparklesIcon,
    label: "Cleaning",
    path: "/cleaning",
    activePatterns: ["/cleaning/"]
  },
  {
    icon: CalendarDays,
    label: "My Bookings",
    path: "/my-subscriptions",
    activePatterns: ["/subscription/"],
  },
];

/**
 * Get navigation items based on user roles.
 * Priority: super_admin > restaurant_admin > driver > user
 */
export function getNavigationForRoles(roles: AppRole[]): NavItem[] {
  if (roles.includes("super_admin")) {
    return SUPER_ADMIN_NAV;
  }
  if (roles.includes("restaurant_admin")) {
    return RESTAURANT_ADMIN_NAV;
  }
  if (roles.includes("driver")) {
    return DRIVER_NAV;
  }
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
