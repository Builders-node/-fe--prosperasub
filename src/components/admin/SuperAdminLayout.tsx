import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BadgeDollarSign,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
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
import { publicRoutes } from "@/config/adminRoutes";
import {
  PLATFORM_SECTION,
  SERVICES,
  SETTINGS_SECTION,
  getActiveService,
  type NavItem,
  type ServiceGroup,
} from "@/config/adminNav";
import { cn } from "@/lib/utils";

interface SuperAdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const linkBase =
  "flex min-h-10 items-center gap-space-3 rounded-radius-md px-space-3 py-space-2 text-control transition-colors";
const linkActive = "bg-[hsl(var(--app-control-muted))] text-foreground font-semibold";
const linkIdle =
  "text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground";

// ─── Flat link ────────────────────────────────────────────────────────────────
function FlatLink({
  item,
  isActive,
  wrap,
}: {
  item: NavItem;
  isActive: boolean;
  wrap?: (el: React.ReactElement) => React.ReactElement;
}) {
  const Icon = item.icon;
  const el = (
    <Link
      to={item.path}
      aria-current={isActive ? "page" : undefined}
      className={cn(linkBase, isActive ? linkActive : linkIdle)}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
  return wrap ? wrap(el) : el;
}

// ─── Collapsible service group ────────────────────────────────────────────────
function ServiceDropdown({
  service,
  currentPath,
  wrap,
}: {
  service: ServiceGroup;
  currentPath: string;
  wrap?: (el: React.ReactElement) => React.ReactElement;
}) {
  const isGroupActive = getActiveService(currentPath) === service.id;
  const [open, setOpen] = useState(isGroupActive);

  useEffect(() => {
    if (isGroupActive) setOpen(true);
  }, [isGroupActive]);

  const Icon = service.icon;

  return (
    <div>
      {/* Group header — NOT wrapped in SheetClose so it stays interactive on mobile */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(linkBase, "w-full justify-between", isGroupActive ? linkActive : linkIdle)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-space-3 min-w-0">
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
              service.color,
            )}
          >
            <Icon className="h-3 w-3 text-white" aria-hidden />
          </span>
          <span className="truncate font-semibold">{service.label}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* Animated children */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0 pointer-events-none",
        )}
      >
        <div className="ml-[1.35rem] mt-0.5 space-y-0.5 border-l border-[hsl(var(--app-divider))] pl-3 pb-1">
          {service.items.map((item) => {
            const isActive = currentPath === item.path;
            const el = (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-2.5 rounded-radius-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-[hsl(var(--app-control-muted))] text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground/70",
                  )}
                  aria-hidden
                />
                {item.label}
              </Link>
            );
            return wrap ? wrap(el) : el;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar nav (shared by desktop + mobile) ─────────────────────────────────
function SidebarNav({
  currentPath,
  wrap,
}: {
  currentPath: string;
  wrap?: (el: React.ReactElement) => React.ReactElement;
}) {
  return (
    <nav
      className="flex-1 space-y-space-5 overflow-y-auto px-space-3 py-space-4"
      aria-label="Admin navigation"
    >
      {/* Platform */}
      <section className="space-y-space-1" aria-labelledby="nav-platform">
        <h2
          id="nav-platform"
          className="px-space-3 pb-space-1 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground/70"
        >
          {PLATFORM_SECTION.title}
        </h2>
        {PLATFORM_SECTION.items.map((item) => (
          <FlatLink
            key={item.path}
            item={item}
            isActive={currentPath === item.path}
            wrap={wrap}
          />
        ))}
      </section>

      {/* Services */}
      <section className="space-y-space-1" aria-labelledby="nav-services">
        <h2
          id="nav-services"
          className="px-space-3 pb-space-1 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground/70"
        >
          Services
        </h2>
        {SERVICES.map((service) => (
          <ServiceDropdown
            key={service.id}
            service={service}
            currentPath={currentPath}
            wrap={wrap}
          />
        ))}
      </section>

      {/* Settings */}
      <section className="space-y-space-1" aria-labelledby="nav-settings">
        <h2
          id="nav-settings"
          className="px-space-3 pb-space-1 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground/70"
        >
          {SETTINGS_SECTION.title}
        </h2>
        {SETTINGS_SECTION.items.map((item) => (
          <FlatLink
            key={item.path}
            item={item}
            isActive={currentPath === item.path}
            wrap={wrap}
          />
        ))}
      </section>
    </nav>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
const SuperAdminLayout = ({ children, title, subtitle }: SuperAdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isUserMode } = useUserMode();

  if (isUserMode) {
    navigate("/", { replace: true });
    return null;
  }

  const currentPath = location.pathname;

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  // Footer links (desktop + mobile)
  const SidebarFooter = () => (
    <div className="shrink-0 border-t border-[hsl(var(--app-divider))] px-space-3 py-space-3 space-y-space-1">
      <Link
        to={publicRoutes.userSite}
        className={cn(linkBase, linkIdle, "text-sm")}
      >
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
        View as user
      </Link>
      <button
        type="button"
        onClick={() => void handleLogout()}
        className={cn(linkBase, "w-full text-sm text-destructive hover:bg-destructive/10")}
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        Log out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">

      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden min-h-screen border-r border-[hsl(var(--app-divider))] bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        {/* Logo */}
        <div className="flex h-[72px] shrink-0 items-center gap-space-3 border-b border-[hsl(var(--app-divider))] px-space-5">
          <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-space-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary text-black">
              <BadgeDollarSign className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="type-card-title truncate">Admin Panel</p>
              <p className="text-caption text-muted-foreground">ProsperaSub</p>
            </div>
          </Link>
        </div>

        <SidebarNav currentPath={currentPath} />
        <SidebarFooter />
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-40 border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))]">
          <div className="flex h-[60px] items-center lg:h-[72px]">

            {/* Mobile hamburger */}
            <div className="flex h-full w-14 shrink-0 items-center justify-center border-r border-[hsl(var(--app-divider))] lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Open admin menu"
                  >
                    <Menu className="h-5 w-5" aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-[88vw] max-w-[360px] flex-col p-0">
                  <SheetHeader className="border-b border-[hsl(var(--app-divider))] px-space-4 py-space-4 text-left">
                    <SheetTitle className="flex items-center gap-space-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-radius-md bg-primary text-black">
                        <BadgeDollarSign className="h-4 w-4" aria-hidden />
                      </span>
                      Admin Panel
                    </SheetTitle>
                    <SheetDescription>ProsperaSub operations</SheetDescription>
                  </SheetHeader>

                  {/* On mobile, flat leaf links close the drawer; group headers do not */}
                  <SidebarNav
                    currentPath={currentPath}
                    wrap={(el) => <SheetClose asChild>{el}</SheetClose>}
                  />
                  <SidebarFooter />
                </SheetContent>
              </Sheet>
            </div>

            {/* Breadcrumb */}
            <nav
              className="flex min-w-0 flex-1 items-center gap-space-2 px-space-5 text-control"
              aria-label="Breadcrumb"
            >
              <Link
                to="/admin/dashboard"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                Admin
              </Link>
              {title && (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  <span className="truncate font-semibold text-foreground">{title}</span>
                </>
              )}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-space-3 px-space-5">
              <div className="hidden sm:block">
                <LanguageMenu />
              </div>
              <AdminAccountMenu />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="app-container min-w-0 py-space-5 lg:py-space-6">
          {title && (
            <div className="admin-page-header mb-space-4">
              <h1 className="text-2xl font-black leading-tight tracking-tight md:text-3xl lg:text-4xl">
                {title}
              </h1>
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
