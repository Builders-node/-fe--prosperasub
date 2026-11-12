import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { MapHandle } from "./AddressMap";
import { MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLocationControl } from "@/contexts/LocationContext";
import { useResidences } from "@/hooks/useResidences";
import {
  DEFAULT_CENTER, inRoatan, nameOfPoint, searchPlaces,
  type DeliveryAddress, type GeoPoint, type PlaceHit,
} from "@/lib/geo/places";
import { cn } from "@/lib/utils";

const AddressMap = lazy(() => import("./AddressMap"));

/**
 * "Your address" — a search box, an OK, and a map with a pin (after Yandex
 * Lavka's address modal).
 *
 * The pin is the address. On Roatán most places have no street and number, so
 * the search only moves the map; the customer then nudges the map until the
 * pin sits on their door, and the bubble over it answers the one question that
 * matters — does this get delivered here?
 *
 * `coverage` is how a caller answers that question for ITS offer: the header
 * asks nothing (any point on the island is a fine place to browse from); a
 * checkout passes the offer's delivery zones and gets "Delivered here · $5"
 * or "Not delivered here" under the pin before anyone presses OK.
 */

export interface CoverageAnswer { ok: boolean; text: string }

export function AddressMapDialog({
  open, onOpenChange, title = "Your address", description, coverage, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Can THIS offer be delivered to the point? Null = no answer to give. */
  coverage?: (pt: GeoPoint) => CoverageAnswer | null;
  /** Defaults to saving it as the visitor's address (header, checkout). */
  onConfirm?: (a: DeliveryAddress) => void;
}) {
  const { address, setAddress, residence, setResidence } = useLocationControl();
  const { data: residences = [] } = useResidences();

  const start = address ?? DEFAULT_CENTER;
  const [point, setPoint] = useState<GeoPoint>(start);
  const [name, setName] = useState<string | null>(address?.line ?? null);
  const [moving, setMoving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [locating, setLocating] = useState(false);

  const [query, setQuery] = useState(address?.line ?? "");
  const [typing, setTyping] = useState(false);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);

  const mapRef = useRef<MapHandle | null>(null);
  const nameAbort = useRef<AbortController | null>(null);
  const nameTimer = useRef<number>();

  // Every opening starts from the saved address, not from the last draft.
  useEffect(() => {
    if (!open) return;
    setPoint(address ?? DEFAULT_CENTER);
    setName(address?.line ?? null);
    setQuery(address?.line ?? "");
    setHits([]);
    setTyping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Search as they type — a beat after the last key, the previous one aborted.
  useEffect(() => {
    if (!typing) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setSearching(true);
      setHits(await searchPlaces(query, ctrl.signal));
      setSearching(false);
    }, 300);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [query, typing]);

  /** The map came to rest: name the point under the pin. */
  const settle = (pt: GeoPoint) => {
    setPoint(pt);
    setMoving(false);
    window.clearTimeout(nameTimer.current);
    nameAbort.current?.abort();
    if (!inRoatan(pt)) { setName(null); return; }
    nameTimer.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      nameAbort.current = ctrl;
      setNaming(true);
      const n = await nameOfPoint(pt, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setNaming(false);
      setName(n);
      // The box says where the pin is — unless they are typing in it.
      if (!typing) setQuery(n ?? "");
    }, 350);
  };

  const flyTo = (pt: GeoPoint, zoom = 17) => mapRef.current?.flyTo(pt, zoom);

  const pickHit = (h: PlaceHit) => {
    setTyping(false);
    setHits([]);
    setQuery([h.title, h.subtitle].filter(Boolean).join(", "));
    flyTo(h);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) { toast.error("This browser can't tell us where you are."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inRoatan(pt)) { toast("You seem to be off the island — move the map to where you'll be."); return; }
        setTyping(false);
        flyTo(pt, 18);
      },
      () => { setLocating(false); toast.error("Couldn't get your location. Allow it in the browser, or move the map."); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const offIsland = !inRoatan(point);
  const answer = !offIsland && coverage ? coverage(point) : null;
  const bubble = moving ? null
    : offIsland ? { text: "We only deliver on Roatán", tone: "negative" as const }
    : answer ? { text: answer.text, tone: answer.ok ? "positive" as const : "negative" as const }
    : { text: "Deliver here", tone: "neutral" as const };

  const confirm = () => {
    if (offIsland) return;
    // Never a pair of coordinates in the header: a person reads a place.
    const line = (name ?? query.trim()) || "Pinned location";
    const next: DeliveryAddress = { lat: point.lat, lng: point.lng, line, details: address?.details };
    if (onConfirm) onConfirm(next); else setAddress(next);
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description ?? "Businesses deliver to their own areas, so where you are decides what can be brought to you."}
      className="sm:max-w-[1040px]"
      bodyClassName="grid-rows-[auto_minmax(0,1fr)]"
    >
      {/* Search + OK. On a phone the button keeps its place to the right. */}
      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setTyping(true); setQuery(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); pickHit(hits[0]); } }}
              placeholder="Search a place, a community, a hotel…"
              aria-label="Search an address"
              className="h-12 w-full rounded-radius-md bg-inset pl-12 pr-11 text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => { setQuery(""); setHits([]); setTyping(true); }}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {typing && query.trim().length >= 2 && (
              <div className="absolute inset-x-0 top-full z-[1000] mt-2 overflow-hidden rounded-radius-md bg-card outline outline-1 outline-foreground/10">
                {searching && hits.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 text-body text-muted-foreground"><Spinner size="sm" /> Searching…</div>
                ) : hits.length === 0 ? (
                  <p className="p-4 text-body text-muted-foreground">Nothing found on Roatán — move the map to your place instead.</p>
                ) : hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => pickHit(h)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-inset"
                  >
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-body font-semibold text-foreground">{h.title}</span>
                      {h.subtitle && <span className="block truncate text-meta text-muted-foreground">{h.subtitle}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="lg" className="w-24 shrink-0 sm:w-[200px]" disabled={offIsland || moving} onClick={confirm}>
            OK
          </Button>
        </div>

        {/* The communities — still how listings know what is sold where. */}
        {residences.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {residences.map((r) => {
              const on = residence === r.name;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setResidence(on ? "" : r.name)}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors",
                    on ? "bg-foreground text-background" : "bg-inset text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-[56vh] min-h-[320px] sm:h-[520px]">
        {open && (
          <Suspense fallback={<div className="flex h-full items-center justify-center bg-inset"><Spinner /></div>}>
            <AddressMap
              center={start}
              className="h-full rounded-radius-lg"
              onReady={(m) => { mapRef.current = m; }}
              onMoveStart={() => { setMoving(true); nameAbort.current?.abort(); setNaming(false); }}
              onSettle={settle}
              bubble={bubble}
              onLocate={locate}
              locating={locating}
            />
          </Suspense>
        )}
      </div>
    </ResponsiveDialog>
  );
}
