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
  // Car Rentals
  superAdminCarRentals: "/admin/car-rentals",
  superAdminCarRentalsReservations: "/admin/car-rentals/reservations",
  superAdminCarRentalsCustomers: "/admin/car-rentals/customers",
  superAdminCarRentalsAnalytics: "/admin/car-rentals/analytics",
  superAdminCarRentalsDelivery: "/admin/car-rentals/delivery",
  superAdminCarRentalsInsurance: "/admin/car-rentals/insurance",
  superAdminCarRentalsExtras: "/admin/car-rentals/extras",
} as const;

export const publicRoutes = {
  userSite: "/discovery",
} as const;
