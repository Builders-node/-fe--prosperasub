import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The signed-in admin's effective permission keys.
 *
 * Backed by `GET /admin/me/permissions`, which flattens every permission across
 * the user's active RBAC roles. Owner/super-admin gets `["*"]` — a wildcard so
 * newly-added permissions are granted automatically instead of needing the
 * catalogue kept in sync in two places.
 *
 * Why this exists: the backend enforces RBAC per endpoint, but the SPA had no
 * idea what the user could do. Every admin route was open to anyone holding
 * *any* admin role, and the only feedback was a 403 from whatever API call the
 * page happened to make — which looks like a broken page, not "no access".
 */
export type AdminPermissionKey =
  | "users.read" | "users.write"
  | "clients.read" | "clients.write"
  | "cleaning_plans.read" | "cleaning_plans.write"
  | "subscriptions.read" | "subscriptions.write"
  | "payments.read" | "payments.write"
  | "bookings.read" | "bookings.write"
  | "admin_settings.read" | "admin_settings.write"
  | "role_management.read" | "role_management.write";

export function useAdminPermissions() {
  const { isAuthenticated, isAdmin, isAdminResolved } = useAuth();

  const query = useQuery({
    queryKey: ["admin-my-permissions"],
    // Only ask once we know the user is an admin at all — otherwise every
    // signed-in customer would fire a 403 on page load.
    enabled: isAuthenticated && isAdminResolved && isAdmin,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/me/permissions");
      if (error) throw error;
      return ((data as { permissions?: string[] })?.permissions ?? []) as string[];
    },
    // Roles change rarely and a stale grant is corrected server-side anyway,
    // so a long window avoids refetching on every admin navigation.
    staleTime: 5 * 60_000,
  });

  const permissions = query.data ?? [];
  const isOwner = permissions.includes("*");

  /** True when the user holds `key` (or is an owner). */
  const can = (key: AdminPermissionKey): boolean =>
    isOwner || permissions.includes(key);

  /** True when the user holds at least one of `keys`. */
  const canAny = (keys: AdminPermissionKey[]): boolean =>
    isOwner || keys.some((k) => permissions.includes(k));

  return {
    permissions,
    isOwner,
    can,
    canAny,
    // Callers must not gate on an empty list while it's still loading, or the
    // first paint redirects a legitimate admin away.
    isLoading: query.isLoading,
    isResolved: !query.isLoading && (query.isSuccess || query.isError),
  };
}
