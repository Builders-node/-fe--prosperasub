export const adminRoutes = {
  superAdminDashboard: "/admin/dashboard",
  superAdminPayments: "/admin/payments",
  superAdminUsers: "/admin/users",
  superAdminClients: "/admin/clients",
  superAdminCleaning: "/admin/cleaning",
  superAdminSettings: "/admin/settings",
} as const;

export const publicRoutes = {
  userSite: "/cleaning",
} as const;
