import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountMenu } from "@/components/AccountMenu";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { LocationSelector } from "@/components/LocationSelector";
import { CartButton } from "@/components/CartButton";
import { NotificationsIcon, ShoppingBagIcon } from "@/components/icons/FigmaIcons";

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

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    navigate(-1);
  };

  if (variant === "brand") {
    return (
      // 56px tall, white, 16px left / 8px right padding — the design's own
      // measurements. No bottom border: the white panel underneath carries the
      // separation with its 24px rounded corners.
      <header className="sticky top-0 z-40 bg-card md:hidden">
        <div className="flex h-14 items-center gap-2 pl-4 pr-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ShoppingBagIcon className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
              EverySub
            </span>
          </div>

          <div className="flex shrink-0 items-center">
            <LocationSelector variant="icon" />
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <NotificationsIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
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
