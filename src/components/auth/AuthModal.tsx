/**
 * AuthModal — Login / Register
 *
 * One centered Dialog for every viewport. The shared `DialogContent` primitive
 * already flips to a bottom sheet on mobile via CSS media queries, so we don't
 * split by JS-detected viewport (that flashed the wrong layout on first paint
 * and misfired on narrow desktop windows).
 *
 * All business logic lives in this file; the /auth page only handles
 * the Google OAuth callback redirect (code + state params).
 */

import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthView = "login" | "signup" | "forgot_password";

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

// Flat field: inset surface, no border, 44px tall. 16px text keeps iOS from
// zooming the page on focus.
const INPUT_CLASS =
  "h-11 w-full appearance-none rounded-radius-md border-0 bg-inset px-4 text-title text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60";
const LABEL_CLASS = "mb-1.5 block text-meta font-semibold text-foreground";

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
        className={cn(INPUT_CLASS, "pr-12")}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
  const { login, signUp, loginWithGoogle, requestPasswordReset, roles } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<AuthView>(defaultView);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Reset fields when switching views
  useEffect(() => {
    setView(defaultView);
    setEmail("");
    setPassword("");
    setName("");
    setResetEmailSent(false);
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
    toast.success("Account created! Welcome to EverySub.");
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await requestPasswordReset(email);
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setResetEmailSent(true);
  };

  if (view === "forgot_password") {
    return (
      <div className="w-full">
        <div className="mb-6">
          <h2 className="text-heading font-semibold text-foreground">
            Reset password
          </h2>
          <p className="mt-1 text-meta text-muted-foreground">
            Enter your email and we'll send a reset link.
          </p>
        </div>

        {resetEmailSent ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-radius-md bg-inset p-4 text-title font-semibold text-foreground">
              ✓ Check your email for the password reset link.
            </div>
            <Button
              type="button"
              onClick={() => setView("login")}
              className="w-full font-semibold"
            >
              Back to login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <div>
              <label htmlFor="reset-email" className={LABEL_CLASS}>
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={INPUT_CLASS}
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full font-semibold"
            >
              {isLoading ? <Spinner size="md" /> : "Send reset link"}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => setView("login")}
          className="mt-4 flex w-full items-center justify-center text-meta font-semibold text-primary transition-colors hover:opacity-70"
        >
          ← Back to login
        </button>

        {/* The one place a locked-out person can ask for help. /support was
            linked only from the account menu, which is behind the door they
            cannot open. */}
        <Link
          to="/support"
          onClick={onSuccess}
          className="mt-3 flex w-full items-center justify-center text-meta text-muted-foreground transition-colors hover:text-foreground"
        >
          Still stuck? Contact support
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-heading font-semibold text-foreground">
          {view === "login" ? "Welcome back" : "Create account"}
        </h2>
        <p className="mt-1 text-meta text-muted-foreground">
          {view === "login"
            ? "Sign in to your EverySub account"
            : "Join EverySub — Convenience Subscriptions to Próspera"}
        </p>
      </div>

      {/* View toggle pill */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-radius-md bg-inset p-1">
        <button
          type="button"
          onClick={() => setView("login")}
          aria-pressed={view === "login"}
          className={cn(
            "h-10 rounded-radius-sm text-meta font-semibold transition-colors",
            view === "login" ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setView("signup")}
          aria-pressed={view === "signup"}
          className={cn(
            "h-10 rounded-radius-sm text-meta font-semibold transition-colors",
            view === "signup" ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Register
        </button>
      </div>

      {/* Form */}
      <form onSubmit={view === "login" ? handleLogin : handleSignup} className="space-y-3">
        {view === "signup" && (
          <div>
            <label htmlFor="auth-name" className={LABEL_CLASS}>
              Full name
            </label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className={INPUT_CLASS}
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className={LABEL_CLASS}>
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="auth-password" className="text-meta font-semibold text-foreground">
              Password
            </label>
            {view === "login" && (
              <button
                type="button"
                onClick={() => { setResetEmailSent(false); setView("forgot_password"); }}
                className="text-meta font-semibold text-primary transition-colors hover:opacity-70"
              >
                Forgot password?
              </button>
            )}
          </div>
          <PasswordInput
            id="auth-password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            required
            minLength={6}
          />
          {view === "signup" && (
            <p className="mt-1 text-meta text-muted-foreground">At least 6 characters</p>
          )}
        </div>

        {/* Primary CTA */}
        <Button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full font-semibold"
        >
          {isLoading ? (
            <Spinner size="md" />
          ) : (
            view === "login" ? "Log in" : "Create account"
          )}
        </Button>
      </form>

      {/* Separator — plain words, no rule splitting the sheet */}
      <p className="my-4 text-center text-meta text-muted-foreground">or</p>

      {/* Google */}
      <Button
        type="button"
        variant="ghost"
        onClick={handleGoogle}
        disabled={isLoading}
        className="w-full gap-3 bg-inset font-semibold text-foreground hover:bg-inset hover:opacity-80"
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      {/* Terms */}
      <p className="mt-5 text-center text-meta leading-relaxed text-muted-foreground">
        By continuing, you agree to our{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-70">Terms of Service</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-70">Privacy Policy</a>.
      </p>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
// One Dialog for both viewports. The shared `DialogContent` already handles
// responsive layout (bottom sheet on mobile, centered card on ≥sm) via CSS
// media queries, so we don't branch on `useIsMobile()` — that hook flashes the
// wrong layout on first paint and can misfire on narrow desktop windows.

export function AuthModal({ open, onClose, defaultView = "login", redirectTo = "/" }: AuthModalProps) {
  const formContent = (
    <AuthForm
      defaultView={defaultView}
      redirectTo={redirectTo}
      onSuccess={onClose}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="border-0 bg-card text-foreground outline-none focus:outline-none sm:max-w-[420px]"
        // Clicking outside the auth form shouldn't lose whatever the user just
        // typed. Same for Escape. Close via the built-in X in the top-right.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {defaultView === "forgot_password" ? "Reset your password" : defaultView === "login" ? "Log in to EverySub" : "Create a EverySub account"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Enter your credentials to continue.
        </DialogDescription>

        {/* DialogContent already renders a Close button in the top-right corner. */}
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
