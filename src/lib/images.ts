/**
 * Pictures at the size they are shown, not the size they were uploaded.
 *
 * Partners upload straight from a phone or a stock site, so Storage holds
 * 2000–3500px originals of 0.5–1.8 MB, and every card on the home page was
 * downloading them whole to draw a 159px square (≈5 MB of photos for one
 * screen). Supabase can resize on the fly: the same path under
 * `/render/image/` instead of `/object/` with `?width=`, and it answers in
 * WebP/AVIF to browsers that say they accept them. One photo measured:
 * 486 KB → 67 KB at width 320.
 *
 * Only our own public Storage URLs are rewritten. Anything else (a partner's
 * website, an SVG, a GIF that would lose its animation) passes through as is.
 */

/** The widths we ever ask for — few, so the CDN keeps a warm copy of each. */
const STEPS = [96, 160, 240, 320, 480, 640, 960, 1280, 1920] as const;

/** Any Supabase project's public Storage object — dev builds read prod photos too. */
const STORAGE_OBJECT = /^(https:\/\/[a-z0-9-]+\.supabase\.co)\/storage\/v1\/object\/public\/([^?#]+)/i;

/** Supabase's resizer reads JPEG, PNG, WebP, AVIF, HEIC; not SVG or GIF. */
const RESIZABLE = /\.(jpe?g|png|webp|avif|heic)$/i;

export function isResizable(url: string | null | undefined): url is string {
  const m = url ? STORAGE_OBJECT.exec(url) : null;
  return !!m && RESIZABLE.test(m[2]);
}

/** The smallest step that still covers `px`, so a sharp picture never needs a bigger one. */
export function widthStep(px: number): number {
  for (const s of STEPS) if (s >= px) return s;
  return STEPS[STEPS.length - 1];
}

/**
 * The resized address for a slot of `w`×`h` CSS pixels, at the screen's
 * density (capped at 2×: a 3× phone can't tell on a photo, and it would more
 * than double the bytes).
 *
 * With a known height the server crops to the slot's own proportions
 * (`resize=cover`, centred) — exactly what `object-fit: cover` did in the
 * browser, minus the pixels nobody saw. Without one (a slot that takes the
 * picture's height) it only scales, keeping the proportions.
 *
 * Returns the URL unchanged when it is not one we can resize.
 */
export function sizedImageUrl(
  url: string,
  w: number,
  h = 0,
  dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
): string {
  const m = STORAGE_OBJECT.exec(url);
  if (!m || !RESIZABLE.test(m[2]) || !(w > 0)) return url;
  const density = Math.min(Math.max(dpr, 1), 2);
  const width = widthStep(Math.ceil(w * density));
  const base = `${m[1]}/storage/v1/render/image/public/${m[2]}?width=${width}`;
  if (h > 0) {
    const height = Math.round((width * h) / w);
    return `${base}&height=${height}&resize=cover&quality=70`;
  }
  return `${base}&resize=contain&quality=70`;
}

/**
 * Cache lifetime for a newly uploaded picture, in seconds (one year).
 * Every upload gets a fresh timestamped path and is never overwritten, so a
 * browser can keep it for good. Supabase's default (1 hour) made a returning
 * visitor download every photo again.
 */
export const IMMUTABLE = "31536000";
