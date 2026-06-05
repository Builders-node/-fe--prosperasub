import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useUserMode } from "@/contexts/UserModeContext";
import { Loader2 } from "lucide-react";

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
  const { isAuthenticated, isLoading, isUserDataReady, roles } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { isUserMode } = useUserMode();
  const location = useLocation();

  const effectiveRoles = allowedRoles || requiredRoles;

  // Case 1: Still resolving auth state
  if (isLoading || !isUserDataReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Case 2: Not authenticated — open modal
  if (!isAuthenticated) {
    return <UnauthenticatedGate redirectTo={location.pathname + location.search} />;
  }

  // Case 3: Admin is in "View as User" mode — block admin-only routes
  if (isUserMode && effectiveRoles && effectiveRoles.length > 0) {
    const isAdminOnlyRoute = effectiveRoles.every(
      (r) => r === "super_admin",
    );
    if (isAdminOnlyRoute) {
      // Treat them as a regular user — redirect to home
      return <Navigate to="/" replace />;
    }
  }

  // Case 4: Authenticated but missing required role (normal role check, skipped in user mode)
  if (!isUserMode && effectiveRoles && effectiveRoles.length > 0) {
    const hasRequiredRole = effectiveRoles.some((role) => roles.includes(role));
    if (!hasRequiredRole) {
      return <Navigate to="/cleaning" replace />;
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default ProtectedRoute;
