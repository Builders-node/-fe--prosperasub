import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const STORAGE_KEY = "prospera_residence";

interface LocationContextValue {
  /** Selected residence/community name, or "" when none chosen. */
  residence: string;
  setResidence: (name: string) => void;
}

const LocationContext = createContext<LocationContextValue>({
  residence: "",
  setResidence: () => {},
});

export function LocationProvider({ children }: { children: ReactNode }) {
  const [residence, setResidenceState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const setResidence = (name: string) => {
    setResidenceState(name);
    try {
      if (name) localStorage.setItem(STORAGE_KEY, name);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  };

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setResidenceState(e.newValue || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <LocationContext.Provider value={{ residence, setResidence }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useSelectedResidence() {
  return useContext(LocationContext);
}
