import { AppRole } from "@/contexts/AuthContext";
import type { ComponentType, SVGProps } from "react";
import {
  HomeIcon, Inventory2Icon, PersonIcon, ShoppingBagIcon,
} from "@/components/icons/FigmaIcons";

export interface NavItem {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
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
/**
 * The four tabs from the Figma home screen: Home · Subs · Cart · Account.
 *
 * Notifications left the tab bar and moved into the header, where the design
 * puts the bell — a tab is for a place you go, and notifications are something
 * you glance at. Account routes to /account like the other three: the profile
 * used to be a modal, which made it the one surface with no address.
 */
// `label` is a TRANSLATION KEY (see i18n.tsx), not a word: the tab bar is on
// screen the whole session, so it is the first thing that has to speak the
// customer's language.
const USER_NAV: NavItem[] = [
  {
    icon: HomeIcon,
    label: "common.home",
    path: "/discovery",
    activePatterns: ["/discovery", "/services"],
  },
  {
    icon: Inventory2Icon,
    label: "nav.subs",
    path: "/my-subscriptions",
    requiresAuth: true,
  },
  {
    icon: ShoppingBagIcon,
    label: "nav.cart",
    path: "/cart",
  },
  {
    icon: PersonIcon,
    label: "nav.account",
    path: "/account",
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
