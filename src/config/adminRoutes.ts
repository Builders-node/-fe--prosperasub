export const adminRoutes = {
  superAdminDashboard: "/admin/dashboard",
  superAdminSubscriptions: "/admin/subscriptions",
  superAdminPayments: "/admin/payments",
  superAdminClients: "/admin/clients",
  superAdminCleaning: "/admin/cleaning",
  superAdminRestaurants: "/admin/restaurants",
  superAdminSettings: "/admin/settings",
  restaurantAdmin: "/restaurant",
} as const;

export const publicRoutes = {
  userSite: "/",
} as const;
