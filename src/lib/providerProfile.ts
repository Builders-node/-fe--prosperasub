/**
 * How finished a business's public profile is.
 *
 * Every provider on the platform reached "active" with no phone, no email and
 * — for the two cleaning businesses — no address and no opening hours. That is
 * the first thing a customer sees, and two of those blanks are load-bearing
 * elsewhere: the platform shares a provisioned Google calendar with the
 * contact address, and the booking calendar reads the hours.
 *
 * Nothing here blocks anything. A checklist that says what is missing does
 * more than a gate that locks a live business out of its own workspace.
 */

export interface ProfileField {
  key: string;
  label: string;
  /** Why it matters — shown under the item, so the ask is not arbitrary. */
  why: string;
  done: boolean;
}

interface ProfileInput {
  description?: string | null;
  location?: string | null;
  working_hours?: unknown;
  contact_phone?: string | null;
  contact_email?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  gallery_urls?: unknown;
}

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const hasHours = (v: unknown) => {
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0 && v.trim() !== "{}" && v.trim() !== "[]";
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return false;
};

export function profileChecklist(p: ProfileInput): ProfileField[] {
  const gallery = Array.isArray(p.gallery_urls) ? p.gallery_urls.filter(Boolean) : [];
  return [
    { key: "description", label: "Description", why: "The line customers read under your name.", done: filled(p.description) },
    { key: "avatar", label: "Logo", why: "Shown on every card and in search.", done: filled(p.avatar_url) },
    { key: "banner", label: "Cover photo", why: "The top of your public page.", done: filled(p.banner_url) },
    { key: "gallery", label: "Photos", why: "Businesses with photos get opened more often.", done: gallery.length > 0 },
    { key: "location", label: "Address", why: "Where you are, on the map and the profile.", done: filled(p.location) },
    { key: "hours", label: "Opening hours", why: "The booking calendar offers times from these.", done: hasHours(p.working_hours) },
    { key: "phone", label: "Phone", why: "How a customer reaches you when plans change.", done: filled(p.contact_phone) },
    { key: "email", label: "Email", why: "Where the platform shares your Google calendar.", done: filled(p.contact_email) },
  ];
}

export interface ProfileCompleteness {
  fields: ProfileField[];
  missing: ProfileField[];
  done: number;
  total: number;
  /** 0–100, rounded. */
  percent: number;
}

export function profileCompleteness(p: ProfileInput): ProfileCompleteness {
  const fields = profileChecklist(p);
  const done = fields.filter((f) => f.done).length;
  return {
    fields,
    missing: fields.filter((f) => !f.done),
    done,
    total: fields.length,
    percent: Math.round((done / fields.length) * 100),
  };
}
