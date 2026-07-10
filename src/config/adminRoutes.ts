/**
 * Admin route constants used by the sidebar nav config (adminNav.ts).
 *
 * Only nav-referenced routes live here — per-service admin pages (BeachClub,
 * Food, CarRentals, Cleaning legacy) are accessed via URL only or embedded
 * inside provider workspaces, so their paths don't need central constants.
 */
export const adminRoutes = {
  superAdminDashboard: "/admin/dashboard",
  superAdminAnalytics: "/admin/analytics",
  superAdminPayments: "/admin/payments",
  superAdminServices: "/admin/services",
  superAdminMarketplaceProviders: "/admin/marketplace/providers",
  superAdminMarketplacePlans: "/admin/marketplace/plans",
  superAdminMarketplaceSubscriptions: "/admin/marketplace/subscriptions",
  superAdminUsers: "/admin/users",
  superAdminLocations: "/admin/locations",
  superAdminAds: "/admin/ads",
  superAdminRoles: "/admin/roles",
  superAdminAuditLogs: "/admin/audit-logs",
} as const;

export const publicRoutes = {
  userSite: "/discovery",
} as const;
