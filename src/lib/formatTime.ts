/**
 * THE clock format: one helper for every time of day a customer reads.
 *
 * Opening hours printed "08:00–17:00" while a booking two screens away said
 * "2:00 PM" — two clocks in one product. English reads 12-hour, Spanish
 * 24-hour, as each language's own readers expect.
 */
const LANGUAGE_STORAGE_KEY = "prospera_language";

function uses24h(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "es";
  } catch {
    return false;
  }
}

/** "14:00" or "14:00:00" → "2:00 PM" (en) / "14:00" (es). Anything else comes back as given. */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23) return hhmm;
  if (uses24h()) return `${String(h).padStart(2, "0")}:${min}`;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${min} ${suffix}`;
}
