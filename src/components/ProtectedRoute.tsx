import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import Unauthorized from "@/pages/Unauthorized";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Roles allowed to access this route. If empty/undefined, any authenticated user can access. */
  allowedRoles?: AppRole[];
  /** @deprecated Use allowedRoles instead */
  requiredRoles?: AppRole[];
}

/**
 * ProtectedRoute handles three distinct cases:
 * 1. Loading - Show spinner while auth state is being determined
 * 2. Not authenticated - Redirect to /auth
 * 3. Authenticated but wrong role - Show Unauthorized page (no silent redirect)
 * 4. Authenticated with correct role - Render children
 */
const ProtectedRoute = ({ children, allowedRoles, requiredRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, isUserDataReady, roles } = useAuth();
  const location = useLocation();

  // Support both prop names during migration
  const effectiveRoles = allowedRoles || requiredRoles;

  // Case 1: Still loading auth state
  if (isLoading || !isUserDataReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Case 2: Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  // Case 3: Authenticated but missing required role - show Unauthorized page
  if (effectiveRoles && effectiveRoles.length > 0) {
    const hasRequiredRole = effectiveRoles.some((role) => roles.includes(role));
    if (!hasRequiredRole) {
      // Show explicit Unauthorized page instead of silent redirect
      return <Unauthorized requiredRoles={effectiveRoles} />;
    }
  }

  // Case 4: Authenticated and authorized - render children
  return <>{children}</>;
};

export default ProtectedRoute;
