export const adminRoutes = {
  superAdminDashboard: "/admin/dashboard",
  superAdminPayments: "/admin/payments",
  superAdminProfit: "/admin/profit",
  superAdminUsers: "/admin/users",
  superAdminClients: "/admin/clients",
  superAdminProviderApplications: "/admin/provider-applications",
  superAdminCategories: "/admin/categories",
  superAdminMarketplaceProviders: "/admin/marketplace/providers",
  superAdminMarketplacePlans: "/admin/marketplace/plans",
  superAdminMarketplaceSubscriptions: "/admin/marketplace/subscriptions",
  superAdminAnalytics: "/admin/analytics",
  superAdminCleaning: "/admin/cleaning/operations",
  superAdminCleaningAnalytics: "/admin/cleaning/analytics",
  superAdminCleaningPlans: "/admin/cleaning/plans",
  superAdminCleaningProviders: "/admin/cleaning/providers",
  superAdminSubscriptions: "/admin/cleaning/subscriptions",
  superAdminRoles: "/admin/roles",
  superAdminAuditLogs: "/admin/audit-logs",
  superAdminSettings: "/admin/settings",
  superAdminAds: "/admin/ads",
  // Car Rentals
  superAdminCarRentals: "/admin/car-rentals",
  superAdminCarRentalsReservations: "/admin/car-rentals/reservations",
  superAdminCarRentalsCustomers: "/admin/car-rentals/customers",
  superAdminCarRentalsAnalytics: "/admin/car-rentals/analytics",
  superAdminCarRentalsProviders: "/admin/car-rentals/providers",
  // Food
  superAdminFoodAnalytics: "/admin/food/analytics",
  superAdminFoodProviders: "/admin/food/providers",
  superAdminFoodResidences: "/admin/food/residences",
  superAdminLocations: "/admin/locations",
  superAdminFoodSubscriptions: "/admin/food/subscriptions",
  // Massage
  superAdminMassageProviders: "/admin/massage/providers",
  superAdminMassagePlans: "/admin/massage/plans",
  superAdminMassageSubscriptions: "/admin/massage/subscriptions",
  superAdminMassageCalendar: "/admin/massage/calendar",
  // Beach Club
  superAdminBeachClubAnalytics: "/admin/beach-club/analytics",
  superAdminBeachClubPlans: "/admin/beach-club/plans",
  superAdminBeachClubSubscriptions: "/admin/beach-club/subscriptions",
  superAdminBeachClubCourts: "/admin/beach-club/courts",
} as const;

export const publicRoutes = {
  userSite: "/discovery",
} as const;
