import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { LanguageMenu } from "@/components/LanguageMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useI18n } from "@/i18n";
import { AccountMenu } from "@/components/AccountMenu";

interface DesktopHeaderProps {
  showBackButton?: boolean;
  onBack?: () => void;
  breadcrumb?: string;
  hideNav?: boolean;
  rightContent?: React.ReactNode;
}

export function DesktopHeader({
  showBackButton = false,
  onBack,
  breadcrumb,
  hideNav = false,
  rightContent,
}: DesktopHeaderProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const showSecondaryNav = showBackButton || breadcrumb;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  return (
    <header className="hidden md:block sticky top-0 z-40 bg-background/97 backdrop-blur-md border-b border-border/30">
      {/* ── Yandex Go desktop header: logo · tabs · search · account ── */}
      <div className="app-container flex h-[68px] items-center gap-4">

        {/* Logo wordmark */}
        <Link
          to="/"
          className="shrink-0 text-[19px] font-black tracking-tight text-foreground hover:text-primary transition-colors"
        >
          ProsperaSub
        </Link>


        <div className="flex-1" />

        {rightContent && <div className="flex-1" />}

        {/* Right actions */}
        <div className="flex items-center gap-3 ml-auto">
          {!hideNav && <LanguageMenu />}
          {!hideNav && <NotificationBell />}
          {rightContent ?? (
            !hideNav && (
              authLoading ? (
                /* Skeleton placeholder — prevents login→avatar flash */
                <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
              ) : isAuthenticated ? (
                <AccountMenu />
              ) : (
                <button
                  type="button"
                  onClick={() => openAuthModal("login")}
                  className="h-9 rounded-full px-5 text-[13px] font-semibold transition-colors hover:opacity-80"
                  style={{ background: "hsl(var(--yd-cta-bg))", color: "hsl(var(--yd-cta-fg))" }}
                >
                  {t("nav.logIn")}
                </button>
              )
            )
          )}
        </div>
      </div>

      {/* Secondary nav: back + breadcrumb */}
      {showSecondaryNav && (
        <div className="border-t border-border/30 bg-muted/30">
          <div className="app-container flex h-11 items-center gap-3 text-sm text-muted-foreground">
            {showBackButton && (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("common.back")}
              </button>
            )}
            {breadcrumb && (
              <nav className="flex min-w-0 items-center gap-2" aria-label="Breadcrumb">
                <Link to="/" className="transition-colors hover:text-foreground">{t("common.home")}</Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <span className="truncate font-medium text-foreground">{breadcrumb}</span>
              </nav>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
