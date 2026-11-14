/**
 * OAuthCallback — handles Google OAuth redirect (?code=...&state=...).
 * This is the ONLY auth-related route that still exists as a page.
 * All login/register UI is handled by the AuthModal (Sheet/Dialog).
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLoader } from "@/components/ui/spinner";
import { OAUTH_RETURN_KEY, useAuth } from "@/contexts/AuthContext";
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

  // ?redirect= first; otherwise the path loginWithGoogle parked before
  // leaving for Google (read once, so a later sign-in doesn't inherit it).
  const [redirectTo] = useState(() => {
    let parked: string | null = null;
    try { parked = localStorage.getItem(OAUTH_RETURN_KEY); localStorage.removeItem(OAUTH_RETURN_KEY); } catch { /* ignore */ }
    return getSafeRedirect(searchParams.get("redirect") ?? parked);
  });
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
    <PageLoader className="min-h-screen bg-background" />
  );
};

export default OAuthCallback;
