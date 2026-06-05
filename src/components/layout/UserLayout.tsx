import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomNav } from "@/components/BottomNav";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { HomeHeader } from "@/components/HomeHeader";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAuthModal } from "@/contexts/AuthModalContext";

interface UserLayoutProps {
  children: ReactNode;
  title?: string;
  showBackButton?: boolean;
  backTo?: string;
  /** Breadcrumb/context text shown on the right of the second nav row (desktop) */
  breadcrumb?: string;
  /** Allow unauthenticated visitors to view the page */
  allowGuest?: boolean;
  showBottomNav?: boolean;
}

export function UserLayout({ 
  children, 
  title, 
  showBackButton = false,
  backTo,
  breadcrumb,
  allowGuest = false,
  showBottomNav = true,
}: UserLayoutProps) {
  const { isAuthenticated, isLoading, isUserDataReady } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { openAuthModal } = useAuthModal();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  // Still determining auth state — show spinner to prevent flash
  if ((isLoading || !isUserDataReady) && !allowGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Unauthenticated state — open modal instead of redirecting to /auth
  if (!isAuthenticated && !allowGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-space-8">
          <p className="mb-space-4 text-muted-foreground">{t("auth.signInRequired")}</p>
          <Button onClick={() => openAuthModal("login", window.location.pathname)}>
            {t("auth.signIn")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Header */}
      {!isMobile && (
        <DesktopHeader 
          showBackButton={showBackButton}
          onBack={handleBack}
          breadcrumb={breadcrumb}
        />
      )}

      {/* Mobile Header */}
      {isMobile && (
        <HomeHeader title={title} showBackButton={showBackButton} onBack={handleBack} />
      )}

      {/* Page Content */}
      <main className={cn(showBottomNav ? "pb-space-24 md:pb-space-8" : "pb-space-8", isMobile && "min-h-[calc(100vh-3.5rem)]")}>
        {children}
      </main>

      {/* Bottom Navigation (mobile only) */}
      {showBottomNav && <BottomNav />}
    </div>
  );
}
