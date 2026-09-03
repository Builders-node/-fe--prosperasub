import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BadgeDollarSign,
  Store,
  ChevronRight,
  LogOut,
  Menu,
} from "lucide-react";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { LocationSelector } from "@/components/patterns/LocationSelector";
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
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import {
  NAV_SECTIONS,
  type NavItem,
  type NavSection,
} from "@/config/adminNav";
import { publicRoutes } from "@/config/adminRoutes";
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

// ─── Sidebar nav (shared by desktop + mobile) ─────────────────────────────────
function SidebarNav({
  currentPath,
  wrap,
}: {
  currentPath: string;
  wrap?: (el: React.ReactElement) => React.ReactElement;
}) {
  const { canAny, isLoading, isUnknown } = useAdminPermissions();

  // Hide items the admin can't use — but only when we actually KNOW what they
  // can use. While the list is loading, or when the request failed, render
  // everything: a sidebar that pops items in one by one is worse than one that
  // briefly shows a link the user can't open, and a failed fetch used to empty
  // the panel down to Dashboard, which looks like the product broke rather
  // than like an outage. The route guard still refuses the actual page.
  const permissionsUnresolved = isLoading || isUnknown;
  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => permissionsUnresolved || !item.permissions?.length || canAny(item.permissions as never[]),
      ),
    }))
    .filter((section) => section.items.length > 0);

  // Longest match wins, across every section. `/admin/marketplace` is a prefix
  // of `/admin/marketplace/providers`, so a plain prefix test lit up two items
  // at once; the deepest matching path is the one the admin is actually on.
  const activePath = visibleSections
    .flatMap((section) => section.items)
    .flatMap((item) => [item.path, ...(item.alsoActiveOn ?? [])].map((p) => ({ owner: item.path, match: p })))
    .filter(({ match }) => currentPath === match || currentPath.startsWith(`${match}/`))
    .sort((a, b) => b.match.length - a.match.length)[0]?.owner ?? null;

  return (
    <nav
      className="flex-1 space-y-space-5 overflow-y-auto px-space-3 py-space-4"
      aria-label="Admin navigation"
    >
      {visibleSections.map((section) => (
        <NavSectionBlock key={section.title} section={section} activePath={activePath} wrap={wrap} />
      ))}
    </nav>
  );
}

function NavSectionBlock({
  section, activePath, wrap,
}: {
  section: NavSection;
  /** `path` of the single item that won the longest-match test, if any. */
  activePath: string | null;
  wrap?: (el: React.ReactElement) => React.ReactElement;
}) {
  const id = `nav-${section.title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="space-y-space-1" aria-labelledby={id}>
      <h2 id={id} className="px-space-3 pb-space-1 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
        {section.title}
      </h2>
      {section.items.map((item) => (
        <FlatLink key={item.path} item={item} isActive={activePath === item.path} wrap={wrap} />
      ))}
    </section>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
const SuperAdminLayout = ({ children, title, subtitle }: SuperAdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const currentPath = location.pathname;

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  // Footer links (desktop + mobile)
  const SidebarFooter = () => (
    <div className="shrink-0 px-space-3 pb-space-4 pt-space-2 space-y-space-1">
      {/* Leaving the admin panel is not the same as leaving the account, but
          only the second had a button — so seeing the storefront meant logging
          out and back in. */}
      <Link
        to={publicRoutes.userSite}
        className={cn(linkBase, "w-full text-sm text-muted-foreground hover:bg-muted hover:text-foreground")}
      >
        <Store className="h-4 w-4 shrink-0" aria-hidden />
        Go to the site
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
      {/* No border: the page behind it is the separation, the way every panel
          on the customer side is built (DESIGN.md §2). */}
      <aside className="hidden min-h-screen bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        {/* Logo */}
        <div className="flex h-[72px] shrink-0 items-center gap-space-3 px-space-5">
          <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-space-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-radius-md bg-primary text-black">
              <BadgeDollarSign className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="type-card-title truncate">Admin Panel</p>
              <p className="text-caption text-muted-foreground">EverySub</p>
            </div>
          </Link>
        </div>

        <SidebarNav currentPath={currentPath} />
        <SidebarFooter />
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-40 bg-card">
          <div className="flex h-[60px] items-center lg:h-[72px]">

            {/* Mobile hamburger */}
            <div className="flex h-full w-14 shrink-0 items-center justify-center lg:hidden">
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
                  <SheetHeader className="px-space-4 pb-space-2 pt-space-4 text-left">
                    <SheetTitle className="flex items-center gap-space-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-radius-md bg-primary text-black">
                        <BadgeDollarSign className="h-4 w-4" aria-hidden />
                      </span>
                      Admin Panel
                    </SheetTitle>
                    <SheetDescription>EverySub operations</SheetDescription>
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
              <LocationSelector />
              {/* LanguageMenu hidden until the app is translated — see the
                  note in DesktopHeader; a switcher over hardcoded English
                  promised a Spanish that wasn't there. */}
              <AdminAccountMenu />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="app-container min-w-0 py-space-5 lg:py-space-6">
          {title && (
            /* 24px semibold with the design's negative tracking — a page title,
               not a marketing headline. A 36px black heading above a 12px
               caption is what made every admin screen read as a different
               product from the one it administers (DESIGN.md §3). */
            <div className="admin-page-header mb-space-5">
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.5px] text-foreground md:text-[28px] md:tracking-[-0.6px]">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground md:text-[14px]">
                  {subtitle}
                </p>
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
