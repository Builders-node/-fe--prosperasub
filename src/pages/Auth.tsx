import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import authBackground from "@/assets/auth-background.jpg";

// Google icon SVG component
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

type AuthView = "login" | "signup";

const getSafeRedirect = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
};

const Auth = () => {
  const [view, setView] = useState<AuthView>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const { login, signUp, loginWithGoogle, isAuthenticated, isLoading: isAuthLoading, isUserDataReady, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = getSafeRedirect(searchParams.get("redirect"));
  const googleCode = searchParams.get("code");
  const googleState = searchParams.get("state");
  const googleError = searchParams.get("error");

  const buildAuthPath = (path: "/auth" | "/register") => {
    const params = new URLSearchParams();
    const redirect = searchParams.get("redirect");
    if (redirect) params.set("redirect", redirect);
    const query = params.toString();
    return `${path}${query ? `?${query}` : ""}`;
  };

  useEffect(() => {
    setView(location.pathname === "/register" ? "signup" : "login");
  }, [location.pathname]);

  useEffect(() => {
    let isMounted = true;

    const completeGoogleLogin = async () => {
      if (!googleCode && !googleError) return;

      setIsLoading(true);

      if (googleError) {
        toast.error("Google login was cancelled or failed.");
        setIsLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      const { data, error } = await (supabase.auth as any).completeOAuthSignIn({
        provider: "google",
        code: googleCode,
        state: googleState,
        redirectTo: `${window.location.origin}/auth`,
      });

      if (!isMounted) return;

      setIsLoading(false);

      if (error) {
        toast.error(error.message);
        navigate("/auth", { replace: true });
        return;
      }

      toast.success("Welcome back!");
      // Don't navigate here — auth state isn't set yet (onAuthStateChange fires via setTimeout).
      // The isAuthenticated useEffect below will redirect once state is updated.
    };

    completeGoogleLogin();

    return () => {
      isMounted = false;
    };
  }, [googleCode, googleError, googleState, navigate, redirectTo]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const { error } = await loginWithGoogle();
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    if (!isAuthLoading && isUserDataReady && isAuthenticated) {
      const target = redirectTo === "/" && roles.includes("super_admin") ? "/admin/dashboard" : redirectTo;
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isAuthLoading, isUserDataReady, navigate, redirectTo, roles]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error, roles } = await login(email, password);
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Welcome back!");
      navigate(redirectTo === "/" && roles?.includes("super_admin") ? "/admin/dashboard" : redirectTo, { replace: true });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signUp(email, password, name);
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account created successfully!");
      navigate(redirectTo, { replace: true });
    }
  };

  // Show spinner while auth state is loading, user is already authenticated,
  // or a Google OAuth callback is being processed.
  if (isAuthLoading || !isUserDataReady || isAuthenticated || googleCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
      {/* Left Panel - Form */}
      <div className="flex min-h-screen flex-col bg-background p-space-6 lg:p-space-12">
        {/* Logo */}
        <div className="flex items-center mb-space-12">
          <span className="font-display text-card-title">
            <span className="text-foreground">Prospera</span>
            <span className="text-primary">Sub</span>
          </span>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
          <Button asChild variant="tertiary" size="sm" className="mb-space-8 w-fit px-0 hover:bg-transparent">
            <Link to="/" aria-label="Return to public website">
              <ArrowLeft className="h-4 w-4" />
              Return to website
            </Link>
          </Button>

          <div className="mb-space-8">
            <h1 className="type-section-title text-foreground">
              {view === "login" ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="mt-space-3 type-body text-muted-foreground">
              {view === "login"
                ? "Enter your email and password to access your account."
                : "Sign up to get started with healthy meal subscriptions."}
            </p>
          </div>

          <form onSubmit={view === "login" ? handleLogin : handleSignup} className="space-y-space-5">
            {view === "signup" && (
              <Input
                id="name"
                label="Full Name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}

            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              passwordToggle
            />

            {view === "login" && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => navigate(`/reset-password${email ? `?email=${encodeURIComponent(email)}` : ""}`)}
                >
                  Forgot Your Password?
                </Button>
              </div>
            )}

            <Button
              type="submit"
              loading={isLoading}
              className="w-full"
              size="xl"
            >
              {view === "login" ? "Log In" : "Create Account"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-space-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-control">
              <span className="bg-background px-space-4 text-muted-foreground">Or Login With</span>
            </div>
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-1 gap-space-3">
            <Button
              variant="secondary"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              size="xl"
            >
              <GoogleIcon />
              <span>Google</span>
            </Button>
          </div>

          {/* Switch View */}
          <p className="mt-space-8 text-center type-body text-muted-foreground">
            {view === "login" ? (
              <>
                Don't Have An Account?{" "}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => navigate(buildAuthPath("/register"))}
                >
                  Register Now.
                </Button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => navigate(buildAuthPath("/auth"))}
                >
                  Sign In.
                </Button>
              </>
            )}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-space-8 text-control text-muted-foreground">
          <p>© 2026 ProsperaSub.</p>
        </div>
      </div>

      {/* Right Panel - Promo (hidden on mobile) */}
      <div 
        className="relative m-space-4 hidden overflow-hidden rounded-radius-xl p-space-12 text-primary-foreground lg:flex lg:flex-col lg:justify-end"
        style={{
          backgroundImage: `url(${authBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative max-w-xl">
          <div className="mb-space-5 inline-flex h-14 w-14 items-center justify-center rounded-radius-lg bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="type-page-title text-white">Meal plans and services for Prospera Village.</h2>
          <p className="mt-space-4 type-body-large text-white/80">
            Manage food subscriptions, cleaning plans, and Lightning checkout from one account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
