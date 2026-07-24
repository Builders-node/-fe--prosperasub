import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { PageLoader } from "@/components/ui/spinner";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Roles allowed to access this route. If empty/undefined, any authenticated user can access. */
  allowedRoles?: AppRole[];
  /** @deprecated Use allowedRoles instead */
  requiredRoles?: AppRole[];
}

/**
 * ProtectedRoute handles three distinct cases:
 * 1. Loading — show spinner while auth state resolves
 * 2. Not authenticated — open AuthModal (Sheet on mobile / Dialog on desktop) over the current page
 * 3. Authenticated but wrong role — show Unauthorized page
 * 4. Authenticated with correct role — render children
 */
const ProtectedRoute = ({ children, allowedRoles, requiredRoles }: ProtectedRouteProps) => {
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

  // Case 5: Authorized — render
  return <>{children}</>;
};

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
