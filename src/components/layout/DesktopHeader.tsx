import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Clock, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tabsListVariants, tabsTriggerVariants } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    <header className="hidden md:block sticky top-0 z-40 border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))]">
      {/* Primary Nav Row: Logo + Navigation Links */}
      <div>
        <div className="mx-auto flex h-[76px] max-w-[1920px] items-center gap-space-4 px-space-8">
          {/* Left: Logo */}
          <Link to="/" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-full bg-[hsl(var(--app-logo-bg))] text-[hsl(var(--app-logo-foreground))]">
            <span className="font-display text-2xl font-black leading-none">@</span>
          </Link>

          {!hideProductTabs && (
            <div
              className={cn(
                tabsListVariants({ variant: "pills", size: "lg" }),
                "h-12 shrink-0 rounded-radius-lg bg-[hsl(var(--app-control))] p-space-1"
              )}
            >
              <Link
                to="/"
                className={cn(
                  tabsTriggerVariants({ variant: "pills", size: "lg" }),
                  "h-10 rounded-radius-md px-space-6 font-sans text-[0.85rem] font-bold text-muted-foreground hover:text-foreground",
                  !isCleaningActive && "bg-card text-foreground"
                )}
              >
                {t("nav.food")}
              </Link>
              <Link
                to="/cleaning"
                className={cn(
                  tabsTriggerVariants({ variant: "pills", size: "lg" }),
                  "h-10 rounded-radius-md px-space-6 font-sans text-[0.85rem] font-bold text-muted-foreground hover:text-foreground",
                  isCleaningActive && "bg-card text-foreground"
                )}
              >
                {t("nav.cleaning")}
              </Link>
            </div>
          )}

          {hideSearch ? (
            <div className="flex-1" />
          ) : (
            <form role="search" onSubmit={handleSearch} className="flex-1">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("nav.search")}
                inputSize="search"
                leftIcon={<Search className="h-6 w-6 text-foreground" />}
                aria-label={t("nav.search")}
              />
            </form>
          )}

          {rightContent ? (
            rightContent
          ) : !hideNav ? (
            <nav className="flex items-center overflow-hidden rounded-radius-lg bg-[hsl(var(--app-control))] text-control text-foreground">
              <div className="flex h-[52px] max-w-[270px] items-center gap-space-2 border-r border-[hsl(var(--app-divider))] px-space-4">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("nav.location")}</span>
              </div>
              <Link to="/restaurants" className="flex h-[52px] items-center gap-space-2 px-space-4">
                <Clock className="h-4 w-4 shrink-0" />
                <span>{t("nav.now")}</span>
              </Link>
            </nav>
          ) : null}

          {!rightContent && !hideNav && (
            <>
              <LanguageMenu />
              <ThemeToggle />
              {isAuthenticated ? (
                <AccountMenu />
              ) : (
                <Button asChild variant="nav" size="nav">
                  <Link to="/auth">{t("nav.logIn")}</Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Secondary Nav Row: Back Button + Breadcrumb */}
      {showSecondaryNav && (
        <div className="border-t border-[hsl(var(--app-divider))] bg-background">
          <div className="market-content flex h-14 items-center justify-between gap-space-6">
            <div className="flex min-w-0 items-center gap-space-3 text-control text-muted-foreground">
              {showBackButton && (
                <Button 
                  variant="tertiary" 
                  size="sm"
                  onClick={handleBack}
                  className="-ml-3 rounded-radius-full px-space-3 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("common.back")}
                </Button>
              )}

              {breadcrumb && (
                <nav className="flex min-w-0 items-center gap-space-2" aria-label="Breadcrumb">
                  <Link to="/" className="shrink-0 transition-colors hover:text-foreground">
                    {t("common.home")}
                  </Link>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  <span className="truncate text-foreground">{breadcrumb}</span>
                </nav>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
