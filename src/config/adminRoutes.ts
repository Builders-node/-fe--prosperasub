export const adminRoutes = {
  superAdminDashboard: "/admin/dashboard",
  superAdminPayments: "/admin/payments",
  superAdminUsers: "/admin/users",
  superAdminClients: "/admin/clients",
  superAdminCleaning: "/admin/cleaning",
  superAdminCleaningPlans: "/admin/cleaning-plans",
  superAdminSubscriptions: "/admin/subscriptions",
  superAdminRoles: "/admin/roles",
  superAdminAuditLogs: "/admin/audit-logs",
  superAdminSettings: "/admin/settings",
  superAdminAds: "/admin/ads",
  // Car Rentals
  superAdminCarRentals: "/admin/car-rentals",
  superAdminCarRentalsReservations: "/admin/car-rentals/reservations",
  superAdminCarRentalsCustomers: "/admin/car-rentals/customers",
  superAdminCarRentalsAnalytics: "/admin/car-rentals/analytics",
  superAdminCarRentalsDelivery: "/admin/car-rentals/delivery",
  superAdminCarRentalsInsurance: "/admin/car-rentals/insurance",
  superAdminCarRentalsExtras: "/admin/car-rentals/extras",
  superAdminCarRentalsProviders: "/admin/car-rentals/providers",
  // Food
  superAdminFoodAnalytics: "/admin/food/analytics",
  superAdminFoodProviders: "/admin/food/providers",
  superAdminFoodSubscriptions: "/admin/food/subscriptions",
  // Beach Club
  superAdminBeachClubPlans: "/admin/beach-club/plans",
  superAdminBeachClubSubscriptions: "/admin/beach-club/subscriptions",
} as const;

export const publicRoutes = {
  userSite: "/discovery",
} as const;
