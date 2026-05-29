/**
 * UserModeContext
 *
 * Lets a super-admin "become" a regular user — the entire UI switches to the
 * standard user experience.  A floating amber banner stays visible so they
 * always know they're in user-mode and can exit with one tap.
 *
 * State is stored in sessionStorage so it resets when the tab is closed.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const KEY = "prospera_user_mode";

interface UserModeContextValue {
  isUserMode: boolean;
  enterUserMode: () => void;
  exitUserMode:  () => void;
}

const UserModeContext = createContext<UserModeContextValue>({
  isUserMode:    false,
  enterUserMode: () => {},
  exitUserMode:  () => {},
});

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [isUserMode, setIsUserMode] = useState(
    () => sessionStorage.getItem(KEY) === "true",
  );
  const navigate = useNavigate();

  const enterUserMode = useCallback(() => {
    sessionStorage.setItem(KEY, "true");
    setIsUserMode(true);
    navigate("/");
  }, [navigate]);

  const exitUserMode = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setIsUserMode(false);
    navigate("/admin/dashboard");
  }, [navigate]);

  // Sync across tabs (edge-case: admin has multiple tabs open)
  useEffect(() => {
    const handler = () => {
      setIsUserMode(sessionStorage.getItem(KEY) === "true");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <UserModeContext.Provider value={{ isUserMode, enterUserMode, exitUserMode }}>
      {children}
      {isUserMode && <UserModeBanner onExit={exitUserMode} />}
    </UserModeContext.Provider>
  );
}

export function useUserMode() {
  return useContext(UserModeContext);
}

// ─── Floating banner ──────────────────────────────────────────────────────────

function UserModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div
      className="fixed left-4 right-4 z-[9999] flex items-center justify-between gap-3 rounded-2xl px-4 py-3 md:left-auto md:right-6 md:w-auto"
      style={{
        bottom: "max(env(safe-area-inset-bottom, 0px), 5rem)",
        background: "#F8A31A",
        boxShadow: "0 4px 20px rgba(248,163,26,0.4)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">👁</span>
        <span className="text-[13px] font-bold text-black">Viewing as regular user</span>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="shrink-0 rounded-full bg-black/15 px-3 py-1 text-[12px] font-bold text-black transition hover:bg-black/25"
      >
        Exit ✕
      </button>
    </div>
  );
}
