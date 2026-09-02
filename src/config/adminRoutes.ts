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
  /** Drill-down entry point — service cards, each opening its own detail page. */
  superAdminMarketplace: "/admin/marketplace",
  superAdminMarketplaceProviders: "/admin/marketplace/providers",
  superAdminMarketplacePlans: "/admin/marketplace/plans",
  superAdminMarketplaceSubscriptions: "/admin/marketplace/subscriptions",
  superAdminTransport: "/admin/transport",
  /** The old address; still resolves so bookmarks survive. */
  superAdminCarRentals: "/admin/car-rentals",
  superAdminUsers: "/admin/users",
  superAdminClients: "/admin/clients",
  superAdminSupport: "/admin/support",
  superAdminLocations: "/admin/locations",
  superAdminAds: "/admin/ads",
  superAdminRoles: "/admin/roles",
  superAdminAuditLogs: "/admin/audit-logs",
  // Not a nav destination — a tab inside Providers. Kept as a constant because
  // the Providers nav item uses it for `alsoActiveOn` highlighting.
  superAdminProviderApplications: "/admin/marketplace/providers/applications",
} as const;

export const publicRoutes = {
  userSite: "/discovery",
} as const;
