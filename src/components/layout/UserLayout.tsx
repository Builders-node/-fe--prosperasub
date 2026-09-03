import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomNav } from "@/components/layout/BottomNav";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { HomeHeader } from "@/components/layout/HomeHeader";
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
  /**
   * A row attached to the bottom of the mobile header — a search bar, filters —
   * rendered in the same white block so it reads as part of the header (the
   * Figma My Subs screen). When present, the header drops its own bottom
   * rounding and this row carries it instead.
   */
  headerExtra?: ReactNode;
}

export function UserLayout({ 
  children, 
  title, 
  showBackButton = false,
  backTo,
  breadcrumb,
  allowGuest = false,
  showBottomNav = true,
  headerExtra,
}: UserLayoutProps) {
  const { isAuthenticated, isLoading, isUserDataReady } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { openAuthModal } = useAuthModal();

  // `backTo` names where this screen sits in the tree; it is the fallback for
  // a cold landing, not a replacement for the visitor's own history.
  const handleBack = useGoBack(backTo);

  // Still determining auth state — show spinner to prevent flash
  if ((isLoading || !isUserDataReady) && !allowGuest) {
    return (
      <PageLoader className="min-h-screen bg-background" />
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
        <>
          <HomeHeader title={title} showBackButton={showBackButton} onBack={handleBack} bare={!!headerExtra} />
          {headerExtra && (
            <div className="sticky top-14 z-30 bg-card rounded-b-radius-lg px-4 pb-4">
              {headerExtra}
            </div>
          )}
        </>
      )}

      {/* Page Content */}
      <main className={cn(showBottomNav ? "pb-space-24 md:pb-space-8" : "pb-space-8", isMobile && "min-h-[calc(100vh-3.5rem)]")}>
        {/* On desktop the header row is different, so the extra row rides at the
            top of the content instead of being welded to a mobile header. */}
        {!isMobile && headerExtra && (
          <div className="app-container pt-5">{headerExtra}</div>
        )}
        {children}
      </main>

      {/* Bottom Navigation (mobile only) */}
      {showBottomNav && <BottomNav />}
    </div>
  );
}
