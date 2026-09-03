import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { LocationSelector } from "@/components/patterns/LocationSelector";
import { useCart } from "@/contexts/CartContext";
import { prefetchRoute } from "@/lib/routeChunks";
import { cn } from "@/lib/utils";
import {
  KeyboardArrowLeftIcon, NotificationsIcon, SearchIcon, ShoppingBagIcon,
} from "@/components/icons/FigmaIcons";

interface HomeHeaderProps {
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  /**
   * The home layout from the Figma screen: the brand sits on the LEFT next to
   * the bag mark, with the location and notification icon buttons on the
   * right. Every other screen keeps the centred-title chrome, because a back
   * button plus a centred title is what a subpage is expected to look like.
   */
  variant?: "brand" | "title";
  /**
   * The title bar alone, with no rounding and no location row — for a page
   * that continues the white panel underneath it (see ListingHeader).
   */
  bare?: boolean;
  /**
   * Replaces the right-hand action on the title bar.
   *
   * A notification bell is the right thing on most subpages, but not on a page
   * whose whole purpose is one thing a person might want to send to someone
   * else. A plan puts Share there instead.
   */
  rightAction?: React.ReactNode;
}

export function HomeHeader({ title, showBackButton = false, onBack, variant = "title", bare = false, rightAction }: HomeHeaderProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { count: cartCount } = useCart();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    navigate(-1);
  };

  if (variant === "brand") {
    return (
      // 64px, white, 8px side padding — the design's own measurements. The
      // search field is the middle of the header rather than a screen you have
      // to find: "where do I get my car washed" is a question the app can
      // answer, and until now the only way to ask it was to guess which
      // service it lived under.
      <header className="sticky top-0 z-40 bg-card md:hidden">
        <div className="flex h-16 items-center gap-2 px-2">
          <Link
            to="/cart"
            aria-label="Cart"
            onPointerDown={() => prefetchRoute("/cart")}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
          >
            <ShoppingBagIcon className="h-6 w-6" />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black leading-none text-primary-foreground">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {/* A button, not an input: typing happens on the search screen, and a
              field that quietly does nothing where you tapped it is worse than
              one that takes you somewhere. */}
          <button
            type="button"
            onClick={() => navigate("/search")}
            onPointerDown={() => prefetchRoute("/search")}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-radius-md bg-background px-3 py-2 text-left transition-colors hover:bg-muted"
          >
            <SearchIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="truncate text-[16px] tracking-[-0.32px] text-muted-foreground">
              Search on EverySub
            </span>
          </button>

          {/* Notifications is a protected route, so sending a signed-out
              visitor there opened the page, then the login modal on top of it,
              and left them on a page they could not see. Ask first, go after. */}
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => (isAuthenticated
              ? navigate("/notifications")
              : openAuthModal("login", "/notifications"))}
            onPointerDown={() => isAuthenticated && prefetchRoute("/notifications")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <NotificationsIcon className="h-6 w-6" />
          </button>
        </div>

        {/* The location moved out of the icon row into a row of its own, where
            it can say WHICH location instead of being a pin you have to press
            to find out. */}
        <LocationSelector variant="row" />
      </header>
    );
  }

  return (
    // 56px of white: two 40px round buttons inside 8px of padding, with the
    // title centred between them. No bottom border — the page behind it is
    // #f6f6f6, and the white is the separation.
    <header className={cn("sticky top-0 z-40 bg-card md:hidden", !bare && "overflow-hidden rounded-b-radius-lg")}>
      <div className="relative flex items-center justify-between p-2" style={{ height: "56px" }}>
        <div className="h-10 w-10 shrink-0">
          {showBackButton && (
            <button
              type="button"
              aria-label="Back"
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <KeyboardArrowLeftIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Centred on the header, not on what is left of it — a long title has
            to stay centred whether or not there is a back button. */}
        <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center px-14">
          <span className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
            {title ?? "EverySub"}
          </span>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-end">
          {rightAction ?? (authLoading ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          ) : isAuthenticated ? (
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <NotificationsIcon className="h-6 w-6" />
            </button>
          ) : (
            // The bell is worth nothing to someone with no account, and the
            // bottom bar's Account tab is the only other way in from here.
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[16px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Log in
            </button>
          ))}
        </div>
      </div>

      {/* A listing continues the white panel with its own search and location
          rows, so it takes the rounding off this one and puts it at the bottom
          of its own. */}
      {/* The `full` variant put a grey #f6f6f6 strip with square corners at the
          bottom of a white rounded header — wrong colour and wrong shape. The
          row is the same control the listings and the home screen use. */}
      {!bare && <LocationSelector variant="row" className="py-2" />}
    </header>
  );
}
