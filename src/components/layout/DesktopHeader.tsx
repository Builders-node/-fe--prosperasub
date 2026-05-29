import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Clock, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tabsListVariants, tabsTriggerVariants } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { cn } from "@/lib/utils";
import { LanguageMenu } from "@/components/LanguageMenu";
import { useI18n } from "@/i18n";
import { AccountMenu } from "@/components/AccountMenu";

interface DesktopHeaderProps {
  /** Show back button in secondary nav */
  showBackButton?: boolean;
  /** Custom back handler (defaults to navigate(-1)) */
  onBack?: () => void;
  /** Breadcrumb/context text shown on the right of the secondary nav row */
  breadcrumb?: string;
  /** Hide the navigation links (for public pages with custom nav) */
  hideNav?: boolean;
  /** Hide marketplace Food/Cleaning switcher */
  hideProductTabs?: boolean;
  /** Hide marketplace search field */
  hideSearch?: boolean;
  /** Custom right-side content instead of nav */
  rightContent?: React.ReactNode;
}

export function DesktopHeader({
  showBackButton = false,
  onBack,
  breadcrumb,
  hideNav = false,
  hideProductTabs = false,
  hideSearch = false,
  rightContent,
}: DesktopHeaderProps) {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const showSecondaryNav = showBackButton || breadcrumb;
  const isCleaningActive = location.pathname.startsWith("/cleaning");

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  useEffect(() => {
    setSearchQuery(searchParams.get("search") || "");
  }, [searchParams]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/restaurants?search=${encodeURIComponent(query)}` : "/restaurants");
  };

  return (
    <header className="hidden md:block sticky top-0 z-40 bg-background/97 backdrop-blur-md border-b border-border/30">
      {/* ── Yandex Go desktop header: logo · tabs · search · account ── */}
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center gap-4 px-8">

        {/* Logo wordmark */}
        <Link
          to="/"
          className="shrink-0 text-[19px] font-black tracking-tight text-foreground hover:text-primary transition-colors"
        >
          ProsperaSub
        </Link>


        {/* Search */}
        {hideSearch ? (
          <div className="flex-1" />
        ) : (
          <form role="search" onSubmit={handleSearch} className="flex-1 max-w-xl">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("nav.search")}
              inputSize="search"
              leftIcon={<Search className="h-5 w-5 text-muted-foreground" />}
              aria-label={t("nav.search")}
              className="rounded-full bg-muted/60 border-0 focus-visible:ring-1 focus-visible:ring-primary/50"
            />
          </form>
        )}

        {rightContent && <div className="flex-1" />}

        {/* Right actions */}
        <div className="flex items-center gap-3 ml-auto">
          {!hideNav && <LanguageMenu />}
          {rightContent ?? (
            !hideNav && (
              isAuthenticated ? (
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
          <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-3 px-8 text-sm text-muted-foreground">
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
