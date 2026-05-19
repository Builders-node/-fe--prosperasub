import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Store, 
  Settings, 
  CreditCard,
  SparklesIcon,
  Zap,
  BadgeDollarSign,
  ChevronRight,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { LanguageMenu } from "@/components/LanguageMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface SuperAdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const MENU_SECTIONS = [
  {
    title: "Overview",
    items: [
      {
        path: "/admin/dashboard",
        label: "Overview",
        description: "All subscriptions, all payments & more",
        icon: LayoutDashboard,
      },
      { path: "/admin/subscriptions", label: "All subscriptions", icon: CreditCard },
      { path: "/admin/payments", label: "All payments", icon: Zap },
    ],
  },
  {
    title: "Services",
    items: [
      { path: "/admin/cleaning", label: "Cleaning", icon: SparklesIcon },
      { path: "/admin/restaurants", label: "Restaurants", icon: Store },
    ],
  },
  {
    title: "Settings",
    items: [
      { path: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const SuperAdminLayout = ({ 
  children, 
  title,
  subtitle
}: SuperAdminLayoutProps) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[292px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-[hsl(var(--app-divider))] bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-[76px] items-center gap-space-3 border-b border-[hsl(var(--app-divider))] px-space-5">
          <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-space-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-radius-md bg-primary text-black">
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="type-card-title truncate">Admin Panel</p>
              <p className="text-caption text-muted-foreground">ProsperaSub operations</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-space-6 overflow-y-auto px-space-3 py-space-6" aria-label="Admin navigation">
          {MENU_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-space-2">
              <h2 className="px-space-3 text-caption font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {section.title}
              </h2>

              <div className="space-y-space-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
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
          ))}
        </nav>

        <div className="border-t border-[hsl(var(--app-divider))] p-space-3">
          <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
            <p className="text-control font-bold">Super Admin</p>
            <p className="mt-space-1 text-caption text-muted-foreground">Full platform access</p>
          </div>
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
              <span className="truncate font-semibold text-foreground">Super Admin</span>
            </nav>

            <div className="flex items-center gap-space-3 px-space-5">
              <LanguageMenu />
              <ThemeToggle />
              <AdminAccountMenu />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto min-w-0 max-w-[1600px] px-space-4 py-space-8 pb-space-24 md:px-space-8 md:pb-space-8 xl:px-space-12">
          {/* Page Header */}
          {title && (
            <div className="mb-space-8">
              <h1 className="type-page-title">{title}</h1>
              {subtitle && (
                <p className="mt-space-2 type-body-large text-muted-foreground">{subtitle}</p>
              )}
            </div>
          )}

          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

export default SuperAdminLayout;
