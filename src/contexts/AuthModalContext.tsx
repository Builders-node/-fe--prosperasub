/**
 * AuthModalContext
 *
 * Provides a global `openAuthModal()` that any component can call.
 * The modal itself is mounted once at the app root, so it slides over
 * whatever page is currently visible — no navigation required.
 *
 * Usage:
 *   const { openAuthModal } = useAuthModal();
 *   openAuthModal("login", "/my-subscriptions");
 */

import { createContext, useCallback, useContext, useState } from "react";
import { AuthModal, type AuthView } from "@/components/auth/AuthModal";

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthModalContextValue {
  /** Open the modal. view defaults to "login", redirectTo defaults to "/". */
  openAuthModal: (view?: AuthView, redirectTo?: string) => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen]           = useState(false);
  const [view, setView]           = useState<AuthView>("login");
  const [redirectTo, setRedirectTo] = useState("/");

  const openAuthModal = useCallback(
    (v: AuthView = "login", redirect = "/") => {
      setView(v);
      setRedirectTo(redirect);
      setOpen(true);
    },
    [],
  );

  const closeAuthModal = useCallback(() => setOpen(false), []);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <AuthModal
        open={open}
        onClose={closeAuthModal}
        defaultView={view}
        redirectTo={redirectTo}
      />
    </AuthModalContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthModal() {
  return useContext(AuthModalContext);
}
