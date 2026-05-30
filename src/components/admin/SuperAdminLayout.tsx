import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Store,
  Settings,
  CreditCard,
  SparklesIcon,
  Zap,
  BadgeDollarSign,
  ChevronRight,
  Users,
  ExternalLink,
  LogOut,
  Menu,
  UtensilsCrossed,
} from "lucide-react";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { LanguageMenu } from "@/components/LanguageMenu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useUserMode } from "@/contexts/UserModeContext";
import { adminRoutes, publicRoutes } from "@/config/adminRoutes";
import { cn } from "@/lib/utils";

interface SuperAdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const MENU_SECTIONS = [
  {
    title: "Platform",
    items: [
      {
        path: adminRoutes.superAdminDashboard,
        label: "Overview",
        icon: LayoutDashboard,
      },
      { path: adminRoutes.superAdminPayments, label: "Finance", icon: Zap },
      { path: adminRoutes.superAdminUsers, label: "Users", icon: Users },
    ],
  },
  {
    title: "Products",
    items: [
      { path: adminRoutes.superAdminCleaningPlans, label: "Plans", icon: CreditCard },
      { path: adminRoutes.superAdminCleaning, label: "Operations", icon: SparklesIcon },
    ],
  },
  {
    title: "Settings",
    items: [
      { path: adminRoutes.superAdminSettings, label: "Settings", icon: Settings },
    ],
  },
];

const SuperAdminLayout = ({
  children,
  title,
  subtitle
}: SuperAdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isUserMode } = useUserMode();

  // Redirect to home if admin has switched to user mode and somehow ended up here
  if (isUserMode) {
    navigate("/", { replace: true });
    return null;
  }

  const isActive = (path: string) => location.pathname === path;
  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const renderMenuLink = (item: (typeof MENU_SECTIONS)[number]["items"][number]) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-[52px] items-center gap-space-3 rounded-radius-md px-space-4 py-space-3 text-control transition-colors",
          active
            ? "bg-[hsl(var(--app-control-muted))] text-foreground"
            : "text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground",
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
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
  };

  const renderMobileDrawer = () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="tertiary" size="icon" className="h-11 w-11" aria-label="Open admin menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[88vw] max-w-[360px] flex-col p-0">
        <SheetHeader className="border-b border-[hsl(var(--app-divider))] px-space-5 py-space-5 text-left">
          <SheetTitle className="flex items-center gap-space-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary text-black">
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </span>
            Admin Panel
          </SheetTitle>
          <SheetDescription>ProsperaSub operations</SheetDescription>
        </SheetHeader>

        <nav className="flex-1 space-y-space-6 overflow-y-auto px-space-3 py-space-5" aria-label="Mobile admin navigation">
          {MENU_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-space-2">
              <h2 className="px-space-3 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {section.title}
              </h2>
              <div className="space-y-space-1">
                {section.items.map((item) => (
                  <SheetClose key={item.path} asChild>
                    {renderMenuLink(item)}
                  </SheetClose>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="space-y-space-1 border-t border-[hsl(var(--app-divider))] p-space-3">
          <SheetClose asChild>
            <a
              href={publicRoutes.userSite}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center gap-space-3 rounded-radius-md px-space-3 text-body-md font-semibold text-muted-foreground transition hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground"
            >
              <ExternalLink className="h-5 w-5" aria-hidden="true" />
              View as user
            </a>
          </SheetClose>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-12 w-full items-center gap-space-3 rounded-radius-md px-space-3 text-body-md font-semibold text-destructive transition hover:bg-destructive/10"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Log out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      {/* Desktop Sidebar */}
      <aside className="hidden min-h-screen border-r border-[hsl(var(--app-divider))] bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        {/* Logo */}
        <div className="flex h-[60px] shrink-0 items-center gap-space-3 border-b border-[hsl(var(--app-divider))] px-space-5 lg:h-[72px]">
          <Link to={adminRoutes.superAdminDashboard} className="flex min-w-0 items-center gap-space-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary text-black">
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="type-card-title truncate">Admin Panel</p>
              <p className="text-caption text-muted-foreground">ProsperaSub</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-space-5 overflow-y-auto px-space-3 py-space-5" aria-label="Admin navigation">
          {MENU_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-space-1">
              <h2 className="px-space-4 pb-space-1 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                {section.title}
              </h2>
              <div>
                {section.items.map((item) => renderMenuLink(item))}
              </div>
            </section>
          ))}
        </nav>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-[hsl(var(--app-divider))] px-space-3 py-space-3 space-y-space-1">
          <a
            href={publicRoutes.userSite}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center gap-space-3 rounded-radius-md px-space-4 text-control font-semibold text-muted-foreground transition hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            View as user
          </a>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-10 w-full items-center gap-space-3 rounded-radius-md px-space-4 text-control font-semibold text-destructive transition hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-40 border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))]">
          <div className="flex h-[60px] items-center lg:h-[72px]">
            {/* Mobile hamburger */}
            <div className="flex h-full w-14 shrink-0 items-center justify-center border-r border-[hsl(var(--app-divider))] lg:hidden">
              {renderMobileDrawer()}
            </div>
            {/* Desktop logo mark */}
            <Link
              to={adminRoutes.superAdminDashboard}
              className="hidden h-full w-[72px] shrink-0 items-center justify-center border-r border-[hsl(var(--app-divider))] lg:flex"
              aria-label="Go to admin dashboard"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-radius-full bg-[hsl(var(--app-logo-bg))] font-display text-2xl font-black leading-none text-[hsl(var(--app-logo-foreground))]">
                @
              </span>
            </Link>

            {/* Breadcrumb */}
            <nav className="flex min-w-0 flex-1 items-center gap-space-2 px-space-5 text-control" aria-label="Breadcrumb">
              <Link to={adminRoutes.superAdminDashboard} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
                Admin
              </Link>
              {title && (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                  <span className="truncate font-semibold text-foreground">{title}</span>
                </>
              )}
            </nav>

            {/* Header actions */}
            <div className="flex items-center gap-space-3 px-space-5">
              <div className="hidden sm:block">
                <LanguageMenu />
              </div>
              <AdminAccountMenu />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto min-w-0 max-w-[1600px] px-space-4 py-space-6 md:px-space-6 lg:px-space-8 lg:py-space-8 xl:px-space-12">
          {title && (
            <div className="admin-page-header">
              <h1 className="text-2xl font-black leading-tight tracking-tight md:text-3xl lg:text-4xl">{title}</h1>
              {subtitle && (
                <p className="mt-space-2 type-body-large text-muted-foreground">{subtitle}</p>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
