import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountMenu } from "@/components/AccountMenu";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { LocationSelector } from "@/components/LocationSelector";
import { CartButton } from "@/components/CartButton";
import { useCart } from "@/contexts/CartContext";
import { NotificationsIcon, SearchIcon, ShoppingBagIcon } from "@/components/icons/FigmaIcons";

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
}

export function HomeHeader({ title, showBackButton = false, onBack, variant = "title" }: HomeHeaderProps) {
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
            className="flex min-w-0 flex-1 items-center gap-2 rounded-radius-md bg-background px-3 py-2 text-left transition-colors hover:bg-muted"
          >
            <SearchIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="truncate text-[16px] tracking-[-0.32px] text-muted-foreground">
              Search on EverySub
            </span>
          </button>

          <button
            type="button"
            aria-label="Notifications"
            onClick={() => navigate("/notifications")}
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
    <header className="sticky top-0 z-40 bg-background border-b border-border/40 md:hidden">
      <div className="relative flex items-center px-4" style={{ height: "56px" }}>
        {/* Left */}
        <div className="w-10 shrink-0">
          {showBackButton && (
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Back" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Center — native mobile pattern: a back button on the left plus the
            page title in the centre. */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="max-w-[60vw] truncate text-[17px] font-black tracking-tight text-foreground">
            {title ?? "EverySub"}
          </span>
        </div>

        {/* Right */}
        <div className="ml-auto flex shrink-0 items-center justify-end gap-0.5">
          <CartButton />
          {authLoading ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          ) : isAuthenticated ? (
            <AccountMenu />
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors hover:opacity-80 yd-circle yd-text"
            >
              Log in
            </button>
          )}
        </div>
      </div>

      {/* Global location selector (self-hides when no residences exist) */}
      <LocationSelector variant="full" />
    </header>
  );
}
