import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { circleRing, zoneColor, zoneRing, type DeliveryZone } from "@/lib/delivery/zones";
import { DEFAULT_CENTER, type GeoPoint } from "@/lib/geo/places";
import { cn } from "@/lib/utils";

/**
 * The delivery zones on a map, and the one being drawn.
 *
 * Its own lazy chunk (MapLibre). Zones are filled areas in their colour; the
 * selected one is stronger. A draft is either the points clicked so far (a
 * polygon, closed for preview once it has three) or a circle around a centre.
 *
 * Clicks go to `onMapClick` while drawing and select a zone otherwise.
 */

export interface ZoneDraft {
  shape: "polygon" | "circle";
  points: [number, number][];
  center: GeoPoint | null;
  radiusM: number;
  color: string;
}

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

type FC = GeoJSON.FeatureCollection;

function zonesGeo(zones: DeliveryZone[], selectedId: string | null, hideId: string | null): FC {
  return {
    type: "FeatureCollection",
    features: zones.filter((z) => z.id !== hideId).map((z, i) => {
      const ring = zoneRing(z);
      return {
        type: "Feature",
        id: i,
        properties: { id: z.id, color: zoneColor(z, i), selected: z.id === selectedId ? 1 : 0, active: z.is_active ? 1 : 0 },
        geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      };
    }).filter((f) => (f.geometry.coordinates[0]?.length ?? 0) >= 4) as GeoJSON.Feature[],
  };
}

function draftGeo(d: ZoneDraft | null): { area: FC; points: FC } {
  const empty: FC = { type: "FeatureCollection", features: [] };
  if (!d) return { area: empty, points: empty };
  const ring = d.shape === "circle" ? (d.center ? circleRing(d.center, d.radiusM) : []) : d.points;
  const area: FC = { type: "FeatureCollection", features: [] };
  if (ring.length >= 3) {
    area.features.push({ type: "Feature", properties: { color: d.color }, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
  } else if (ring.length === 2) {
    area.features.push({ type: "Feature", properties: { color: d.color }, geometry: { type: "LineString", coordinates: ring } });
  }
  const pts = d.shape === "circle" ? (d.center ? [[d.center.lng, d.center.lat]] : []) : d.points;
  return {
    area,
    points: { type: "FeatureCollection", features: pts.map((p) => ({ type: "Feature", properties: { color: d.color }, geometry: { type: "Point", coordinates: p } })) },
  };
}

export default function ZoneMap({
  zones, selectedId, editingId, draft, drawing, onMapClick, onZoneClick, className,
}: {
  zones: DeliveryZone[];
  selectedId: string | null;
  /** The zone being edited — hidden, since the draft stands in for it. */
  editingId: string | null;
  draft: ZoneDraft | null;
  /** True while clicks add points / set the centre. */
  drawing: boolean;
  onMapClick: (pt: GeoPoint) => void;
  onZoneClick: (id: string) => void;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef({ zones, selectedId, editingId, draft, drawing, onMapClick, onZoneClick });
  latest.current = { zones, selectedId, editingId, draft, drawing, onMapClick, onZoneClick };
  const fitted = useRef(false);

  /** (Re)build sources and layers — after the first load and after every style swap. */
  const install = (map: MlMap) => {
    const s = latest.current;
    const add = (id: string, data: FC) => {
      if (map.getSource(id)) (map.getSource(id) as GeoJSONSource).setData(data);
      else map.addSource(id, { type: "geojson", data });
    };
    add("zones", zonesGeo(s.zones, s.selectedId, s.editingId));
    const d = draftGeo(s.draft);
    add("draft-area", d.area);
    add("draft-points", d.points);
    if (!map.getLayer("zones-fill")) {
      map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.4, ["==", ["get", "active"], 1], 0.22, 0.08],
      } });
      map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: {
        "line-color": ["get", "color"],
        "line-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
        // line-dasharray cannot be data-driven; a switched-off zone is fainter instead.
        "line-opacity": ["case", ["==", ["get", "active"], 1], 1, 0.4],
      } });
      map.addLayer({ id: "draft-fill", type: "fill", source: "draft-area", filter: ["==", "$type", "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": 0.3 } });
      map.addLayer({ id: "draft-line", type: "line", source: "draft-area", paint: { "line-color": ["get", "color"], "line-width": 2.5 } });
      map.addLayer({ id: "draft-points", type: "circle", source: "draft-points", paint: {
        "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 3,
      } });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: resolvedTheme === "dark" ? STYLE.dark : STYLE.light,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 11,
      dragRotate: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    map.on("style.load", () => { install(map); ready.current = true; });
    map.on("click", (e) => {
      const s = latest.current;
      if (s.drawing) { s.onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng }); return; }
      const hit = map.queryRenderedFeatures(e.point, { layers: ["zones-fill"] })[0];
      if (hit?.properties?.id) s.onZoneClick(String(hit.properties.id));
    });
    const t = window.setTimeout(() => map.resize(), 300);
    return () => { window.clearTimeout(t); map.remove(); mapRef.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ready.current = false;
    map.setStyle(resolvedTheme === "dark" ? STYLE.dark : STYLE.light);
  }, [resolvedTheme]);

  // Data changes: refresh the sources in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    install(map);
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
  });

  // Once, when zones first arrive: show them all.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitted.current || zones.length === 0) return;
    const pts = zones.flatMap(zoneRing);
    if (!pts.length) return;
    fitted.current = true;
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, { padding: 48, duration: 0, maxZoom: 15 });
  }, [zones]);

  return <div ref={box} className={cn("overflow-hidden rounded-radius-lg bg-inset", className)} />;
}
