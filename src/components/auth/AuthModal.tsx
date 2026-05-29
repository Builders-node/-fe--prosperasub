/**
 * AuthModal — Login / Register
 *
 * Mobile  (<md): bottom Sheet that slides up from the bottom
 * Desktop (≥md): centered Dialog
 *
 * All business logic lives in this file; the /auth page only handles
 * the Google OAuth callback redirect (code + state params).
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthView = "login" | "signup";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultView?: AuthView;
  redirectTo?: string;
}

// ─── Google icon ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ─── Password input ───────────────────────────────────────────────────────────

function PasswordInput({
  id, value, onChange, placeholder, required, minLength,
}: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="h-12 w-full rounded-[14px] border-0 bg-[#F3F4F6] px-4 pr-12 text-[15px] text-[#111] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#F8A31A]/40"
        style={{ WebkitAppearance: "none" }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-[#111]"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Shared auth form ─────────────────────────────────────────────────────────

function AuthForm({
  defaultView,
  redirectTo,
  onSuccess,
}: {
  defaultView: AuthView;
  redirectTo: string;
  onSuccess: () => void;
}) {
  const { login, signUp, loginWithGoogle, roles } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<AuthView>(defaultView);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");

  // Reset fields when switching views
  useEffect(() => {
    setView(defaultView);
    setEmail("");
    setPassword("");
    setName("");
  }, [defaultView]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error, roles: userRoles } = await login(email, password);
    setIsLoading(false);
    if (error) {
      toast.error(error.message || "Login failed. Check your email and password.");
      return;
    }
    toast.success("Welcome back!");
    onSuccess();
    const target =
      redirectTo === "/" && userRoles?.includes("super_admin")
        ? "/admin/dashboard"
        : redirectTo;
    navigate(target, { replace: true });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signUp(email, password, name);
    setIsLoading(false);
    if (error) {
      toast.error(error.message || "Could not create account. Please try again.");
      return;
    }
    toast.success("Account created! Welcome to ProsperaSub.");
    onSuccess();
    navigate(redirectTo, { replace: true });
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    const { error } = await loginWithGoogle();
    if (error) {
      setIsLoading(false);
      toast.error(error.message || "Google login failed.");
    }
    // On success, Google redirects away — no need to setIsLoading(false)
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[22px] font-black tracking-tight" style={{ color: "#111111", letterSpacing: "-0.02em" }}>
          {view === "login" ? "Welcome back" : "Create account"}
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "#8A8A8A" }}>
          {view === "login"
            ? "Sign in to your ProsperaSub account"
            : "Join ProsperaSub — meal plans & cleaning"}
        </p>
      </div>

      {/* View toggle pill */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-[14px] p-1" style={{ background: "#F3F4F6" }}>
        <button
          type="button"
          onClick={() => setView("login")}
          className="h-10 rounded-[10px] text-[13px] font-semibold transition-all"
          style={{
            background: view === "login" ? "#FFFFFF" : "transparent",
            color: view === "login" ? "#111111" : "#8A8A8A",
            boxShadow: view === "login" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setView("signup")}
          className="h-10 rounded-[10px] text-[13px] font-semibold transition-all"
          style={{
            background: view === "signup" ? "#FFFFFF" : "transparent",
            color: view === "signup" ? "#111111" : "#8A8A8A",
            boxShadow: view === "signup" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}
        >
          Register
        </button>
      </div>

      {/* Form */}
      <form onSubmit={view === "login" ? handleLogin : handleSignup} className="space-y-3">
        {view === "signup" && (
          <div>
            <label htmlFor="auth-name" className="mb-1.5 block text-[12px] font-semibold" style={{ color: "#374151" }}>
              Full name
            </label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="h-12 w-full rounded-[14px] border-0 bg-[#F3F4F6] px-4 text-[15px] text-[#111] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#F8A31A]/40"
              style={{ WebkitAppearance: "none" }}
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="mb-1.5 block text-[12px] font-semibold" style={{ color: "#374151" }}>
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="h-12 w-full rounded-[14px] border-0 bg-[#F3F4F6] px-4 text-[15px] text-[#111] placeholder-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#F8A31A]/40"
            style={{ WebkitAppearance: "none" }}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="auth-password" className="text-[12px] font-semibold" style={{ color: "#374151" }}>
              Password
            </label>
            {view === "login" && (
              <button
                type="button"
                onClick={() => navigate(`/reset-password${email ? `?email=${encodeURIComponent(email)}` : ""}`)}
                className="text-[12px] font-medium transition-colors hover:opacity-70"
                style={{ color: "#F8A31A" }}
              >
                Forgot password?
              </button>
            )}
          </div>
          <PasswordInput
            id="auth-password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            minLength={6}
          />
          {view === "signup" && (
            <p className="mt-1 text-[11px]" style={{ color: "#9CA3AF" }}>At least 6 characters</p>
          )}
        </div>

        {/* Primary CTA */}
        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{ background: "#202124" }}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            view === "login" ? "Log in" : "Create account"
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" style={{ borderColor: "#E5E7EB" }} />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-[12px] font-medium" style={{ color: "#9CA3AF" }}>
            or continue with
          </span>
        </div>
      </div>

      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={isLoading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border text-[14px] font-semibold transition hover:bg-[#F9FAFB] active:scale-[0.98] disabled:opacity-50"
        style={{ borderColor: "#E5E7EB", color: "#374151" }}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {/* Terms */}
      <p className="mt-5 text-center text-[11px] leading-relaxed" style={{ color: "#9CA3AF" }}>
        By continuing, you agree to our{" "}
        <a href="#" className="underline underline-offset-2 hover:opacity-70">Terms of Service</a>{" "}
        and{" "}
        <a href="#" className="underline underline-offset-2 hover:opacity-70">Privacy Policy</a>.
      </p>
    </div>
  );
}

// ─── Modal (Dialog on desktop, Sheet on mobile) ───────────────────────────────

export function AuthModal({ open, onClose, defaultView = "login", redirectTo = "/" }: AuthModalProps) {
  const isMobile = useIsMobile();

  const formContent = (
    <AuthForm
      defaultView={defaultView}
      redirectTo={redirectTo}
      onSuccess={onClose}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="bottom"
          className="flex flex-col border-0 px-5 pb-0 pt-5 outline-none focus:outline-none"
          style={{
            borderRadius: "24px 24px 0 0",
            maxHeight: "90dvh",
            background: "#FFFFFF",
            overflowY: "auto",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)",
          }}
        >
          {/* Drag handle */}
          <div className="mx-auto mb-5 h-1 w-10 rounded-full" style={{ background: "#E5E7EB" }} />

          {/* Visually hidden accessible title */}
          <SheetTitle className="sr-only">
            {defaultView === "login" ? "Log in to ProsperaSub" : "Create a ProsperaSub account"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Enter your credentials to continue.
          </SheetDescription>

          {formContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="border-0 p-8 outline-none focus:outline-none"
        style={{
          borderRadius: 24,
          background: "#FFFFFF",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          maxWidth: 420,
          width: "calc(100% - 32px)",
        }}
      >
        <DialogTitle className="sr-only">
          {defaultView === "login" ? "Log in to ProsperaSub" : "Create a ProsperaSub account"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Enter your credentials to continue.
        </DialogDescription>

        {formContent}
      </DialogContent>
    </Dialog>
  );
}
