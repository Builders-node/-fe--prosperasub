import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarCheck, LogOut, ShieldCheck, Store } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownProfile,
  AppDropdownSeparator,
  AppDropdownThemeItem,
} from "@/components/ui/app-dropdown";
import { LanguageMenu } from "@/components/LanguageMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { cn } from "@/lib/utils";

/**
 * The car storefront's header, built to read as the same product as
 * everysub.net: the 68px bordered bar, the 19px black wordmark, the round
 * avatar dropdown and the CTA pill are the marketplace's own, reusing its
 * dropdown primitives rather than a second look-alike.
 *
 * What differs is only what a different origin forces: the account entries
 * that live on the marketplace (profile, subscriptions) are absolute links
 * back to everysub.net, because those routes do not exist in this router. The
 * session is shared, so following one lands already signed in.
 */

const MARKETPLACE_ORIGIN = "https://everysub.net";

const goToMarketplace = (path: string) => {
  window.location.href = `${MARKETPLACE_ORIGIN}${path}`;
};

function VehiclesAccountMenu() {
  const { userData, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const displayName = userData?.name || userData?.display_name || "Account";
  const avatarLabel = displayName.slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-black text-primary-foreground transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatarLabel}
        </button>
      </DropdownMenuTrigger>
      <AppDropdownContent align="end">
        <AppDropdownProfile
          title={displayName}
          subtitle="Open profile"
          onSelect={() => goToMarketplace("/account")}
        />
        <div className="space-y-space-1">
          <AppDropdownItem icon={CalendarCheck} title="My bookings" to="/my-bookings" />
          <AppDropdownItem
            icon={Store}
            title="EverySub marketplace"
            onSelect={() => goToMarketplace("/discovery")}
          />
        </div>
        {isSuperAdmin && (
          <>
            <AppDropdownSeparator />
            <div className="space-y-space-1">
              <AppDropdownItem
                icon={ShieldCheck}
                title="Fleet admin"
                subtitle="Vehicles and bookings"
                to="/admin/vehicles"
                endIcon
              />
            </div>
          </>
        )}
        <AppDropdownSeparator />
        <div className="space-y-space-1">
          <AppDropdownThemeItem />
          <AppDropdownItem
            icon={LogOut}
            title="Log out"
            onSelect={() => void logout().then(() => navigate("/"))}
            danger
          />
        </div>
      </AppDropdownContent>
    </DropdownMenu>
  );
}

/** The marketplace's CTA pill, down to the token pair it is painted with. */
function LogInButton() {
  const { openAuthModal } = useAuthModal();
  return (
    <button
      type="button"
      onClick={() => openAuthModal("login")}
      className="h-9 rounded-full px-5 text-[13px] font-semibold transition-colors hover:opacity-80"
      style={{ background: "hsl(var(--yd-cta-bg))", color: "hsl(var(--yd-cta-fg))" }}
    >
      Log in
    </button>
  );
}

function Wordmark() {
  return (
    <Link
      to="/"
      className="shrink-0 text-[19px] font-black tracking-tight text-foreground transition-colors hover:text-primary"
    >
      EverySub <span className="text-primary">Cars</span>
    </Link>
  );
}

export function VehiclesHeader() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();
  const { isSuperAdmin } = useAuth();

  const navItem = (to: string, label: string) => (
    <Link
      key={to}
      to={to}
      className={cn(
        "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
        pathname === to ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  const account = isLoading ? (
    // Same skeleton the marketplace uses — it stops the login→avatar flash.
    <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
  ) : isAuthenticated ? (
    <VehiclesAccountMenu />
  ) : (
    <LogInButton />
  );

  return (
    <>
      {/* Desktop — the marketplace's own bar: 68px, bg-background, hairline rule. */}
      <header className="sticky top-0 z-40 hidden border-b border-border/30 bg-background md:block">
        <div className="app-container flex h-[68px] items-center gap-4">
          <Wordmark />
          <nav className="flex items-center gap-1">
            {navItem("/", "Fleet")}
            {isAuthenticated && navItem("/my-bookings", "My bookings")}
            {isSuperAdmin && navItem("/admin/vehicles", "Admin")}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LanguageMenu />
            {account}
          </div>
        </div>
      </header>

      {/* Mobile — 64px of card, matching the marketplace's brand bar. The nav
          pills that used to sit under it are gone: the tab bar at the bottom of
          the screen is the same three destinations, and saying it twice on a
          phone costs a row of screen for nothing. */}
      <header className="sticky top-0 z-40 bg-card md:hidden">
        <div className="flex h-16 items-center gap-2 px-2">
          <Wordmark />
          <div className="ml-auto flex items-center gap-2">{account}</div>
        </div>
      </header>
    </>
  );
}
