import { ReactNode, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Menu,
  Calendar,
  Users,
  LayoutDashboard,
  CreditCard,
  ArrowLeft,
  AlertCircle,
  Building2,
  ChefHat,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { useRestaurant } from "@/contexts/RestaurantContext";
import RestaurantSwitcher from "./RestaurantSwitcher";
import { BottomNav } from "@/components/BottomNav";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { LanguageMenu } from "@/components/LanguageMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface RestaurantAdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
}

const MENU_SECTIONS = [
  {
    title: "Overview",
    items: [
      {
        path: "dashboard",
        label: "Dashboard",
        description: "Today, week, subscribers",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { path: "menu", label: "Menus", icon: Menu },
      { path: "plans", label: "Plans", icon: CreditCard },
      { path: "subscribers", label: "Subscribers", icon: Users },
      { path: "meals", label: "Today's Meals", icon: Calendar },
    ],
  },
];

const RestaurantAdminLayout = ({ 
  children, 
  title, 
  subtitle,
  showBackButton = true 
}: RestaurantAdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    restaurantId, 
    activeRestaurant, 
    restaurants, 
    isLoading, 
    error,
    hasAccessTo,
    goToRestaurantList,
  } = useRestaurant();

  // Redirect to restaurant list if no restaurant is selected
  useEffect(() => {
    if (!isLoading && !restaurantId && restaurants.length > 0) {
      // If we're at /restaurant without an ID, redirect to list or first restaurant
      if (location.pathname === '/restaurant' || location.pathname === '/restaurant/') {
        // Stay on list page
      } else {
        goToRestaurantList();
      }
    }
  }, [isLoading, restaurantId, restaurants, location.pathname, goToRestaurantList]);

  // Get current page type from URL
  const getCurrentPage = () => {
    const match = location.pathname.match(/\/restaurant\/[^/]+\/(.+)/);
    return match ? match[1] : 'dashboard';
  };

  const currentPage = getCurrentPage();

  const renderAdminChrome = (content: ReactNode) => (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))]">
        <div className="flex h-[76px] items-center">
          <Link
            to="/"
            className="flex h-full w-[92px] shrink-0 items-center justify-center border-r border-[hsl(var(--app-divider))]"
            aria-label="Go to home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-radius-full bg-[hsl(var(--app-logo-bg))] font-display text-2xl font-black leading-none text-[hsl(var(--app-logo-foreground))]">
              @
            </span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-space-3 px-space-6 text-control" aria-label="Breadcrumb">
            <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
            <span className="truncate font-semibold text-foreground">Restaurant Admin</span>
          </nav>

          <div className="flex items-center gap-space-3 px-space-5">
            <LanguageMenu />
            <ThemeToggle />
            <AdminAccountMenu />
          </div>
        </div>
      </header>
      {content}
    </div>
  );

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error if user doesn't have access
  if (restaurantId && !hasAccessTo(restaurantId)) {
    return renderAdminChrome(
      <main className="mx-auto max-w-[720px] px-space-4 py-space-12">
        <Button variant="tertiary" onClick={goToRestaurantList} className="mb-space-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Restaurants
            </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to access this restaurant.
            Please contact an administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  // Show error state
  if (error) {
    return renderAdminChrome(
      <main className="mx-auto max-w-[720px] px-space-4 py-space-12">
        <Button variant="tertiary" onClick={() => navigate('/')} className="mb-space-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error.message || "Failed to load restaurant data. Please try again."}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[292px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-[hsl(var(--app-divider))] bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-[76px] items-center gap-space-3 border-b border-[hsl(var(--app-divider))] px-space-5">
          <Link to="/restaurant" className="flex min-w-0 items-center gap-space-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-radius-md bg-primary text-black">
              <ChefHat className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="type-card-title truncate">Restaurant Admin</p>
              <p className="text-caption text-muted-foreground">Partner operations</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-space-6 overflow-y-auto px-space-3 py-space-6" aria-label="Restaurant admin navigation">
          {restaurantId && activeRestaurant ? (
            MENU_SECTIONS.map((section) => (
              <section key={section.title} className="space-y-space-2">
                <h2 className="px-space-3 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {section.title}
                </h2>

                <div className="space-y-space-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = currentPage === item.path;

                    return (
                      <Link
                        key={item.path}
                        to={`/restaurant/${restaurantId}/${item.path}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[56px] items-center gap-space-3 rounded-radius-md px-space-4 py-space-3 text-control transition-colors",
                          active
                            ? "bg-[hsl(var(--app-control-muted))] text-foreground"
                            : "text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn("h-5 w-5 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{item.label}</span>
                          {"description" in item && item.description && (
                            <span className="mt-0.5 block truncate text-caption font-medium text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4 text-sm font-semibold text-muted-foreground">
              Select a restaurant to manage operations.
            </div>
          )}
        </nav>

        <div className="space-y-space-3 border-t border-[hsl(var(--app-divider))] p-space-3">
          {restaurantId && activeRestaurant ? (
            <>
              <RestaurantSwitcher />
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                <div className="flex items-center gap-space-3">
                  {activeRestaurant.logo_url ? (
                    <img
                      src={activeRestaurant.logo_url}
                      alt=""
                      className="h-10 w-10 rounded-radius-md object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary/15">
                      <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-control font-bold">{activeRestaurant.name}</p>
                    <p className="mt-space-1 truncate text-caption text-muted-foreground">
                      {activeRestaurant.address || "Restaurant partner"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Button variant="secondary" onClick={goToRestaurantList} className="w-full">
              View Restaurants
            </Button>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))]">
          <div className="flex h-[76px] items-center">
            <Link
              to="/"
              className="flex h-full w-[92px] shrink-0 items-center justify-center border-r border-[hsl(var(--app-divider))]"
              aria-label="Go to home"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-radius-full bg-[hsl(var(--app-logo-bg))] font-display text-2xl font-black leading-none text-[hsl(var(--app-logo-foreground))]">
                @
              </span>
            </Link>

            <nav className="flex min-w-0 flex-1 items-center gap-space-3 px-space-6 text-control" aria-label="Breadcrumb">
              <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">
                Home
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              <Link to="/restaurant" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">
                Restaurant Admin
              </Link>
              {activeRestaurant && (
                <>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/70 sm:block" aria-hidden="true" />
                  <span className="truncate font-semibold text-foreground">{activeRestaurant.name}</span>
                </>
              )}
            </nav>

            <div className="flex items-center gap-space-3 px-space-5">
              <LanguageMenu />
              <ThemeToggle />
              <AdminAccountMenu />
            </div>
          </div>
        </header>

        {restaurantId && activeRestaurant && (
          <div className="border-b border-[hsl(var(--app-divider))] bg-background lg:hidden">
            <div className="px-space-4">
              <nav className="flex items-center gap-space-2 overflow-x-auto py-space-3" aria-label="Restaurant admin navigation">
                {MENU_SECTIONS.flatMap((section) => section.items).map((item) => {
                  const Icon = item.icon;
                  const active = currentPage === item.path;
                  return (
                    <Button
                      key={item.path}
                      asChild
                      variant="rail"
                      size="chip"
                      data-state={active ? "active" : "inactive"}
                    >
                      <Link to={`/restaurant/${restaurantId}/${item.path}`}>
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </Button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        <main className="mx-auto min-w-0 max-w-[1600px] px-space-4 py-space-8 pb-space-24 md:px-space-8 md:pb-space-8 xl:px-space-12">
          {(title || activeRestaurant) && (
            <div className="mb-space-8">
              {showBackButton && restaurantId && (
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={goToRestaurantList}
                  className="mb-space-4 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  All Restaurants
                </Button>
              )}
              <div>
                <h1 className="type-page-title">
                  {title || activeRestaurant?.name || "Restaurant Admin"}
                </h1>
                {(subtitle || activeRestaurant?.address) && (
                  <p className="mt-space-2 type-body-large text-muted-foreground">
                    {subtitle || activeRestaurant?.address}
                  </p>
                )}
              </div>
            </div>
          )}

          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

export default RestaurantAdminLayout;
