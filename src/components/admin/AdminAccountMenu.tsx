import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Store, UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownSeparator,
  AppDropdownThemeItem,
} from "@/components/ui/app-dropdown";
import { publicRoutes } from "@/config/adminRoutes";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

export function AdminAccountMenu() {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();


  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const displayName = userData?.name || userData?.display_name || t("profile.user");
  const avatarLabel = displayName.slice(0, 1).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-full bg-primary text-lg font-black text-black transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("nav.account")}
          >
            {avatarLabel}
          </button>
        </DropdownMenuTrigger>

        <AppDropdownContent align="end" className="w-[min(280px,calc(100vw-32px))]">
          <div className="space-y-space-1">
            <AppDropdownItem
              icon={UserRound}
              title={t("profile.pageTitle")}
              onSelect={() => navigate("/account")}
            />
            {/* Leaving the admin panel and leaving the account are different
                things. Only the second existed — so an admin who wanted to look
                at the storefront had to log out and back in. */}
            <AppDropdownItem
              icon={Store}
              title="Go to the site"
              subtitle="Browse EverySub as a customer"
              onSelect={() => navigate(publicRoutes.userSite)}
            />
          </div>

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

    </>
  );
}
