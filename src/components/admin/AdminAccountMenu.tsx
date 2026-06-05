import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, LogOut, Send, UserRound, User } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { publicRoutes } from "@/config/adminRoutes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { useUserMode } from "@/contexts/UserModeContext";
import { supabase } from "@/integrations/supabase/client";

export function AdminAccountMenu() {
  const { userData, refreshUserData, logout } = useAuth();
  const { enterUserMode } = useUserMode();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [showProfileDialog, setShowProfileDialog] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["user-profile", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return null;
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userData.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userData?.id,
  });

  useEffect(() => {
    if (userData) {
      setName(userData.name || userData.display_name || "");
    }
    if (profile) {
      setPhone(profile.phone_number || "");
      setTelegram((profile as any).telegram_username || "");
    }
  }, [userData, profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userData?.id) throw new Error("Not authenticated");

      const pubkey = userData.lightning_pubkey;
      if (pubkey) {
        await supabase.rpc("set_lightning_session", { p_pubkey: pubkey });
      }

      const { data: existingProfile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", userData.id)
        .maybeSingle();

      const profilePayload = {
        phone_number: phone,
        telegram_username: telegram,
      } as any;

      if (existingProfile) {
        const { error } = await supabase
          .from("user_profiles")
          .update(profilePayload)
          .eq("user_id", userData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_profiles")
          .insert({ user_id: userData.id, ...profilePayload } as any);
        if (error) throw error;
      }

      if (userData.auth_provider !== "lightning") {
        const { error } = await supabase.auth.updateUser({
          data: { name },
        });
        if (error) throw error;
      }

      return true;
    },
    onSuccess: () => {
      toast.success(t("profile.updated"));
      setShowProfileDialog(false);
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile-header"] });
      refreshUserData();
    },
    onError: (error: Error) => {
      toast.error(error.message || t("profile.updateFailed"));
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const handleViewAsUser = () => {
    navigate(publicRoutes.userSite);
  };

  const displayName = userData?.name || userData?.display_name || name || t("profile.user");
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
              onSelect={() => setShowProfileDialog(true)}
            />
            <AppDropdownItem
              icon={User}
              title="View as User"
              subtitle="Switch to standard user experience"
              onSelect={enterUserMode}
            />
            <AppDropdownItem
              icon={Eye}
              title={t("profile.viewAsUser")}
              subtitle="Open user site"
              onSelect={handleViewAsUser}
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

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("profile.personalInformation")}</DialogTitle>
            <DialogDescription>{t("profile.personalDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-space-5 py-space-2 sm:grid-cols-2">
            <Input id="admin-name" label={t("profile.name")} value={name} onChange={(event) => setName(event.target.value)} />
            <Input
              id="admin-phone"
              label={t("profile.phone")}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 234 567 8900"
            />
            <Input
              id="admin-telegram"
              label={t("profile.telegram")}
              value={telegram}
              onChange={(event) => setTelegram(event.target.value)}
              placeholder="@username"
              leftIcon={<Send className="h-4 w-4 text-primary" />}
              wrapperClassName="sm:col-span-2"
            />
          </div>

          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} size="xl" className="w-full">
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.saveChanges")
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
