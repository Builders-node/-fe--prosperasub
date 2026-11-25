/**
 * One colour per category on the home page's banner cards.
 *
 * Every card used to be the same orange, so four of them in a row read as one
 * long orange strip and nothing told Coffee from Cleaning at a glance. Each
 * category now has its own soft tone: the tile behind its drawing, with a
 * lighter halo inside it (see categoryBannerArt). The card around the tile
 * stays the app's plain surface, so the colour is an accent, not the card.
 * Fixed colours, the same in both themes, like the drawings they carry.
 *
 * A category not listed here gets a tone from the rotation by its key, so a
 * new one added in the admin is still coloured without a code change, and
 * always the same colour.
 */
export interface CategoryTone {
  /** The tile behind the drawing. */
  bg: string;
  /** The halo behind the drawing: a lighter shade of bg. */
  glow: string;
}

const SUN: CategoryTone = { bg: "#f6d29a", glow: "#fbe6c4" };
const CORAL: CategoryTone = { bg: "#f5c4b0", glow: "#fadcd0" };
const MINT: CategoryTone = { bg: "#bfe3d3", glow: "#dcf0e7" };
const LILAC: CategoryTone = { bg: "#d3cdf0", glow: "#e8e4f8" };
const LIME: CategoryTone = { bg: "#d5e6b5", glow: "#e8f2d6" };
const LEMON: CategoryTone = { bg: "#f4e2a1", glow: "#faefc9" };
const ROSE: CategoryTone = { bg: "#f3c9d1", glow: "#f9e1e6" };
const SAGE: CategoryTone = { bg: "#c9ddd5", glow: "#e1ece8" };

const BY_KEY: Record<string, CategoryTone> = {
  beach_membership: CORAL,
  apartment_cleaning: MINT,
  diving: LILAC,
  coffee: SUN,
  meal_subscription: LIME,
  car_wash: LEMON,
  healthcare: ROSE,
  massage: SAGE,
};

const ROTATION = [SUN, MINT, LILAC, CORAL, LIME, LEMON, ROSE, SAGE];

export function categoryTone(key: string): CategoryTone {
  if (BY_KEY[key]) return BY_KEY[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ROTATION[h % ROTATION.length];
}
