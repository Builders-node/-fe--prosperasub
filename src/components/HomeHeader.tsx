import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountMenu } from "@/components/AccountMenu";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/contexts/AuthModalContext";

interface HomeHeaderProps {
  title?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function HomeHeader({ title, showBackButton = false, onBack }: HomeHeaderProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    navigate(-1);
  };

  return (
    <header className="sticky top-0 z-40 bg-background/97 backdrop-blur-md border-b border-border/40 md:hidden">
      <div className="relative flex items-center px-4" style={{ height: "56px" }}>
        {/* Left */}
        <div className="w-10 shrink-0">
          {showBackButton && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Back" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-[17px] font-black tracking-tight text-foreground leading-none">ProsperaSub</span>
          {title && <span className="mt-0.5 text-xs font-medium text-muted-foreground">{title}</span>}
        </div>

        {/* Right */}
        <div className="ml-auto w-10 shrink-0 flex justify-end">
          {authLoading ? (
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          ) : isAuthenticated ? (
            <AccountMenu />
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="h-8 rounded-full px-4 text-xs font-semibold transition-colors hover:opacity-80 yd-circle yd-text"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
