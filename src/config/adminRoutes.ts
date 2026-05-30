export const adminRoutes = {
  superAdminDashboard: "/admin/dashboard",
  superAdminPayments: "/admin/payments",
  superAdminUsers: "/admin/users",
  superAdminClients: "/admin/clients",
  superAdminCleaning: "/admin/cleaning",
  superAdminCleaningPlans: "/admin/cleaning-plans",
  superAdminSettings: "/admin/settings",
} as const;

export const publicRoutes = {
  userSite: "/cleaning",
} as const;
