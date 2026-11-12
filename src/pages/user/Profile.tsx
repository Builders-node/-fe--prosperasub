import { fieldClass } from "@/components/ui/input";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, BellOff, Eye, EyeOff, FileText, Gift, Heart, KeyRound, Lock, LogOut, MapPin, Pencil, Shield, Wallet } from "lucide-react";
import { useFavorites } from "@/lib/favorites/useFavorites";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { UserLayout } from "@/components/layout/UserLayout";
import { DecisionBar } from "@/components/patterns/DecisionBar";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { KeyboardArrowRightIcon } from "@/components/icons/FigmaIcons";
import { SavedLocations, useUserLocations } from "@/components/account/SavedLocations";
import { ReferralPanel } from "@/components/account/ReferralPanel";
import { WalletPanel } from "@/components/account/WalletPanel";
import { FavoritesPanel } from "@/pages/user/Favorites";
import { useIsMobile } from "@/hooks/use-mobile";
import { HEADER_ACTION_CLASS } from "@/components/layout/headerAction";
import { useReferrals } from "@/hooks/useReferrals";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { accountApi, supabase, supabaseDb } from "@/integrations/supabase/client";
import { useBonusBalance } from "@/hooks/useBonusBalance";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useUserUuid } from "@/hooks/useUserUuid";
import { formatUSD } from "@/lib/pricing";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { cn } from "@/lib/utils";

/**
 * The profile, as a page.
 *
 * It used to be a sheet on a phone and a 340px dialog on a desktop, with four
 * screens stacked inside one overlay and its own back arrow. That made the
 * hardware back button close the whole thing from three levels down, and made
 * the profile the one surface with no address of its own.
 *
 * Each section is a real URL (`/account?section=edit`), so Back walks back one
 * step, a section can be linked to, and a reload lands where you were.
 */

type Section = "view" | "edit" | "password" | "locations" | "reminders" | "referrals" | "wallet" | "favorites";

const SECTION_TITLES: Record<Section, string> = {
  view: "Profile",
  favorites: "Favourites",
  edit: "Edit Profile",
  password: "Change Password",
  locations: "Saved Locations",
  reminders: "Reminders",
  referrals: "Invite a Friend",
  wallet: "Balance",
};

interface CleaningPrefs {
  reminder_enabled: boolean;
  reminder_method: string;
  reminder_minutes_before: number;
  access_instructions: string | null;
  /** Service (archetype) keys to be reminded about; null = all of them. */
  reminder_services?: string[] | null;
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.16 13.28l-2.966-.924c-.643-.204-.657-.643.136-.953l11.58-4.461c.537-.194 1.006.131.984.279z"/>
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function PasswordInput({ id, label, value, onChange, placeholder, error, autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-meta font-semibold text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          id={id} type={show ? "text" : "password"} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-radius-md bg-card px-4 py-3 pr-11 text-title text-foreground shadow-figma outline-none placeholder:text-muted-foreground"
        />
        <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? "Hide" : "Show"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-meta text-destructive">{error}</p>}
    </div>
  );
}

function PillSelector<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    // The system segment (bg-inset track, bg-segment thumb) — the same control
    // as the home screen's family switch. Yellow is for the Save below it.
    <div className="flex rounded-radius-md bg-inset p-0.5">
      {options.map((opt) => (
        <button key={String(opt.value)} type="button" onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-radius-md px-2 py-2 text-body font-semibold transition-colors",
            value === opt.value
              ? "bg-segment text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function reminderLabel(min: number) {
  if (min < 60) return `${min} min before`;
  if (min === 60) return "1 hour before";
  if (min < 1440) return `${min / 60} hours before`;
  return "1 day before";
}

function methodLabel(m: string) {
  if (m === "email") return "Email";
  if (m === "in_app") return "In-app";
  return "All channels";
}

/**
 * One row of a settings card.
 *
 * The shape is the home screen's shortcut row: a 40px tile with a 24px glyph,
 * a 16px title and a 12px caption under it. The tile is `bg-inset` because the
 * row sits INSIDE a white card — that is the one token that goes down in light
 * and up in dark, which is what "inside a card" means (DESIGN.md, Layers).
 * The rows used to separate with a hairline; separation here is the gap, the
 * same way the design does it everywhere else.
 */
function Row({
  icon: Icon, label, value, onClick, tone = "default", active = false,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value?: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "accent" | "danger";
  /** The section open beside the menu (laptop). */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn("flex w-full items-center gap-3 rounded-radius-md p-3 text-left transition-colors hover:bg-inset", active && "bg-inset")}
    >
      <span className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]",
        tone === "accent" ? "bg-primary text-primary-foreground"
        : tone === "danger" ? "bg-destructive/10 text-destructive"
        : "bg-inset text-muted-foreground",
      )}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn(
          "block truncate text-title font-semibold",
          tone === "danger" ? "text-destructive" : "text-foreground",
        )}>{label}</span>
        {value && (
          <span className="block truncate text-meta text-muted-foreground">{value}</span>
        )}
      </span>
      <KeyboardArrowRightIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * The save bar a form section ends with — the decision frame (PAGE_TYPES):
 * one full-width primary pinned to the bottom of a phone, no tab bar under it
 * and no Cancel beside it, because the title bar's Back already is Cancel.
 */
