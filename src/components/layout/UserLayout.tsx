import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomNav } from "@/components/BottomNav";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface UserLayoutProps {
  children: ReactNode;
  title?: string;
  showBackButton?: boolean;
  backTo?: string;
  /** Breadcrumb/context text shown on the right of the second nav row (desktop) */
  breadcrumb?: string;
  /** Allow unauthenticated visitors to view the page */
  allowGuest?: boolean;
}

export function UserLayout({ 
  children, 
  title, 
  showBackButton = false,
  backTo,
  breadcrumb,
  allowGuest = false,
}: UserLayoutProps) {
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  // Unauthenticated state
  if (!isAuthenticated && !allowGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-space-8">
          <p className="mb-space-4 text-muted-foreground">{t("auth.signInRequired")}</p>
          <Button asChild>
            <Link to="/auth">{t("auth.signIn")}</Link>
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
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-space-4 h-14 flex items-center gap-space-3">
            {showBackButton && (
              <Button 
                variant="tertiary" 
                size="icon" 
                onClick={handleBack}
                className="-ml-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            
            {title ? (
              <h1 className="font-display text-lg font-bold flex-1">{title}</h1>
            ) : (
              <Link to="/" className="flex items-center flex-1">
                <span className="font-display text-lg font-bold">
                  <span className="text-foreground">Prospera</span>
                  <span className="text-primary">Sub</span>
                </span>
              </Link>
            )}
          </div>
        </header>
      )}

      {/* Page Content */}
      <main className={cn("pb-space-24 md:pb-space-8", isMobile && "min-h-[calc(100vh-3.5rem)]")}>
        {children}
      </main>

      {/* Bottom Navigation (mobile only) */}
      <BottomNav />
    </div>
  );
}
