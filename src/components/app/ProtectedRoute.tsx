import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

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
 * 2. Not authenticated — open AuthModal over a screen that says so
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
/**
 * How long the gate will wait for the permission list before deciding it does
 * not know. Waiting forever is not a safer default: a spinner with no timeout
 * is a locked door with no handle, and this gate stands in front of eight admin
 * pages at once.
 */
const PERMISSION_WAIT_MS = 8_000;

function PermissionGate({
  permissions, children,
}: {
  permissions: string[];
  children: ReactNode;
}) {
  const { canAny, isLoading, isUnknown } = useAdminPermissions();

  // `isUnknown` only ever becomes true when the request FAILS. A request that
  // simply never settles stays "loading" forever, so the escape below could not
  // fire and the whole permissioned admin sat on a spinner. Time is the other
  // way a fetch can fail to answer, so treat it as one.
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  useEffect(() => {
    if (!isLoading) { setGaveUpWaiting(false); return; }
    const timer = window.setTimeout(() => setGaveUpWaiting(true), PERMISSION_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  // Never decide on an empty list mid-flight — that would bounce a legitimate
  // admin on first paint.
  if (isLoading && !gaveUpWaiting) return <PageLoader className="min-h-screen bg-background" />;
  if (gaveUpWaiting) return <>{children}</>;
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
 * Opens the auth modal and stays on the URL, so logging in lands on the page
 * that was asked for.
 *
 * What is behind the modal matters: this used to be a full-screen spinner, so
 * dismissing the login left a page that span forever with nothing to press and
 * no way out but the back button. A spinner is a promise that something is
 * loading, and nothing was. It is now a plain screen that says what happened
 * and offers the two ways forward.
 */
function UnauthenticatedGate({ redirectTo }: { redirectTo: string }) {
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();

  useEffect(() => {
    // Open on next tick so the modal provider is fully mounted
    const timer = setTimeout(() => openAuthModal("login", redirectTo), 0);
    return () => clearTimeout(timer);
  }, [openAuthModal, redirectTo]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div>
        <p className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Sign in to continue</p>
        <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
          This page is yours — it needs an account to know which one.
        </p>
      </div>
      <div className="flex w-full max-w-[280px] flex-col gap-2">
        <Button className="w-full" onClick={() => openAuthModal("login", redirectTo)}>Log in</Button>
        <Button variant="secondary" className="w-full" onClick={() => navigate("/discovery")}>
          Back to home
        </Button>
      </div>
    </div>
  );
}

export default ProtectedRoute;
