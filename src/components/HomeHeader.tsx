import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeliveryAddress } from "@/hooks/useDeliveryAddress";
import { useI18n } from "@/i18n";
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
  const { isAuthenticated, userData } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { defaultAddress, hasDefaultAddress } = useDeliveryAddress();
  const { t } = useI18n();

  // Count active subscriptions
  const { data: subscriptionCount } = useQuery({
    queryKey: ["subscription-count", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return 0;
      const { count } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userData.id)
        .eq('is_active', true);
      return count || 0;
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const displayAddress = hasDefaultAddress ? defaultAddress?.address : t("nav.setDeliveryAddress");

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    navigate(-1);
  };

  return (
    <header className="sticky top-0 z-40 bg-background/97 backdrop-blur-md border-b border-border/40 md:hidden">
      {/* Yandex Go style: left action | centered brand | right action */}
      <div className="relative flex items-center px-4" style={{ height: "56px" }}>

        {/* ── Left slot ── */}
        <div className="w-10 shrink-0">
          {showBackButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="Back"
              onClick={handleBack}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* ── Center: logo + address/title (absolutely centered) ── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-[17px] font-black tracking-tight text-foreground leading-none">
            ProsperaSub
          </span>
          {title ? (
            <span className="mt-0.5 text-xs font-medium text-muted-foreground">{title}</span>
          ) : (
            <Link
              to={isAuthenticated ? "/" : "#"}
            onClick={!isAuthenticated ? (e) => { e.preventDefault(); openAuthModal("login"); } : undefined}
              className="pointer-events-auto mt-0.5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <MapPin className="h-3 w-3 text-primary shrink-0" />
              <span className="max-w-[160px] truncate">{displayAddress}</span>
              <span className="text-primary">›</span>
            </Link>
          )}
        </div>

        {/* ── Right slot ── */}
        <div className="ml-auto w-10 shrink-0 flex justify-end">
          {isAuthenticated ? (
            <div className="relative">
              <AccountMenu />
              {(subscriptionCount ?? 0) > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
                  {subscriptionCount}
                </span>
              )}
            </div>
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
