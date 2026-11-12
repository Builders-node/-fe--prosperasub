import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, ReactNode } from "react";
import type { DeliveryAddress } from "@/lib/geo/places";

const STORAGE_KEY = "prospera_residence";
/** The pin the visitor dropped on the map (AddressMapDialog). */
const ADDRESS_KEY = "prospera_address";

function readAddress(): DeliveryAddress | null {
  try {
    const raw = localStorage.getItem(ADDRESS_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as DeliveryAddress;
    return Number.isFinite(a?.lat) && Number.isFinite(a?.lng) && typeof a.line === "string" ? a : null;
  } catch {
    return null;
  }
}

interface LocationContextValue {
  /** Selected residence/community name, or "" when none chosen. */
  residence: string;
  setResidence: (name: string) => void;
  /** Where to bring things — a point on the map, or null before one is chosen. */
  address: DeliveryAddress | null;
  setAddress: (a: DeliveryAddress | null) => void;
  /** True while something on the current page actually uses the residence. */
  residenceMatters: boolean;
  /** Called by consumers on mount; returns the un-claim. */
  claimResidence: () => () => void;
}

const LocationContext = createContext<LocationContextValue>({
  residence: "",
  setResidence: () => {},
  address: null,
  setAddress: () => {},
  residenceMatters: false,
  claimResidence: () => () => {},
});

export function LocationProvider({ children }: { children: ReactNode }) {
  const [residence, setResidenceState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [address, setAddressState] = useState<DeliveryAddress | null>(readAddress);
  const setAddress = useCallback((a: DeliveryAddress | null) => {
    setAddressState(a);
    try {
      if (a) localStorage.setItem(ADDRESS_KEY, JSON.stringify(a));
      else localStorage.removeItem(ADDRESS_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // How many mounted components care about the residence right now.
  //
  // The header selector used to show on every page, including the beach club
  // and the generic service listing, where picking a residence changed
  // precisely nothing — a control that lies about what it does. Rather than
  // keep a list of routes where it applies (which goes stale the first time a
  // route is renamed), the pages that read the residence say so by reading it:
  // useSelectedResidence claims while mounted, and the selector shows itself
  // only when someone has claimed.
  const [claims, setClaims] = useState(0);
  const countRef = useRef(0);

  const claimResidence = useCallback(() => {
    countRef.current += 1;
    setClaims(countRef.current);
    return () => {
      countRef.current -= 1;
      setClaims(countRef.current);
    };
  }, []);

  const setResidence = useCallback((name: string) => {
    setResidenceState(name);
    try {
      if (name) localStorage.setItem(STORAGE_KEY, name);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setResidenceState(e.newValue || "");
      if (e.key === ADDRESS_KEY) setAddressState(readAddress());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({ residence, setResidence, address, setAddress, residenceMatters: claims > 0, claimResidence }),
    [residence, setResidence, address, setAddress, claims, claimResidence],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * Read the selected residence, and declare that this page uses it.
 *
 * Claiming is the point: the header selector is visible exactly where some
 * mounted component consumes the value. If a page stops using the residence,
 * the control stops appearing there without anybody remembering to update a
 * list.
 */
export function useSelectedResidence() {
  const ctx = useContext(LocationContext);
  const { claimResidence } = ctx;
  // Layout effect, not effect: the selector should be there in the first paint
  // rather than popping in a frame later.
  useLayoutEffect(() => claimResidence(), [claimResidence]);
  return ctx;
}

/**
 * Declare that the residence matters here without reading it — for a page like
 * Discovery, which filters nothing itself but is where people set the
 * preference before they go looking for a service.
 */
export function useResidenceMatters() {
  const { claimResidence } = useContext(LocationContext);
  useLayoutEffect(() => claimResidence(), [claimResidence]);
}

/** For the selector itself: read the state without claiming it. */
export function useLocationControl() {
  return useContext(LocationContext);
}
