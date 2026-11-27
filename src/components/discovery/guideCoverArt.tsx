import type { LucideIcon } from "lucide-react";
import {
  Anchor, Bitcoin, CalendarCheck, Car, ChefHat, Compass, Fish, Fuel, House, KeyRound, MapPin, Receipt, Salad,
  Shell, ShieldCheck, Sparkles, SprayCan, TreePalm, UtensilsCrossed, Wallet, BookOpen, Waves,
} from "lucide-react";

/**
 * The cover of a guide card on the home page: a drawing, never a photo, in
 * the same flat style as the category banners (categoryBannerArt) — sky, sun,
 * the sea along the bottom, and the guide's subject on a paper sticker with
 * two small bubbles around it.
 *
 * The colours are fixed on purpose, like the banners: a cover is a picture,
 * and a picture does not change with the theme. Every guide has its own sky so
 * a row of covers reads as different stories at a glance.
 */

const PAPER = "#fff8ec";
const FOAM = "rgba(255,255,255,0.55)";

interface Scene {
  sky: string;
  sun: string;
  sea: string;
  ink: string;
  main: LucideIcon;
  left: LucideIcon;
  right: LucideIcon;
  /** Air bubbles rising out of the water — the diving guide. */
  bubbles?: boolean;
}

const SCENES: Record<string, Scene> = {
  "things-to-do-in-roatan":  { sky: "#ffb38a", sun: "#fff0c2", sea: "#1f9fb5", ink: "#9a3b12", main: Compass, left: Shell, right: TreePalm },
  "moving-to-roatan":       { sky: "#9fd8f2", sun: "#ffd66b", sea: "#2f8fd8", ink: "#0f5f6e", main: TreePalm, left: House, right: Car },
  "getting-around-roatan":  { sky: "#ffcf73", sun: "#fff1c7", sea: "#3b9ae1", ink: "#b2580c", main: Car, left: MapPin, right: Fuel },
  "renting-a-car-in-roatan": { sky: "#d6c8ff", sun: "#fff6d6", sea: "#4f7fe0", ink: "#4b2ea8", main: KeyRound, left: ShieldCheck, right: Car },
  "house-cleaning-roatan":  { sky: "#c9dcff", sun: "#ffffff", sea: "#5b8def", ink: "#3348b8", main: SprayCan, left: Sparkles, right: CalendarCheck },
  "meal-plans-roatan":      { sky: "#ffc2a8", sun: "#ffe5b0", sea: "#f07a52", ink: "#b8361c", main: UtensilsCrossed, left: ChefHat, right: Salad },
  "learn-to-dive-roatan":   { sky: "#7cc6ef", sun: "#e6f6ff", sea: "#1b5fae", ink: "#14508f", main: Fish, left: Anchor, right: Waves, bubbles: true },
  "cost-of-services-roatan": { sky: "#bfe8cf", sun: "#fff4c4", sea: "#2f9e6b", ink: "#1d6e48", main: Wallet, left: Bitcoin, right: Receipt },
};

const FALLBACK: Scene = { sky: "#ffd38a", sun: "#fff1c7", sea: "#3b9ae1", ink: "#8a4a0a", main: BookOpen, left: Sparkles, right: MapPin };

function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  const k = r * 0.22;
  return (
    <path
      fill={PAPER}
      d={`M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`}
    />
  );
}

/** A lucide icon placed inside the drawing, centred on (cx, cy). */
function Glyph({ Icon, cx, cy, size, color }: { Icon: LucideIcon; cx: number; cy: number; size: number; color: string }) {
  return <Icon x={cx - size / 2} y={cy - size / 2} width={size} height={size} color={color} strokeWidth={1.75} />;
}

export function GuideCoverArt({ slug, className }: { slug: string; className?: string }) {
  const s = SCENES[slug] ?? FALLBACK;
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="400" height="240" fill={s.sky} />
      {/* The sun, and its glow */}
      <circle cx="330" cy="58" r="66" fill={PAPER} opacity="0.3" />
      <circle cx="330" cy="58" r="40" fill={s.sun} />
      {/* The sea along the bottom, two bands of it */}
      <path d="M0 176c40-14 80-14 120 0s80 14 120 0 80-14 120 0 40 7 40 7V240H0Z" fill={PAPER} opacity="0.45" />
      <path d="M0 196c40-12 80-12 120 0s80 12 120 0 80-12 120 0 40 6 40 6V240H0Z" fill={s.sea} />
      <path d="M24 214c14-5 28-5 42 0M150 222c14-5 28-5 42 0M286 214c14-5 28-5 42 0" stroke={FOAM} strokeWidth="4" strokeLinecap="round" fill="none" />

      {s.bubbles && (
        <g fill="none" stroke={PAPER} strokeWidth="3" opacity="0.9">
          <circle cx="92" cy="150" r="7" />
          <circle cx="78" cy="118" r="5" />
          <circle cx="98" cy="92" r="9" />
          <circle cx="82" cy="60" r="4" />
        </g>
      )}

      {/* The subject on a paper sticker, a shade under it */}
      <circle cx="200" cy="114" r="66" fill={s.ink} opacity="0.22" transform="translate(6 8)" />
      <circle cx="200" cy="114" r="66" fill={PAPER} />
      <circle cx="200" cy="114" r="52" fill={s.sky} opacity="0.45" />
      <Glyph Icon={s.main} cx={200} cy={114} size={64} color={s.ink} />

      {/* Two small bubbles around it */}
      <circle cx="108" cy="78" r="26" fill={PAPER} />
      <Glyph Icon={s.left} cx={108} cy={78} size={26} color={s.ink} />
      <circle cx="292" cy="160" r="24" fill={PAPER} />
      <Glyph Icon={s.right} cx={292} cy={160} size={24} color={s.ink} />

      <Sparkle x={288} y={96} r={9} />
      <Sparkle x={150} y={170} r={6} />
      <Sparkle x={52} y={40} r={7} />
    </svg>
  );
}
