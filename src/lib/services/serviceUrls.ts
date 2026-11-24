import { Car, ChefHat, SparklesIcon, Waves } from "lucide-react";

/**
 * The one place that knows how a service is spelled in a URL.
 *
 * Three vocabularies were in play at once and nothing reconciled them:
 *
 *   - the archetype key in the database  — `entertainment`, `rental`
 *   - the legacy source_service_key      — `beach`, `cars`
 *   - whatever each page hard-coded      — `beach-club`, `rental`
 *
 * So the Beach listing lived at `/services/beach-club` while its own provider
 * links pointed at `/services/entertainment/providers/:id`, and
 * `/services/beach-club/providers/:id` — the URL anyone would actually type —
 * matched the route but rendered an empty page, because the lookup keyed off
 * the raw segment and `beach-club` wasn't in it. Same for
 * `/services/food/providers/:id`.
 *
 * Every service URL should be built through the helpers here rather than
 * assembled inline, so the vocabulary can only be wrong in one place.
 */

/** Canonical archetype keys, as stored in `service_archetypes.key`. */
export type ArchetypeKey = "cleaning" | "food" | "rental" | "entertainment";

/**
 * Every spelling that may appear in a URL → the canonical archetype key.
 * Includes the legacy source keys so old links keep resolving.
 */
const SLUG_TO_KEY: Record<string, ArchetypeKey> = {
  cleaning: "cleaning",
  food: "food",
  rental: "rental",
  cars: "rental",
  "car-rental": "rental",
  // The archetype's DB key. Any link built from the row itself must resolve.
  vehicles: "rental",
  entertainment: "entertainment",
};

/** The canonical archetype key → the segment we put in URLs. */
const KEY_TO_SLUG: Record<ArchetypeKey, string> = {
  cleaning: "cleaning",
  food: "food",
  rental: "rental",
  // The Beach Club's old /services/beach-club listing is gone: the club is one
  // business inside whichever service it is filed under.
  entertainment: "entertainment",
};

/** Resolve any URL segment to the canonical key, or null if unknown. */
export function archetypeFromSlug(slug: string | undefined | null): ArchetypeKey | null {
  if (!slug) return null;
  return SLUG_TO_KEY[String(slug).trim().toLowerCase()] ?? null;
}

/** The public URL segment for a service, given a key OR another spelling. */
export function serviceSlug(keyOrSlug: string | undefined | null): string {
  const key = archetypeFromSlug(keyOrSlug);
  return key ? KEY_TO_SLUG[key] : String(keyOrSlug ?? "");
}

// ─── Link builders ──────────────────────────────────────────────────────────
// One shape everywhere: /services/<service>/<collection>/<id>

export const serviceListingHref = (keyOrSlug: string) => `/services/${serviceSlug(keyOrSlug)}`;

export const providerHref = (keyOrSlug: string, providerId: string) =>
  `/services/${serviceSlug(keyOrSlug)}/providers/${providerId}`;

/**
 * The one address a plan has: /plans/<words>-<number>.
 *
 * Flat, the way big shops address a product — the service is NOT in it. A
 * plan whose business moves to another service keeps its address, and the
 * links are short enough to read in a chat. Where it sits (service ›
 * category › business) is said by the breadcrumbs and their JSON-LD.
 * The old /services/<service>/plans/<id> still opens and is replaced.
 *
 * Pass `planSegment(row)` — the words and number where the row has them
 * (beach-club-membership-1042). A bare id still works: the plan page finds the
 * plan by any of its ids and replaces the address with the words.
 */
export const planHref = (_keyOrSlug: string | null | undefined, planId: string) => `/plans/${planId}`;

// ─── Addresses made of words ─────────────────────────────────────────────────
//
// A plan or a car is addressed the way big shops do it — the name in words,
// then a short number: /services/clubs/plans/beach-club-membership-1042.
// The number (`public_no`) is what the page looks the row up by; the words
// (`slug`, made from the name by the database) are for people and search
// engines. A rename changes the words, and old links still open: the page
// finds the row by the number and replaces the address with the current one.
// (Migration 20261207120000_readable_plan_and_vehicle_urls in the backend.)

/** What a row needs to have an address of words. */
export interface Addressable {
  id: string | number;
  slug?: string | null;
  public_no?: number | string | null;
  /** A legacy plan's own id — its address until the words exist. */
  source_plan_id?: string | null;
}

/** "beach-club-membership-1042" — or null while the row has no number yet. */
export function wordsAddress(row: Pick<Addressable, "slug" | "public_no"> | null | undefined): string | null {
  const no = row?.public_no;
  if (no === null || no === undefined || no === "") return null;
  const words = (row?.slug ?? "").trim();
  return words ? `${words}-${no}` : String(no);
}

/**
 * The URL segment for a plan row: its words where it has them, else the
 * original id (a legacy plan's), else its own uuid. Every old form keeps
 * resolving and is sent on to the words by the page itself.
 */
export const planSegment = (row: Addressable): string =>
  wordsAddress(row) ?? String(row.source_plan_id || row.id);

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORDS_SHAPE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?(\d{1,12})$/;

/**
 * The number at the end of an address of words, or null when the segment is
 * something else (a uuid, a legacy text id). A legacy id can also end in
 * digits, so a caller that finds no row by the number should still try the
 * segment as an id.
 */
export function publicNoOf(segment: string | null | undefined): number | null {
  const s = String(segment ?? "").trim().toLowerCase();
  if (!s || UUID_SHAPE.test(s)) return null;
  const m = WORDS_SHAPE.exec(s);
  return m ? Number(m[1]) : null;
}

/** Per-service display metadata for the shared provider page. */
export interface ServiceMeta {
  /** Heading over the provider's offerings list. */
  offeringsHeading: string;
  /** Plural noun used as the URL collection segment. */
  collection: string;
  icon: React.ComponentType<{ className?: string }>;
  listingRoute: string;
}

export const SERVICE_META: Record<ArchetypeKey, ServiceMeta> = {
  cleaning:      { offeringsHeading: "Plans",    collection: "plans",    icon: SparklesIcon, listingRoute: "/services/cleaning" },
  food:          { offeringsHeading: "Plans",    collection: "plans",    icon: ChefHat,      listingRoute: "/services/food" },
  rental:        { offeringsHeading: "Vehicles", collection: "vehicles", icon: Car,          listingRoute: "/vehicles" },
  entertainment: { offeringsHeading: "Plans",    collection: "plans",    icon: Waves,        listingRoute: "/services/entertainment" },
};

/** Metadata for a URL segment, or null when the segment names no known service. */
export function serviceMetaFromSlug(slug: string | undefined | null): ServiceMeta | null {
  const key = archetypeFromSlug(slug);
  return key ? SERVICE_META[key] : null;
}
