/**
 * One colour per category for the home page's banner slider.
 *
 * Every banner used to be the same orange, so the strip read as one long
 * orange block and nothing told Coffee from Cleaning at a glance. Each
 * category now has its own deep tone: the banner's background, with white
 * words on it, and a faint lighter halo behind the drawing (see
 * categoryBannerArt). Fixed colours, the same in both themes, like the
 * drawings they carry.
 *
 * A category not listed here gets a tone from the rotation by its key, so a
 * new one added in the admin is still coloured without a code change, and
 * always the same colour.
 */
export interface CategoryTone {
  /** Banner background. Deep enough for white text. */
  bg: string;
  /** The halo behind the drawing. */
  glow: string;
}

const HALO = "rgba(255,255,255,0.16)";

const EMBER: CategoryTone = { bg: "#c4621d", glow: HALO };
const TEAL: CategoryTone = { bg: "#1d7f69", glow: HALO };
const CORAL: CategoryTone = { bg: "#d4583a", glow: HALO };
const INDIGO: CategoryTone = { bg: "#5a49d6", glow: HALO };
const FERN: CategoryTone = { bg: "#4b7f2a", glow: HALO };
const COBALT: CategoryTone = { bg: "#2c66c9", glow: HALO };
const BERRY: CategoryTone = { bg: "#c13a63", glow: HALO };
const PINE: CategoryTone = { bg: "#2f6f66", glow: HALO };

const BY_KEY: Record<string, CategoryTone> = {
  beach_membership: CORAL,
  apartment_cleaning: TEAL,
  diving: INDIGO,
  coffee: EMBER,
  meal_subscription: FERN,
  car_wash: COBALT,
  healthcare: BERRY,
  massage: PINE,
};

const ROTATION = [EMBER, TEAL, INDIGO, CORAL, FERN, COBALT, BERRY, PINE];

export function categoryTone(key: string): CategoryTone {
  if (BY_KEY[key]) return BY_KEY[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ROTATION[h % ROTATION.length];
}
