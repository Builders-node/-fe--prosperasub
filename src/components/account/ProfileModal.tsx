import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bell, BellOff, ChevronRight, Eye, EyeOff,
  KeyRound, Pencil, MapPin,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { accountApi, supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AddressFields } from "@/components/account/AddressFields";
import {
  EMPTY_ADDRESS, addressFromProfile, addressPayload, addressIsEqual, composeAddress,
  type AddressDetails,
} from "@/lib/address";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileMode = "view" | "editing" | "password" | "preferences";

interface CleaningPrefs {
  reminder_enabled: boolean;
  reminder_method: string;
  reminder_minutes_before: number;
  access_instructions: string | null;
}

// ─── Brand icons ─────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function PasswordInput({ id, label, value, onChange, placeholder, error, autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          id={id} type={show ? "text" : "password"} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-xl border border-border bg-card px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Hide" : "Show"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PillSelector<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button key={String(opt.value)} type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-lg border py-2 text-xs font-bold transition-all",
            value === opt.value
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
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

// ─── ProfileModal ──────────────────────────────────────────────────────────────

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { userData, refreshUserData } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [mode, setMode] = useState<ProfileMode>("view");

  const [savedName,     setSavedName]     = useState("");
  const [savedPhone,    setSavedPhone]    = useState("");
  const [savedTelegram, setSavedTelegram] = useState("");
  const [savedWhatsApp, setSavedWhatsApp] = useState("");
  const [savedAddr,     setSavedAddr]     = useState<AddressDetails>(EMPTY_ADDRESS);

  const [draftName,     setDraftName]     = useState("");
  const [draftPhone,    setDraftPhone]    = useState("");
  const [draftTelegram, setDraftTelegram] = useState("");
  const [draftWhatsApp, setDraftWhatsApp] = useState("");
  const [draftAddr,     setDraftAddr]     = useState<AddressDetails>(EMPTY_ADDRESS);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErrors,  setPwErrors]  = useState<Record<string, string>>({});

  const [prefs, setPrefs] = useState<CleaningPrefs>({ reminder_enabled: true, reminder_method: "all", reminder_minutes_before: 60, access_instructions: null });
  const [draftPrefs, setDraftPrefs] = useState<CleaningPrefs>(prefs);

  const firstEditRef = useRef<HTMLInputElement>(null);
  const isMobile     = useIsMobile();

  const email    = userData?.email ?? "";
  const provider = userData?.auth_provider;
  const isGoogle = email.toLowerCase().includes("@gmail.com") ||
    provider === "google" || (userData?.avatar_url?.includes("google") ?? false);

  // ── Queries ───────────────────────────────────────────────────────────────
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
      setSavedAddr(addressFromProfile(profile as any));
    }
  }, [userData, profile]);

  useQuery<CleaningPrefs>({
    queryKey: ["account-cleaning-prefs", userData?.id],
    queryFn: async () => {
      const { data, error } = await accountApi("/account/preferences/cleaning");
      if (error) throw error;
      return data as CleaningPrefs;
    },
    enabled: !!userData?.id,
    onSuccess: (data: CleaningPrefs) => { setPrefs(data); setDraftPrefs(data); },
  } as any);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { if (!open) { setMode("view"); resetPw(); } }, [open]);
  useEffect(() => { if (mode === "editing") setTimeout(() => firstEditRef.current?.focus(), 50); }, [mode]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && mode !== "view") { e.stopPropagation(); back(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [mode]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const resetPw = () => { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwErrors({}); };
  const back = () => { setMode("view"); resetPw(); };
  const enterEdit = () => { setDraftName(savedName); setDraftPhone(savedPhone); setDraftTelegram(savedTelegram); setDraftWhatsApp(savedWhatsApp); setDraftAddr(savedAddr); setMode("editing"); };
  const hasChanges = draftName.trim() !== savedName.trim() || draftPhone.trim() !== savedPhone.trim() || draftTelegram.trim() !== savedTelegram.trim() || draftWhatsApp.trim() !== savedWhatsApp.trim() || !addressIsEqual(draftAddr, savedAddr);
  const savedAddressLine = composeAddress(savedAddr);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userData?.id) throw new Error("Not authenticated");
      if (userData.lightning_pubkey) await supabase.rpc("set_lightning_session", { p_pubkey: userData.lightning_pubkey });
      const { data: ex } = await supabase.from("user_profiles").select("id").eq("user_id", userData.id).maybeSingle();
      const payload = { phone_number: draftPhone.trim() || null, telegram_username: draftTelegram.trim() || null, whatsapp: draftWhatsApp.trim() || null, ...addressPayload(draftAddr) } as any;
      if (ex) { const { error } = await supabase.from("user_profiles").update(payload).eq("user_id", userData.id); if (error) throw error; }
      else { const { error } = await supabase.from("user_profiles").insert({ user_id: userData.id, ...payload } as any); if (error) throw error; }
      if (provider !== "lightning") { const { error } = await supabase.auth.updateUser({ data: { name: draftName.trim() } }); if (error) throw error; }
    },
    onSuccess: () => {
      toast.success("Profile updated");
      setSavedName(draftName.trim()); setSavedPhone(draftPhone.trim()); setSavedTelegram(draftTelegram.trim()); setSavedWhatsApp(draftWhatsApp.trim()); setSavedAddr(draftAddr);
      setMode("view"); queryClient.invalidateQueries({ queryKey: ["user-profile"] }); refreshUserData();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save"),
  });

  const savePrefsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await accountApi("/account/preferences/cleaning", { method: "PUT", body: JSON.stringify(draftPrefs) });
      if (error) throw error;
      return data as CleaningPrefs;
    },
    onSuccess: (data) => { setPrefs(data); setDraftPrefs(data); setMode("view"); toast.success("Preferences saved"); },
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
    onSuccess: () => { toast.success("Password updated successfully"); back(); },
    onError: (err: Error) => {
      const msg = err.message || "";
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("invalid")) setPwErrors((e) => ({ ...e, current: "Current password is incorrect" }));
      else toast.error(msg || "Failed to update password");
    },
  });

  const displayName = savedName || userData?.display_name || t("profile.user");
  const avatarLabel = displayName.slice(0, 1).toUpperCase();
  const canChangePassword = provider !== "lightning" && !isGoogle;

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = (
    <>
      {mode !== "view" && (
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
          <button type="button" onClick={back}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[14px] font-black text-foreground">
            {mode === "editing" ? "Edit Profile" : mode === "password" ? "Change Password" : "Cleaning Reminders"}
          </h2>
        </div>
      )}

      <div className={cn("pb-5", mode === "view" ? "pt-0" : "px-4 pt-3")}>
        {/* ══ VIEW ══ */}
        {mode === "view" && (
          <>
            <div className="bg-gradient-to-b from-primary/20 via-primary/5 to-transparent px-4 pb-5 pt-6 text-center">
              <div className="relative mx-auto mb-3 h-16 w-16">
                <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-lg" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground shadow-xl">
                  {avatarLabel}
                </div>
              </div>
              <p className="text-[18px] font-black leading-tight text-foreground">{displayName}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{email}</p>
              {isGoogle && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  <GoogleIcon /> Google account
                </span>
              )}
            </div>

            <div className="mx-3 overflow-hidden rounded-2xl border border-border/60 bg-card">
              {savedPhone && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm">📱</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phone</p>
                    <p className="truncate text-[13px] font-semibold text-foreground">{savedPhone}</p>
                  </div>
                </div>
              )}
              {savedWhatsApp && (
                <div className={cn("flex items-center gap-3 px-4 py-2.5", savedPhone && "border-t border-border/50")}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                    <WhatsAppIcon className="h-3.5 w-3.5 text-green-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp</p>
                    <p className="truncate text-[13px] font-semibold text-foreground">{savedWhatsApp}</p>
                  </div>
                </div>
              )}
              {savedTelegram && (
                <div className={cn("flex items-center gap-3 px-4 py-2.5", (savedPhone || savedWhatsApp) && "border-t border-border/50")}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2AABEE]/10">
                    <TelegramIcon className="h-3.5 w-3.5 text-[#2AABEE]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Telegram</p>
                    <p className="truncate text-[13px] font-semibold text-foreground">{savedTelegram.startsWith("@") ? savedTelegram : `@${savedTelegram}`}</p>
                  </div>
                </div>
              )}
              {savedAddressLine && (
                <div className={cn("flex items-center gap-3 px-4 py-2.5", (savedPhone || savedWhatsApp || savedTelegram) && "border-t border-border/50")}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Address</p>
                    <p className="truncate text-[13px] font-semibold text-foreground">{savedAddressLine}</p>
                  </div>
                </div>
              )}
              {(savedPhone || savedWhatsApp || savedTelegram || savedAddressLine) && <div className="border-t border-border/50" />}

              <button type="button" onClick={() => { setDraftPrefs(prefs); setMode("preferences"); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", prefs.reminder_enabled ? "bg-primary/15" : "bg-muted")}>
                  {prefs.reminder_enabled ? <Bell className="h-3.5 w-3.5 text-primary" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cleaning Reminders</p>
                  <p className="text-[13px] font-semibold text-foreground">
                    {prefs.reminder_enabled ? `${reminderLabel(prefs.reminder_minutes_before)} · ${methodLabel(prefs.reminder_method)}` : "Disabled"}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              </button>

              <button type="button" onClick={enterEdit}
                className="flex w-full items-center gap-3 border-t border-border/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="flex-1 text-[13px] font-semibold text-foreground">Edit Profile</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              </button>

              {canChangePassword && (
                <button type="button" onClick={() => setMode("password")}
                  className="flex w-full items-center gap-3 border-t border-border/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="flex-1 text-[13px] font-semibold text-foreground">Change Password</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                </button>
              )}
            </div>

            {!savedPhone && !savedWhatsApp && !savedTelegram && !savedAddressLine && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground/50">Tap Edit Profile to add contact info</p>
            )}
          </>
        )}

        {/* ══ EDIT ══ */}
        {mode === "editing" && (
          <div className="space-y-3">
            <Input ref={firstEditRef as any} id="e-name" label="Username" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Your name" />
            <Input id="e-email" label="Email" type="email" value={email} readOnly className="cursor-default opacity-50" />
            <Input id="e-phone" label="Phone (optional)" type="tel" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="+1 234 567 8900" />
            <Input id="e-wa" label="WhatsApp (optional)" type="tel" value={draftWhatsApp} onChange={(e) => setDraftWhatsApp(e.target.value)} placeholder="+1 234 567 8900" leftIcon={<WhatsAppIcon className="h-4 w-4 text-green-500" />} />
            <Input id="e-tg" label="Telegram (optional)" value={draftTelegram} onChange={(e) => setDraftTelegram(e.target.value)} placeholder="@username" leftIcon={<TelegramIcon className="h-4 w-4 text-[#2AABEE]" />} />
            <AddressFields value={draftAddr} onChange={setDraftAddr} />
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={back} disabled={saveMutation.isPending}>Cancel</Button>
              <Button className="flex-1" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!hasChanges || saveMutation.isPending}>
                {saveMutation.isPending ? <><Spinner size="sm" /> Saving…</> : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

        {/* ══ PREFERENCES ══ */}
        {mode === "preferences" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Enable reminders</p>
                <p className="text-xs text-muted-foreground">Get notified before each cleaning</p>
              </div>
              <Switch checked={draftPrefs.reminder_enabled} onCheckedChange={(v) => setDraftPrefs((p) => ({ ...p, reminder_enabled: v }))} />
            </div>
            {draftPrefs.reminder_enabled && (
              <>
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Remind me</p>
                  <PillSelector options={[{ value: 30, label: "30 min" }, { value: 60, label: "1 hour" }, { value: 120, label: "2 hours" }, { value: 1440, label: "1 day" }]} value={draftPrefs.reminder_minutes_before} onChange={(v) => setDraftPrefs((p) => ({ ...p, reminder_minutes_before: v as number }))} />
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notify via</p>
                  <PillSelector options={[{ value: "all", label: "All" }, { value: "email", label: "Email" }, { value: "in_app", label: "In-app" }]} value={draftPrefs.reminder_method} onChange={(v) => setDraftPrefs((p) => ({ ...p, reminder_method: v as string }))} />
                </div>
              </>
            )}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Access instructions</p>
              <textarea value={draftPrefs.access_instructions ?? ""} onChange={(e) => setDraftPrefs((p) => ({ ...p, access_instructions: e.target.value || null }))} placeholder="e.g. Door will be open · Key under mat" rows={3}
                className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary" />
              <p className="mt-1 text-[11px] text-muted-foreground">Shown in reminder notifications sent to you.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={back} disabled={savePrefsMutation.isPending}>Cancel</Button>
              <Button className="flex-1" onClick={() => savePrefsMutation.mutate()} loading={savePrefsMutation.isPending} disabled={savePrefsMutation.isPending}>
                {savePrefsMutation.isPending ? <><Spinner size="sm" /> Saving…</> : "Save"}
              </Button>
            </div>
          </div>
        )}

        {/* ══ PASSWORD ══ */}
        {mode === "password" && (
          <div className="space-y-3">
            <PasswordInput id="cp" label="Current password" autoFocus value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" error={pwErrors.current} />
            <PasswordInput id="np" label="New password" value={newPw} onChange={setNewPw} placeholder="At least 8 characters" error={pwErrors.new} />
            <PasswordInput id="rp" label="Confirm new password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" error={pwErrors.confirm} />
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={back} disabled={changePwMutation.isPending}>Cancel</Button>
              <Button className="flex-1" onClick={() => { if (validatePw()) changePwMutation.mutate(); }} loading={changePwMutation.isPending} disabled={changePwMutation.isPending}>
                {changePwMutation.isPending ? <><Spinner size="sm" /> Updating…</> : "Update Password"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return isMobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="!gap-0 !p-0 overflow-hidden rounded-t-[28px] border-0 [&>button]:hidden">
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-1 w-9 rounded-full bg-muted-foreground/25" />
        </div>
        {body}
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!gap-0 !p-0 overflow-hidden sm:max-w-[340px]">
        {body}
      </DialogContent>
    </Dialog>
  );
}

export default ProfileModal;
