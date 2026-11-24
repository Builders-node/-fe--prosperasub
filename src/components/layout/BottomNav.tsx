import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { getNavigationForRoles, isNavItemActive, type NavItem } from "@/config/navigation";
import { HeaderBadge } from "@/components/layout/HeaderBadge";
import { useEffect } from "react";
import { useCart } from "@/contexts/CartContext";
import { useI18n, type TranslationKey } from "@/i18n";
import { prefetchRoute, prefetchShellRoutes } from "@/lib/routeChunks";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const location = useLocation();
  const { roles, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { count: cartCount } = useCart();
  const { t } = useI18n();

  const navItems = getNavigationForRoles(roles);
  /**
   * The same four tabs for everyone. A bar that grows a tab when you sign in
   * changes shape under the thumb; for a visitor, Subs and Account are still
   * there and a tap opens the login sheet with that tab as the way back.
   */
  const visibleNavItems = navItems;

  // The tab bar is on screen the whole session and its four destinations are
  // where most taps go, so their chunks are fetched once the app goes quiet.
  useEffect(() => {
    prefetchShellRoutes(visibleNavItems.map((i) => i.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNavItems.length]);

  // Never hidden for a visitor: a signed-out page without the bar (Account,
  // Favorites) was a black screen with no way back but the browser's.
  if (visibleNavItems.length <= 1) {
    return null;
  }

  return (
    <BottomNavView
      items={visibleNavItems}
      isActive={(item) => isNavItemActive(item, location.pathname)}
      label={(item) => t(item.label as TranslationKey)}
      cart={cartCount}
      signedIn={isAuthenticated}
      onLocked={(item) => openAuthModal("login", item.path)}
    />
  );
}

/**
 * The tab bar as a picture of its inputs — what the live bar and the states
 * sheet (/dev/navbar) both draw. 60px of white plus the home-indicator inset;
 * 24px glyphs; the active tab is orange and nothing else changes.
 */
export function BottomNavView({ items, isActive, label, cart, signedIn, onLocked, fixed = true, className }: {
  className?: string;
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  label: (item: NavItem) => string;
  cart: number;
  signedIn: boolean;
  onLocked?: (item: NavItem) => void;
  fixed?: boolean;
}) {
  return (
    <nav
      className={cn("z-50 bg-card md:hidden", fixed && "fixed bottom-0 left-0 right-0", className)}
      style={{ paddingBottom: fixed ? "env(safe-area-inset-bottom, 0px)" : undefined }}
    >
      <div className="flex h-[60px] items-stretch">
        {items.map((item) => {
          const active = isActive(item);
          const tone = active ? "text-primary" : "text-muted-foreground";
          const className = "flex flex-1 flex-col items-center justify-center gap-1 p-2 transition-colors";
          // A finger resting on the glass is ~100ms of free time before the
          // click fires — enough for most chunks to arrive.
          const warm = () => prefetchRoute(item.path);
          const inner = (
            <>
              <span className={cn("relative flex h-6 w-6 items-center justify-center", tone)}>
                <item.icon className="h-full w-full" />
                {item.path === "/cart" && <HeaderBadge count={cart} placement="glyph" />}
              </span>
              <span className={cn("text-[12px] leading-4", tone)}>{label(item)}</span>
            </>
          );

          if (item.requiresAuth && !signedIn) {
            return (
              <button key={item.path} type="button" className={className} onClick={() => onLocked?.(item)} onPointerDown={warm}>
                {inner}
              </button>
            );
          }
          return (
            <Link key={item.path} to={item.path} className={className} onPointerDown={warm} onMouseEnter={warm}>
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
