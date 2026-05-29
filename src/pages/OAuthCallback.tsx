/**
 * OAuthCallback — handles Google OAuth redirect (?code=...&state=...).
 * This is the ONLY auth-related route that still exists as a page.
 * All login/register UI is handled by the AuthModal (Sheet/Dialog).
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const getSafeRedirect = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
};

const OAuthCallback = () => {
  const { isAuthenticated, isLoading, isUserDataReady, roles } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const [done, setDone]= useState(false);

  const redirectTo  = getSafeRedirect(searchParams.get("redirect"));
  const googleCode  = searchParams.get("code");
  const googleState = searchParams.get("state");
  const googleError = searchParams.get("error");

  // Process the OAuth callback
  useEffect(() => {
    if (done) return;
    let isMounted = true;

    (async () => {
      if (googleError) {
        toast.error("Google login was cancelled or failed.");
        if (isMounted) { setDone(true); navigate("/", { replace: true }); openAuthModal("login"); }
        return;
      }

      if (!googleCode) {
        // No code → nothing to process, go home
        if (isMounted) { setDone(true); navigate("/", { replace: true }); }
        return;
      }

      const { error } = await (supabase.auth as any).completeOAuthSignIn({
        provider:   "google",
        code:       googleCode,
        state:      googleState,
        redirectTo: `${window.location.origin}/auth`,
      });

      if (!isMounted) return;
      setDone(true);

      if (error) {
        toast.error(error.message || "Google login failed.");
        navigate("/", { replace: true });
        openAuthModal("login");
      }
      // On success, auth state update fires via onAuthStateChange → the effect below redirects
    })();

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once authenticated, redirect to the intended destination
  useEffect(() => {
    if (!isLoading && isUserDataReady && isAuthenticated && done) {
      const target =
        redirectTo === "/" && roles.includes("super_admin")
          ? "/admin/dashboard"
          : redirectTo;
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isLoading, isUserDataReady, done, navigate, redirectTo, roles]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default OAuthCallback;
