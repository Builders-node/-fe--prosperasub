import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

interface FoodAccessGateProps {
  children: ReactNode;
}

function FoodComingSoon({ isCheckingAccess = false }: { isCheckingAccess?: boolean }) {
  return (
    <div className="market-shell">
      <HomeHeader />
      <DesktopHeader hideSearch />

      <main className="market-content flex min-h-[calc(100vh-140px)] items-center py-space-12 md:py-space-16">
        <Card className="mx-auto w-full max-w-2xl">
          <CardContent className="flex flex-col items-center p-space-8 text-center md:p-space-12">
            <div className="mb-space-6 flex h-14 w-14 items-center justify-center rounded-radius-full bg-primary text-primary-foreground">
              <CalendarDays className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-page-title">
              {isCheckingAccess ? "Checking access" : "Coming soon"}
            </h1>
            <p className="mt-space-3 max-w-md text-body text-muted-foreground">
              {isCheckingAccess
                ? "Loading your account permissions."
                : "Food is still in development, but you can already order cleaning."}
            </p>
            {!isCheckingAccess && (
              <Button asChild size="lg" className="mt-space-6">
                <Link to="/cleaning">Order cleaning</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
}

export function FoodAccessGate({ children }: FoodAccessGateProps) {
  const { isSuperAdmin, isLoading, isUserDataReady } = useAuth();

  if (isLoading || !isUserDataReady) {
    return <FoodComingSoon isCheckingAccess />;
  }

  if (!isSuperAdmin) {
    return <FoodComingSoon />;
  }

  return <>{children}</>;
}
