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
  "beach-club": "entertainment",
  beach: "entertainment",
  entertainment: "entertainment",
};

/** The canonical archetype key → the segment we put in URLs. */
const KEY_TO_SLUG: Record<ArchetypeKey, string> = {
  cleaning: "cleaning",
  food: "food",
  rental: "rental",
  // `entertainment` is the internal key; `beach-club` is the public word.
  entertainment: "beach-club",
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
  rental:        { offeringsHeading: "Vehicles", collection: "vehicles", icon: Car,          listingRoute: "/services/rental" },
  entertainment: { offeringsHeading: "Plans",    collection: "plans",    icon: Waves,        listingRoute: "/services/beach-club" },
};

/** Metadata for a URL segment, or null when the segment names no known service. */
export function serviceMetaFromSlug(slug: string | undefined | null): ServiceMeta | null {
  const key = archetypeFromSlug(slug);
  return key ? SERVICE_META[key] : null;
}