function SaveBar({ label, busyLabel, busy, disabled, onClick }: {
  label: string; busyLabel: string; busy: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <DecisionBar className="pb-6 md:mt-space-4 md:bg-transparent md:pb-0">
      <div className="px-4 py-2 md:px-0 md:py-0">
        <Button size="lg" className="w-full text-title font-semibold" onClick={onClick} loading={busy} disabled={disabled || busy}>
          {busy ? <><Spinner size="sm" /> {busyLabel}</> : label}
        </Button>
      </div>
    </DecisionBar>
  );
}

/** One figure in the profile card, and the door to where it comes from. */
function Stat({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-radius-md bg-inset px-3 py-2.5 text-left transition-colors hover:bg-muted">
      <span className="block text-meta text-muted-foreground">{label}</span>
      <span className="mt-0.5 block text-title font-semibold tabular-nums text-foreground">{value}</span>
    </button>
  );
}

/** 20px semibold — the one heading size the design gives a section. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-space-6 px-1 text-heading font-semibold text-foreground">{children}</h2>
  );
}

const Profile = () => {
  const navigate = useNavigate();
  const favorites = useFavorites();
  const [params, setParams] = useSearchParams();
  const { userData, refreshUserData, isAdmin, isAdminResolved, logout } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const referrals = useReferrals();
  const { archetypes } = useServiceArchetypes(true);
  const bonus = useBonusBalance();
  const userUuid = useUserUuid();
  /** The wallet's balance in cents — null until known (or when the API is unreachable). */
  const walletQ = useQuery({
    queryKey: ["wallet-balance"],
    enabled: !!userData?.id,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await accountApi("/account/wallet");
      if (error) return null;
      return Number((data as { balanceCents?: number } | null)?.balanceCents ?? 0);
    },
  });
  /** Purchases that are on right now, every service (subscriptions_unified). */
  const activeSubsQ = useQuery({
    queryKey: ["active-subscription-count", userUuid, userData?.id],
    enabled: !!userData?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const ids = [...new Set([userUuid, userData?.id].filter(Boolean) as string[])];
      const { count, error } = await supabaseDb.from("subscriptions_unified")
        .select("id", { count: "exact", head: true }).in("user_id", ids).eq("status", "active");
      return error ? null : count ?? 0;
    },
  });
  const section = (params.get("section") as Section) || "view";
  /**
   * A phone walks into a section and back out (one screen at a time). A laptop
   * keeps the menu on the left and opens the section beside it, on this page —
   * Favourites when nothing is chosen.
   */
  const isMobile = useIsMobile();
  /** Edit profile is a modal over the page, not a screen of its own. */
  const editOpen = section === "edit";
  const base: Section = editOpen ? "view" : section;
  const active: Section = !isMobile && base === "view" ? "favorites" : base;
  const isForm = base === "password" || base === "reminders";
  /** Sub-screens: no tab bar and no bell — Back is the way out. */
  const isSubScreen = isForm || base === "locations";
  const openSection = (next: Section) => {
    const p = new URLSearchParams(params);
    if (next === "view") p.delete("section");
    else p.set("section", next);
    setParams(p);
  };
  // Back out of a section the same way the browser would, so the two routes
  // never disagree about where "back" goes.
  /**
   * Out of here: the profile itself goes home, a sub-screen goes back to the
   * profile. A path rather than history(-1), so arriving straight at
   * /account?section=password (a link, a reload) still has somewhere to go.
   */
  const backTo = section === "view" ? "/discovery" : "/account";
  const back = () => navigate(backTo);

  const [savedName,     setSavedName]     = useState("");
  const [savedPhone,    setSavedPhone]    = useState("");
  const [savedTelegram, setSavedTelegram] = useState("");
  const [savedWhatsApp, setSavedWhatsApp] = useState("");

  const [draftName,     setDraftName]     = useState("");
  const [draftPhone,    setDraftPhone]    = useState("");
  const [draftTelegram, setDraftTelegram] = useState("");
  const [draftWhatsApp, setDraftWhatsApp] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErrors,  setPwErrors]  = useState<Record<string, string>>({});

  const [prefs, setPrefs] = useState<CleaningPrefs>({ reminder_enabled: true, reminder_method: "all", reminder_minutes_before: 60, access_instructions: null, reminder_services: null });
  const [draftPrefs, setDraftPrefs] = useState<CleaningPrefs>(prefs);

  const firstEditRef = useRef<HTMLInputElement>(null);

  const email    = userData?.email ?? "";
  const provider = userData?.auth_provider;
  const isGoogle = email.toLowerCase().includes("@gmail.com") ||
    provider === "google" || (userData?.avatar_url?.includes("google") ?? false);

  const { data: profile } = useQuery({
    queryKey: ["user-profile", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return null;
      const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", userData.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userData?.id,
  });

  useEffect(() => {
    const n = userData?.name || userData?.display_name || "";
    setSavedName(n);
    if (profile) {
      setSavedPhone(profile.phone_number || "");
      setSavedTelegram((profile as any).telegram_username || "");
      setSavedWhatsApp((profile as any).whatsapp || "");
    }
  }, [userData, profile]);

  useQuery<CleaningPrefs>({
    queryKey: ["account-cleaning-prefs", userData?.id],
    queryFn: async () => {
      const { data, error } = await accountApi("/account/preferences/reminders");
      if (error) throw error;
      return data as CleaningPrefs;
    },
    enabled: !!userData?.id,
    onSuccess: (data: CleaningPrefs) => { setPrefs(data); setDraftPrefs(data); },
  } as any);

  // Entering a section seeds its draft from what is saved, so leaving and
  // coming back never shows a half-typed edit from last time.
  useEffect(() => {
    if (editOpen) {
      setDraftName(savedName); setDraftPhone(savedPhone);
      setDraftTelegram(savedTelegram); setDraftWhatsApp(savedWhatsApp);
      setTimeout(() => firstEditRef.current?.focus(), 50);
    }
    if (active === "reminders") setDraftPrefs(prefs);
    if (active !== "password") { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwErrors({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editOpen]);

  const hasChanges =
    draftName.trim() !== savedName.trim() || draftPhone.trim() !== savedPhone.trim() ||
    draftTelegram.trim() !== savedTelegram.trim() || draftWhatsApp.trim() !== savedWhatsApp.trim();

  const { data: myLocations = [] } = useUserLocations(userData?.id);
  const defaultLocation = myLocations.find((l) => l.is_default) ?? myLocations[0];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userData?.id) throw new Error("Not authenticated");
      if (userData.lightning_pubkey) await supabase.rpc("set_lightning_session", { p_pubkey: userData.lightning_pubkey });
      const { data: ex } = await supabase.from("user_profiles").select("id").eq("user_id", userData.id).maybeSingle();
      const payload = { phone_number: draftPhone.trim() || null, telegram_username: draftTelegram.trim() || null, whatsapp: draftWhatsApp.trim() || null } as any;
      if (ex) { const { error } = await supabase.from("user_profiles").update(payload).eq("user_id", userData.id); if (error) throw error; }
      else { const { error } = await supabase.from("user_profiles").insert({ user_id: userData.id, ...payload } as any); if (error) throw error; }
      if (provider !== "lightning") { const { error } = await supabase.auth.updateUser({ data: { name: draftName.trim() } }); if (error) throw error; }
    },
    onSuccess: () => {
      toast.success("Profile updated");
      setSavedName(draftName.trim()); setSavedPhone(draftPhone.trim());
      setSavedTelegram(draftTelegram.trim()); setSavedWhatsApp(draftWhatsApp.trim());
      openSection("view");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      refreshUserData();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save"),
  });

  const savePrefsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await accountApi("/account/preferences/reminders", { method: "PUT", body: JSON.stringify(draftPrefs) });
      if (error) throw error;
      return data as CleaningPrefs;
    },
    onSuccess: (data) => { setPrefs(data); setDraftPrefs(data); openSection("view"); toast.success("Preferences saved"); },
    onError: (err: Error) => toast.error(err.message || "Failed to save"),
  });

  const validatePw = () => {
    const e: Record<string, string> = {};
    if (!currentPw) e.current = "Current password is required";
    if (!newPw) e.new = "New password is required";
    else if (newPw.length < 8) e.new = "Must be at least 8 characters";
    else if (newPw === currentPw) e.new = "Must differ from current password";
    if (!confirmPw) e.confirm = "Please confirm your new password";
    else if (newPw !== confirmPw) e.confirm = "Passwords do not match";
    setPwErrors(e); return Object.keys(e).length === 0;
  };

  const changePwMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await accountApi("/account/change-password", { method: "PATCH", body: JSON.stringify({ current_password: currentPw, new_password: newPw }) });
      if (error) throw error; return data;
    },
    onSuccess: () => { toast.success("Password updated successfully"); openSection("view"); },
    onError: (err: Error) => {
      const msg = err.message || "";
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("invalid")) setPwErrors((e) => ({ ...e, current: "Current password is incorrect" }));
      else toast.error(msg || "Failed to update password");
    },
  });

  const displayName = savedName || userData?.display_name || t("profile.user");
  const avatarLabel = displayName.slice(0, 1).toUpperCase();
  const canChangePassword = provider !== "lightning" && !isGoogle;
  const contacts = [
    savedPhone && { key: "phone", label: "Phone", value: savedPhone, icon: <span className="text-title">📱</span> },
    savedWhatsApp && { key: "wa", label: "WhatsApp", value: savedWhatsApp, icon: <WhatsAppIcon className="h-4 w-4 text-positive" /> },
    savedTelegram && { key: "tg", label: "Telegram", value: savedTelegram.startsWith("@") ? savedTelegram : `@${savedTelegram}`, icon: <TelegramIcon className="h-4 w-4 text-[#2AABEE]" /> },
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; icon: JSX.Element }>;

  /** Who you are and every way into a section. */
  const menu = (
    <>
            {/* Who you are. One white card: avatar, name, email — the same
                block the home screen opens with, not three stacked panels. */}
            <section className="space-y-4 rounded-radius-md bg-card p-4 shadow-figma">
              <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
                {avatarLabel}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-heading font-semibold text-foreground">{displayName}</p>
                <p className="mt-0.5 truncate text-meta text-muted-foreground">{email}</p>
                {isGoogle && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-inset px-2 py-1 text-meta text-muted-foreground">
                    <GoogleIcon /> Google account
                  </span>
                )}
              </div>
              {/* A phone has Edit in the title bar instead (where the bell was). */}
              {!isMobile && (
                <Button variant="secondary" size="sm" className="shrink-0 gap-1.5 self-start" onClick={() => openSection("edit")}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              </div>

              {/* The account at a glance — each figure is a door to its section. */}
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                <Stat label="Active subscriptions" value={activeSubsQ.data == null ? "—" : String(activeSubsQ.data)}
                  onClick={() => navigate("/my-subscriptions")} />
                <Stat label="Balance" value={walletQ.data == null ? "—" : formatUSD(walletQ.data)}
                  onClick={() => openSection("wallet")} />
                {bonus.balanceCents > 0 && (
                  <Stat label="Bonus" value={formatUSD(bonus.balanceCents)} onClick={() => openSection("referrals")} />
                )}
              </div>
            </section>

            {contacts.length > 0 && (
              <section className="rounded-radius-md bg-card p-1.5 shadow-figma">
                {contacts.map((c) => (
                  <div key={c.key} className="flex items-center gap-3 rounded-radius-md p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-inset">
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-title font-semibold text-foreground">{c.value}</span>
                      <span className="block text-meta text-muted-foreground">{c.label}</span>
                    </span>
                  </div>
                ))}
              </section>
            )}

            <SectionTitle>Account</SectionTitle>
            <section className="rounded-radius-md bg-card p-1.5 shadow-figma">
              <Row
                icon={Heart}
                label="Favourites"
                value={favorites.count ? `${favorites.count} saved` : "Tap the heart on anything you like"}
                onClick={() => openSection("favorites")}
                active={!isMobile && active === "favorites"}
              />
              <Row
                icon={Wallet}
                label="Balance & auto-renew"
                value="Top up once, subscriptions renew on their own"
                onClick={() => openSection("wallet")}
                active={!isMobile && active === "wallet"}
              />
              <Row
                icon={MapPin}
                label="Saved locations"
                value={defaultLocation ? defaultLocation.line : "Add a location"}
                onClick={() => openSection("locations")}
                active={!isMobile && active === "locations"}
              />
              <Row
                icon={prefs.reminder_enabled ? Bell : BellOff}
                label="Reminders"
                value={prefs.reminder_enabled
                  ? [
                      reminderLabel(prefs.reminder_minutes_before),
                      methodLabel(prefs.reminder_method),
                      prefs.reminder_services ? `${prefs.reminder_services.length} of ${archetypes.length || "all"} services` : "All services",
                    ].join(" · ")
                  : "Disabled"}
                onClick={() => openSection("reminders")}
                active={!isMobile && active === "reminders"}
              />
              {/* Shown as soon as there is a code to copy. The screen behind
                  it degrades honestly when the account API is missing: the
                  code and the share link work, the invitee list says it
                  cannot be read rather than showing a zero. */}
              {referrals.data?.code && (
                <Row
                  icon={Gift}
                  label={t("profile.inviteFriend")}
                  value={t(
                    (referrals.data.rewardCents > 0 || referrals.data.welcomeCents > 0)
                      ? "profile.inviteFriendValue"
                      : "profile.inviteFriendValuePlain",
                  )}
                  onClick={() => openSection("referrals")}
                  active={!isMobile && active === "referrals"}
                />
              )}
              {canChangePassword && (
                <Row icon={KeyRound} label="Change password" onClick={() => openSection("password")} active={!isMobile && active === "password"} />
              )}
            </section>

            {/*
              The way into the admin panel.
              It lived only in the header dropdown, which is a hover target on
              a desktop and two taps behind an avatar on a phone — so on a
              phone the panel had no entrance at all. `isAdminResolved` gates
              it because the RBAC check is a request: rendering on `isAdmin`
              alone would flash the row for every user on every load.
            */}
            {isAdminResolved && isAdmin && (
              <>
                <SectionTitle>Platform</SectionTitle>
                <section className="rounded-radius-md bg-card p-1.5 shadow-figma">
                  <Row
                    icon={Shield}
                    tone="accent"
                    label={t("profile.platformAdmin")}
                    value={t("profile.platformAdminDescription")}
                    onClick={() => navigate("/admin/dashboard")}
                  />
                </section>
              </>
            )}

            {/* The phone has no footer, so the legal pages live here too. A
                laptop has them in the site footer — not repeated here. */}
            {isMobile && (
              <section className="rounded-radius-md bg-card p-1.5 shadow-figma">
                <Row icon={FileText} label="Terms of Service" onClick={() => navigate("/terms")} />
                <Row icon={Lock} label="Privacy Policy" onClick={() => navigate("/privacy")} />
              </section>
            )}

            <section className="rounded-radius-md bg-card p-1.5 shadow-figma">
              <Row icon={LogOut} tone="danger" label={t("profile.logOut")} onClick={() => void logout().then(() => navigate("/"))} />
            </section>
    </>
  );

  /** The open section. */
  const panel = (
    <>
        {active === "favorites" && <FavoritesPanel />}
        {active === "referrals" && <ReferralPanel />}
        {active === "wallet" && <WalletPanel />}

        {active === "locations" && userData?.id && <SavedLocations userId={userData.id} />}

        {active === "reminders" && (
          <section className="space-y-4 rounded-radius-lg bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-title font-semibold text-foreground">Enable reminders</p>
                <p className="text-meta text-muted-foreground">Before every visit, delivery, booking or car pickup</p>
              </div>
              <Switch checked={draftPrefs.reminder_enabled} onCheckedChange={(v) => setDraftPrefs((p) => ({ ...p, reminder_enabled: v }))} />
            </div>

            {draftPrefs.reminder_enabled && (
              <>
                <div>
                  <p className="mb-2 px-1 text-meta text-muted-foreground">Remind me</p>
                  <PillSelector
                    options={[{ value: 30, label: "30 min" }, { value: 60, label: "1 hour" }, { value: 120, label: "2 hours" }, { value: 1440, label: "1 day" }]}
                    value={draftPrefs.reminder_minutes_before}
                    onChange={(v) => setDraftPrefs((p) => ({ ...p, reminder_minutes_before: v as number }))}
                  />
                </div>
                {/* Which services — every one by default; someone with a meal
                    delivered three times a day may want those off. */}
                {archetypes.length > 1 && (
                  <div>
                    <p className="mb-2 px-1 text-meta text-muted-foreground">Remind me about</p>
                    <div className="flex flex-wrap gap-2">
                      {archetypes.map((a) => {
                        const on = !draftPrefs.reminder_services || draftPrefs.reminder_services.includes(a.key);
                        return (
                          <button key={a.key} type="button" aria-pressed={on}
                            onClick={() => setDraftPrefs((p) => {
                              const all = archetypes.map((x) => x.key);
                              const cur = p.reminder_services ?? all;
                              const next = on ? cur.filter((k) => k !== a.key) : [...cur, a.key];
                              return { ...p, reminder_services: next.length === all.length ? null : next };
                            })}
                            className={cn("flex h-10 items-center gap-1.5 rounded-full px-4 text-body font-semibold transition-colors",
                              on ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground")}>
                            <a.Icon className="h-4 w-4" /> {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <p className="mb-2 px-1 text-meta text-muted-foreground">Notify via</p>
                  <PillSelector
                    options={[{ value: "all", label: "All" }, { value: "email", label: "Email" }, { value: "in_app", label: "In-app" }]}
                    value={draftPrefs.reminder_method}
                    onChange={(v) => setDraftPrefs((p) => ({ ...p, reminder_method: v as string }))}
                  />
                </div>
              </>
            )}

            <div>
              <p className="mb-2 px-1 text-meta text-muted-foreground">Access instructions</p>
              <textarea
                value={draftPrefs.access_instructions ?? ""}
                onChange={(e) => setDraftPrefs((p) => ({ ...p, access_instructions: e.target.value || null }))}
                placeholder="e.g. Door will be open · Key under mat"
                rows={3}
                className={cn(fieldClass, "h-auto resize-none py-3")}
              />
              <p className="mt-1 px-1 text-meta text-muted-foreground">Shown in reminder notifications sent to you.</p>
            </div>

          </section>
        )}
        {active === "reminders" && (
          <SaveBar label="Save" busyLabel="Saving…" busy={savePrefsMutation.isPending}
            onClick={() => savePrefsMutation.mutate()} />
        )}

        {active === "password" && (
          <section className="space-y-3 rounded-radius-lg bg-card p-4">
            <PasswordInput id="cp" label="Current password" autoFocus value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" error={pwErrors.current} />
            <PasswordInput id="np" label="New password" value={newPw} onChange={setNewPw} placeholder="At least 8 characters" error={pwErrors.new} />
            <PasswordInput id="rp" label="Confirm new password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" error={pwErrors.confirm} />
          </section>
        )}
        {active === "password" && (
          <SaveBar label="Update password" busyLabel="Updating…" busy={changePwMutation.isPending}
            onClick={() => { if (validatePw()) changePwMutation.mutate(); }} />
        )}
    </>
  );

  return (
    // The account frame, like every other /account screen (PAGE_TYPES §6).
    <UserLayout
      title={isMobile ? SECTION_TITLES[section] : "Profile"}
      showBackButton
      backTo={isMobile ? backTo : "/discovery"}
      // A form is a decision page on a phone: it ends at its own Save, so the
      // tab bar and the bell (a way OUT of an unsaved form) are not offered.
      showBottomNav={!isMobile || !isSubScreen}
      headerAction={!isMobile ? undefined
        : isSubScreen ? <span className="h-10 w-10" aria-hidden />
        // The profile itself: Edit in place of the bell — the one action this
        // page has, and the bell is a tab-bar tap away anyway.
        : base === "view" ? (
          <button type="button" onClick={() => openSection("edit")} aria-label="Edit profile" className={HEADER_ACTION_CLASS}>
            {/* 20px Lucide = the visual size of the header's 24px Material glyphs
                (their drawing sits inside a 24px box with padding). */}
            <Pencil className="h-5 w-5" strokeWidth={1.75} />
          </button>
        ) : undefined}
    >
      {isMobile ? (
        <div className={cn(
          "app-container space-y-4 pt-space-4",
          isForm && "pb-[calc(var(--decision-bar-h,88px)+16px)]",
        )}>
          {section === "view" ? menu : panel}
        </div>
      ) : (
        // Laptop: the menu stays on the left and the section opens beside it,
        // on this page — no trip to another screen and back.
        <div className="app-container grid grid-cols-[340px_minmax(0,1fr)] items-start gap-6 pb-space-8 pt-space-8 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="space-y-4">{menu}</aside>
          <main className="min-w-0 space-y-4">
            <h1 className="px-1 text-3xl font-semibold tracking-tight text-foreground">{SECTION_TITLES[active]}</h1>
            <div className={cn("space-y-4", ["edit", "password", "reminders"].includes(active) && "max-w-[640px]")}>
              {panel}
            </div>
          </main>
        </div>
      )}

      {/* Edit profile — a modal over the page (a sheet on a phone). */}
      <ResponsiveDialog
        open={editOpen}
        onOpenChange={(o) => { if (!o) openSection("view"); }}
        title="Edit profile"
        footer={
          <Button size="lg" className="w-full" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}
            disabled={!hasChanges || saveMutation.isPending}>
            {saveMutation.isPending ? <><Spinner size="sm" /> Saving…</> : "Save"}
          </Button>
        }
      >
        <div className="space-y-2">
            <Input ref={firstEditRef as any} id="e-name" label="Username" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Your name" />
            <Input id="e-email" label="Email" type="email" value={email} readOnly className="cursor-default opacity-50" />
            <Input id="e-phone" label="Phone (optional)" type="tel" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="+1 234 567 8900" />
            <Input id="e-wa" label="WhatsApp (optional)" type="tel" value={draftWhatsApp} onChange={(e) => setDraftWhatsApp(e.target.value)} placeholder="+1 234 567 8900" leftIcon={<WhatsAppIcon className="h-4 w-4 text-positive" />} />
            <Input id="e-tg" label="Telegram (optional)" value={draftTelegram} onChange={(e) => setDraftTelegram(e.target.value)} placeholder="@username" leftIcon={<TelegramIcon className="h-4 w-4 text-[#2AABEE]" />} />
        </div>
      </ResponsiveDialog>
    </UserLayout>
  );
};

export default Profile;
