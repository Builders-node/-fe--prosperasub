import { useEffect, useRef } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { Minus, Navigation, Plus } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { GeoPoint } from "@/lib/geo/places";

/**
 * The map half of the address picker (AddressMapDialog) — its own chunk, so
 * MapLibre is downloaded only by someone who opens it.
 *
 * Tiles: OpenFreeMap — OpenStreetMap vector tiles, free, no key, no request
 * cap (CARTO's raster tiles began demanding a key). Liberty by day, Dark by
 * night, following the app's theme.
 *
 * The pin does not move; the map moves under it. That is how Lavka, Uber and
 * every delivery app do it, because dragging a pin with a thumb hides the very
 * spot you are aiming at. The bubble above the pin says what is under it.
 */

/** What a caller can do to the map — fly somewhere. */
export interface MapHandle { flyTo: (pt: GeoPoint, zoom?: number) => void }

export interface AddressMapProps {
  center: GeoPoint;
  /** Fires when the map stops moving, with the point under the pin. */
  onSettle: (pt: GeoPoint) => void;
  /** Fires the moment the map starts moving (the bubble goes quiet). */
  onMoveStart: () => void;
  /** The bubble over the pin; null hides it. */
  bubble: { text: string; tone: "neutral" | "positive" | "negative" } | null;
  onReady?: (map: MapHandle) => void;
  onLocate: () => void;
  locating?: boolean;
  className?: string;
}

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export default function AddressMap({
  center, onSettle, onMoveStart, bubble, onReady, onLocate, locating, className,
}: AddressMapProps) {
  const { resolvedTheme } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  // The latest callbacks, without re-creating the map when they change.
  const cb = useRef({ onSettle, onMoveStart });
  cb.current = { onSettle, onMoveStart };

  useEffect(() => {
    if (!boxRef.current) return;
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: resolvedTheme === "dark" ? STYLE.dark : STYLE.light,
      center: [center.lng, center.lat],
      zoom: 16,
      minZoom: 9,
      maxZoom: 19,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const settle = () => {
      const c = map.getCenter();
      cb.current.onSettle({ lat: c.lat, lng: c.lng });
    };
    map.on("movestart", () => cb.current.onMoveStart());
    map.on("moveend", settle);
    map.once("load", () => { map.resize(); settle(); });
    // The dialog animates in; the canvas was measured mid-animation.
    const t = window.setTimeout(() => map.resize(), 300);

    onReady?.({ flyTo: (pt, zoom = 17) => map.flyTo({ center: [pt.lng, pt.lat], zoom, duration: 700 }) });
    return () => { window.clearTimeout(t); map.remove(); mapRef.current = null; };
    // The map is made once per opening; the theme swaps its style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(resolvedTheme === "dark" ? STYLE.dark : STYLE.light);
  }, [resolvedTheme]);

  return (
    <div className={cn("relative overflow-hidden bg-inset", className)}>
      {/* h-full, not absolute: maplibre-gl.css makes its container position:relative. */}
      <div ref={boxRef} className="h-full w-full" />

      {/* The fixed pin: its tip sits exactly on the map's centre. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
        {bubble && (
          <div className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap">
            <div
              className={cn(
                "max-w-[min(320px,80vw)] truncate rounded-full px-4 py-2 text-[15px] font-semibold",
                bubble.tone === "negative" ? "bg-negative text-white" : "bg-foreground text-background",
              )}
            >
              {bubble.text}
            </div>
            <span
              className={cn(
                "absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[7px] border-x-transparent",
                bubble.tone === "negative" ? "border-t-negative" : "border-t-foreground",
              )}
            />
          </div>
        )}
        <div className="flex flex-col items-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <span className="h-4 w-4 rounded-full bg-white" />
          </span>
          <span className="h-4 w-[3px] rounded-b-full bg-primary" />
        </div>
      </div>

      {/* Zoom and "where am I" — right edge, as on every map app. */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
        <div className="flex flex-col overflow-hidden rounded-radius-md bg-card">
          <MapButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="h-5 w-5" /></MapButton>
          <MapButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="h-5 w-5" /></MapButton>
        </div>
        <div className="overflow-hidden rounded-radius-md bg-card">
          <MapButton label="Use my location" onClick={onLocate}>
            {locating ? <Spinner size="sm" /> : <Navigation className="h-5 w-5 fill-current" strokeWidth={0} />}
          </MapButton>
        </div>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center text-foreground transition-colors hover:bg-inset"
    >
      {children}
    </button>
  );
}
