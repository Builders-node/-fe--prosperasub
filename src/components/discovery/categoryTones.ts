/**
 * One colour per category on the home page's banner cards.
 *
 * Every card used to be the same orange, so four of them in a row read as one
 * long orange strip and nothing told Coffee from Cleaning at a glance. Each
 * category now has its own tone: the card colour, a lighter halo for the
 * drawing behind it (see categoryBannerArt), and dark ink for the words. Fixed
 * colours, the same in both themes, like the drawings they carry.
 *
 * A category not listed here gets a tone from the rotation by its key, so a
 * new one added in the admin is still coloured without a code change, and
 * always the same colour.
 */
export interface CategoryTone {
  /** Card background. */
  bg: string;
  /** The halo behind the drawing: a lighter shade of bg. */
  glow: string;
}

export const CATEGORY_INK = "#1f1a14";

const SUN: CategoryTone = { bg: "#f5ad42", glow: "#ffcf7a" };
const CORAL: CategoryTone = { bg: "#ff9a7a", glow: "#ffc2ad" };
const MINT: CategoryTone = { bg: "#7fd6b4", glow: "#b4ebd5" };
const LILAC: CategoryTone = { bg: "#b9a8ff", glow: "#dbd1ff" };
const LIME: CategoryTone = { bg: "#b5dd74", glow: "#d6f0a8" };
const LEMON: CategoryTone = { bg: "#ffd65c", glow: "#ffe89e" };
const ROSE: CategoryTone = { bg: "#ffaec0", glow: "#ffd3dd" };
const SAGE: CategoryTone = { bg: "#a8d3c4", glow: "#cfe8df" };

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
