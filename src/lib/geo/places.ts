/**
 * Where on the island — search a place by name, and name a point.
 *
 * Photon (komoot's OpenStreetMap geocoder): free, no key, CORS-enabled, and it
 * takes a bounding box, so "Pristine Bay" finds the one on Roatán rather than
 * one in Florida. Roatán's addresses are mostly not street + number, so the
 * search is a way to MOVE THE MAP; the pin the customer drops is the address.
 */

export interface GeoPoint { lat: number; lng: number }

/** A chosen delivery point: where, and how a person would say it. */
export interface DeliveryAddress extends GeoPoint {
  /** The one line shown in the header and on the order ("Pristine Bay, Roatán"). */
  line: string;
  /** What the courier needs at the door — building, apartment, gate code. */
  details?: string;
}

export interface PlaceHit extends GeoPoint { id: string; title: string; subtitle: string }

/** Roatán and its keys, west to east. */
export const ROATAN_BBOX = { minLng: -86.66, minLat: 16.24, maxLng: -86.2, maxLat: 16.52 } as const;
/** Próspera / Crawfish Rock — where the map opens before anyone has chosen. */
export const DEFAULT_CENTER: GeoPoint = { lat: 16.3545, lng: -86.4745 };

const PHOTON = "https://photon.komoot.io";

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined> & { osm_id?: number | string };
}

function describe(p: PhotonFeature["properties"]): { title: string; subtitle: string } {
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const title = p.name || street || p.district || p.city || "Dropped pin";
  const subtitle = [p.name ? street : null, p.district, p.city ?? p.county, p.state]
    .filter((x, i, a) => x && x !== title && a.indexOf(x) === i)
    .join(", ");
  return { title, subtitle };
}

/** Places on the island matching what was typed; [] on any failure. */
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const text = q.trim();
  if (text.length < 2) return [];
  const b = ROATAN_BBOX;
  const url = `${PHOTON}/api/?q=${encodeURIComponent(text)}&limit=10&lang=en`
    + `&bbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`
    + `&lat=${DEFAULT_CENTER.lat}&lon=${DEFAULT_CENTER.lng}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const json = await res.json() as { features?: PhotonFeature[] };
    // OSM keeps a road as several ways and a beach as a point AND an area —
    // one line per name is what a person wants to choose from.
    const seen = new Set<string>();
    return (json.features ?? []).map((f, i) => ({
      id: `${f.properties.osm_id ?? i}-${i}`,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      ...describe(f.properties),
    })).filter((h) => {
      const k = `${h.title}|${h.subtitle}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    return [];
  }
}

/** The nearest named thing to a point, as one line — or null. */
export async function nameOfPoint(pt: GeoPoint, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${pt.lat}&lon=${pt.lng}&lang=en&limit=1`, { signal });
    if (!res.ok) return null;
    const json = await res.json() as { features?: PhotonFeature[] };
    const f = json.features?.[0];
    if (!f) return null;
    const { title, subtitle } = describe(f.properties);
    return [title, subtitle.split(", ")[0]].filter(Boolean).join(", ");
  } catch {
    return null;
  }
}

export const inRoatan = (pt: GeoPoint) =>
  pt.lat >= ROATAN_BBOX.minLat && pt.lat <= ROATAN_BBOX.maxLat
  && pt.lng >= ROATAN_BBOX.minLng && pt.lng <= ROATAN_BBOX.maxLng;

/** A pin with no name yet still has to read as something. */
export const coordsLine = (pt: GeoPoint) => `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`;
