import { Link } from "react-router-dom";
import { ShieldX, Home, ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

interface UnauthorizedProps {
  requiredRoles?: AppRole[];
}

const roleLabels: Record<AppRole, string> = {
  super_admin: "Super Admin",
  restaurant_admin: "Restaurant Admin",
  driver: "Driver",
  user: "User",
};

const roleDashboards: Record<AppRole, { path: string; label: string }> = {
  super_admin: { path: "/admin/dashboard", label: "Admin Dashboard" },
  restaurant_admin: { path: "/restaurant", label: "Restaurant Dashboard" },
  driver: { path: "/driver/deliveries", label: "Driver Dashboard" },
  user: { path: "/my-subscriptions", label: "My Subscriptions" },
};

const Unauthorized = ({ requiredRoles }: UnauthorizedProps) => {
  const { roles, isAuthenticated } = useAuth();

  // Determine the best dashboard to redirect to based on user's actual roles
  const getDefaultDashboard = () => {
    if (roles.includes("super_admin")) return roleDashboards.super_admin;
    if (roles.includes("restaurant_admin")) return roleDashboards.restaurant_admin;
    if (roles.includes("driver")) return roleDashboards.driver;
    return roleDashboards.user;
  };

  const defaultDashboard = getDefaultDashboard();
  const userRoleLabels = roles.map((r) => roleLabels[r] || r);
  const requiredRoleLabels = requiredRoles?.map((r) => roleLabels[r] || r) || [];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-space-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-radius-full bg-destructive/10 flex items-center justify-center mb-space-4">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription className="text-base mt-space-2">
            You don't have permission to access this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-space-6">
          {/* Role Information */}
          <div className="space-y-space-3 p-space-4 bg-muted/50 rounded-radius-md">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your role:</span>
              <div className="flex gap-space-1">
                {userRoleLabels.length > 0 ? (
                  userRoleLabels.map((label) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">No role assigned</Badge>
                )}
              </div>
            </div>
            {requiredRoleLabels.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Required:</span>
                <div className="flex gap-space-1">
                  {requiredRoleLabels.map((label) => (
                    <Badge key={label} variant="destructive">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-space-3">
            <Button asChild className="w-full" size="lg">
              <Link to={defaultDashboard.path}>
                <User className="h-4 w-4" />
                Go to {defaultDashboard.label}
              </Link>
            </Button>

            <Button asChild variant="secondary" className="w-full">
              <Link to="/">
                <Home className="h-4 w-4" />
                Go to Home
              </Link>
            </Button>

            <Button
              variant="tertiary"
              className="w-full text-muted-foreground"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-center text-muted-foreground">
            If you believe this is an error, please contact support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Unauthorized;
