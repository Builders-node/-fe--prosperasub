import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChefHat, List, LogOut, Shield, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownProfile,
  AppDropdownSeparator,
  AppDropdownThemeItem,
} from "@/components/ui/app-dropdown";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";
import { useI18n } from "@/i18n";
import { accountApi } from "@/integrations/supabase/client";
import { ProfileModal } from "@/components/account/ProfileModal";

export function AccountMenu() {
  const { userData, isSuperAdmin, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [profileOpen, setProfileOpen] = useState(false);

  // Elevate the "Platform Admin" entry for users with the admin RBAC role even
  // when their JWT session isn't flagged super_admin (happens when the same
  // account was recently promoted and hasn't refreshed the token yet).
  const { data: rbacAdminData } = useQuery({
    queryKey: ["account-is-admin", userData?.id],
    queryFn: async () => {
      const { data } = await accountApi("/account/is-admin");
      return data as { isAdmin: boolean } | null;
    },
    enabled: isAuthenticated && !!userData?.id && !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const isAdminUser = isSuperAdmin || (rbacAdminData?.isAdmin ?? false);
  const { hasAny: managesBusiness } = useMyBusinesses();

  const handleLogout = async () => { await logout(); navigate("/"); };
  const displayName = userData?.name || userData?.display_name || t("profile.user");
  const avatarLabel = displayName.slice(0, 1).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("nav.account")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-full bg-primary text-lg font-black text-primary-foreground transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {avatarLabel}
          </button>
        </DropdownMenuTrigger>
        <AppDropdownContent align="end">
          <AppDropdownProfile
            title={displayName}
            subtitle={t("profile.openProfile")}
            onSelect={() => setProfileOpen(true)}
          />
          <div className="space-y-space-1">
            <AppDropdownItem icon={List} title={t("profile.bookings")} to="/my-subscriptions" />
            <AppDropdownItem icon={Receipt} title="History" to="/history" />
            <AppDropdownItem icon={Bell} title="Notifications" to="/notifications" />
            {managesBusiness && (
              <AppDropdownItem icon={ChefHat} title="My Business" to="/my-business" />
            )}
          </div>
          {isAdminUser && (
            <>
              <AppDropdownSeparator />
              <div className="space-y-space-1">
                <AppDropdownItem
                  icon={Shield}
                  title={t("profile.platformAdmin")}
                  subtitle={t("profile.platformAdminDescription")}
                  to="/admin/dashboard"
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
              title={t("profile.logOut")}
              onSelect={() => void handleLogout()}
              danger
            />
          </div>
        </AppDropdownContent>
      </DropdownMenu>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
