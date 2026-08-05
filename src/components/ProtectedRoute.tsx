import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { PageLoader } from "@/components/ui/spinner";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Roles allowed to access this route. If empty/undefined, any authenticated user can access. */
  allowedRoles?: AppRole[];
  /** @deprecated Use allowedRoles instead */
  requiredRoles?: AppRole[];
  /**
   * RBAC permission keys — the admin needs at least ONE. Mirrors the
   * `permissions` field on the matching nav item so hiding a link and blocking
   * its URL stay in sync. Owners hold "*" and always pass.
   */
  requiredPermissions?: string[];
}

/**
 * ProtectedRoute handles three distinct cases:
 * 1. Loading — show spinner while auth state resolves
 * 2. Not authenticated — open AuthModal (Sheet on mobile / Dialog on desktop) over the current page
 * 3. Authenticated but wrong role — show Unauthorized page
 * 4. Authenticated with correct role — render children
 */
const ProtectedRoute = ({ children, allowedRoles, requiredRoles, requiredPermissions }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, isUserDataReady, roles, isAdmin, isAdminResolved } = useAuth();
  const location = useLocation();

  const effectiveRoles = allowedRoles || requiredRoles;

  // Case 1: Still resolving auth state
  if (isLoading || !isUserDataReady) {
    return (
      <PageLoader className="min-h-screen bg-background" />
    );
  }

  // Case 2: Not authenticated — open modal
  if (!isAuthenticated) {
    return <UnauthenticatedGate redirectTo={location.pathname + location.search} />;
  }

  // Case 3: Authenticated but missing required role
  if (effectiveRoles && effectiveRoles.length > 0) {
    let hasRequiredRole = effectiveRoles.some((role) => roles.includes(role));

    // Admin routes (require super_admin) are also open to RBAC admins. Wait for
    // the admin check to resolve before deciding, so we don't redirect early.
    if (!hasRequiredRole && effectiveRoles.includes("super_admin")) {
      if (!isAdminResolved) {
        return <PageLoader className="min-h-screen bg-background" />;
      }
      if (isAdmin) hasRequiredRole = true;
    }

    if (!hasRequiredRole) {
      return <Navigate to="/discovery" replace />;
    }
  }

  // Case 4: Holds an admin role, but does this specific page need a permission?
  // Being *an* admin was previously enough for *every* admin route: a role with
  // only `users.read` could open Finance, Roles and Ads, and the sole feedback
  // was a 403 from whatever the page happened to fetch. Gate on the permission
  // the sidebar already uses for the same path.
  if (requiredPermissions && requiredPermissions.length > 0) {
    return (
      <PermissionGate permissions={requiredPermissions}>{children}</PermissionGate>
    );
  }

  // Case 5: Authorized — render
  return <>{children}</>;
};

/**
 * Blocks a route until the admin's permissions are known, then allows or
 * redirects. Split into its own component so the permissions query isn't
 * fired on every non-admin route ProtectedRoute also guards.
 */
function PermissionGate({
  permissions, children,
}: {
  permissions: string[];
  children: ReactNode;
}) {
  const { canAny, isLoading, isUnknown } = useAdminPermissions();
  // Never decide on an empty list mid-flight — that would bounce a legitimate
  // admin on first paint.
  if (isLoading) return <PageLoader className="min-h-screen bg-background" />;
  // A failed permission fetch means "we don't know", not "you have none". When
  // the API was down this bounced admins off every permissioned page to the
  // dashboard, which reads as losing access rather than as an outage. Let them
  // through — the backend enforces RBAC per endpoint, so the page can only
  // show its own error, never data they shouldn't see.
  if (isUnknown) return <>{children}</>;
  if (!canAny(permissions as never[])) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}

/**
 * Renders a minimal placeholder and immediately opens the auth modal.
 * Keeps the user on the same URL so after login they land on the right page.
 */
function UnauthenticatedGate({ redirectTo }: { redirectTo: string }) {
  const { openAuthModal } = useAuthModal();

  useEffect(() => {
    // Open on next tick so the modal provider is fully mounted
    const timer = setTimeout(() => openAuthModal("login", redirectTo), 0);
    return () => clearTimeout(timer);
  }, [openAuthModal, redirectTo]);

  return <PageLoader className="min-h-screen bg-background" />;
}

export default ProtectedRoute;
