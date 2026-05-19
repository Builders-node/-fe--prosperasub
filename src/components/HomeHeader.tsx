import { Link } from "react-router-dom";
import { CalendarDays, MapPin, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeliveryAddress } from "@/hooks/useDeliveryAddress";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/i18n";

export function HomeHeader() {
  const { isAuthenticated, userData } = useAuth();
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

  return (
    <header className="sticky top-0 z-40 border-b border-[hsl(var(--app-divider))] bg-[hsl(var(--app-chrome))] px-space-4 py-space-3 md:hidden">
      <div className="flex items-center gap-space-3">
        <div className="flex-shrink-0 scale-75 origin-left">
          <ThemeToggle />
        </div>

        <Link
          to={isAuthenticated ? "/" : "/auth"}
          className="flex min-w-0 flex-1 items-center justify-center gap-space-1 rounded-radius-full bg-[hsl(var(--app-control))] px-space-3 py-space-2 text-control text-foreground transition-colors hover:bg-[hsl(var(--app-control-muted))]"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{displayAddress}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        {/* My Subscriptions (replaces Cart) */}
        <Link to={isAuthenticated ? "/my-subscriptions" : "/auth"} className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-radius-full bg-[hsl(var(--app-control))] flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-foreground" />
          </div>
          {/* Badge - shows active subscription count */}
          {(subscriptionCount ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-radius-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
              {subscriptionCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
