import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The drawn half of the home page's category banners, keyed by
 * service_categories.key. Flat shapes on a tinted promo card, right-aligned
 * and clear of the words on the left. The fixed colours are the point: each
 * card keeps its tone in both themes (see categoryTones), so a theme token
 * would only drift from it. The halo behind each drawing is currentColor —
 * the card's own lighter shade — so the drawing sits on its card, not on a
 * patch of orange.
 *
 * These cards are ALWAYS drawn, never photographed. A photo on one card next to
 * drawings on the others is exactly what must not happen, so there is no photo
 * path at all: a category with no drawing of its own here gets the generic
 * drawing below (the service's icon on the same glow, bubbles and sparkles),
 * so adding a category in the admin still needs no code and still looks drawn.
 */

const INK = "#2a2118";
const PAPER = "#fff8ec";
const GLOW = "#ffc766";
const TOMATO = "#e5482d";
const LEAF = "#2f9e5b";
const WATER = "#3b9ae1";
const FOAM = "#d9eefb";
const BEAN = "#6b3a1e";
const CREMA = "#a8652e";
const STONE = "#4a3f36";
const STONE_LIGHT = "#6d5f52";

function Sparkle({ x, y, r, fill = PAPER }: { x: number; y: number; r: number; fill?: string }) {
  const k = r * 0.22;
  return (
    <path
      fill={fill}
      d={`M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`}
    />
  );
}

function Meal() {
  return (
    <>
      <circle cx="124" cy="70" r="64" fill="currentColor" />
      <circle cx="124" cy="70" r="58" fill={PAPER} />
      <circle cx="124" cy="70" r="44" fill="#f3e4c8" />
      <path d="M92 74c-4-18 10-32 26-30 4 14-8 32-26 30Z" fill={LEAF} />
      <path d="M100 96c-6-14 4-26 18-26 4 12-4 26-18 26Z" fill="#3fb56f" />
      <circle cx="146" cy="56" r="13" fill={TOMATO} />
      <circle cx="146" cy="56" r="7" fill="#f2735b" />
      <circle cx="128" cy="42" r="8" fill={TOMATO} />
      <ellipse cx="136" cy="86" rx="20" ry="16" fill={PAPER} />
      <circle cx="136" cy="86" r="8" fill="#f7a21b" />
      <g fill={INK}>
        <rect x="42" y="50" width="5" height="62" rx="2.5" />
        <path d="M34 22h3v18h4V22h3v18h4V22h3v22c0 5-4 8-8.5 8S34 49 34 44Z" transform="translate(0 2)" />
      </g>
    </>
  );
}

function Cleaning() {
  return (
    <>
      <circle cx="122" cy="82" r="50" fill="currentColor" />
      <path d="M100 58h44l10 18v50a8 8 0 0 1-8 8h-48a8 8 0 0 1-8-8V76Z" fill={PAPER} />
      <rect x="90" y="88" width="64" height="26" fill={WATER} />
      <rect x="108" y="40" width="28" height="18" fill={INK} />
      <path d="M72 18h62a6 6 0 0 1 6 6v16H98L84 54l-8-6 8-16H72Z" fill={INK} />
      <g fill={PAPER}>
        <circle cx="58" cy="24" r="4" />
        <circle cx="44" cy="14" r="3" />
        <circle cx="42" cy="34" r="3.5" />
        <circle cx="26" cy="24" r="2.5" />
      </g>
      <Sparkle x={50} y={76} r={16} />
      <Sparkle x={166} y={32} r={10} />
      <Sparkle x={66} y={110} r={8} />
    </>
  );
}

function CarWash() {
  return (
    <>
      <g fill={WATER}>
        <path d="M60 8c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15Z" />
        <path d="M108 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13Z" />
        <path d="M152 12c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15Z" />
      </g>
      <path d="M30 96c0-12 8-20 20-22l18-26c3-4 7-6 12-6h46c5 0 9 2 12 5l22 27h4c9 0 16 7 16 16v18H30Z" fill={INK} />
      <path d="M75 52h20v22H60Z" fill={FOAM} />
      <path d="M103 52h22c2 0 4 1 5 2l16 20h-43Z" fill={FOAM} />
      <circle cx="66" cy="108" r="17" fill={INK} />
      <circle cx="66" cy="108" r="8" fill={PAPER} />
      <circle cx="146" cy="108" r="17" fill={INK} />
      <circle cx="146" cy="108" r="8" fill={PAPER} />
      <g fill={PAPER}>
        <circle cx="34" cy="74" r="13" />
        <circle cx="16" cy="88" r="9" />
        <circle cx="40" cy="96" r="10" />
        <circle cx="106" cy="42" r="9" />
        <circle cx="120" cy="36" r="6" />
        <circle cx="172" cy="84" r="8" />
      </g>
      <Sparkle x={80} y={22} r={8} />
    </>
  );
}

function Membership() {
  return (
    <>
      <circle cx="64" cy="44" r="26" fill={PAPER} />
      <path d="M126 128c-4-34-2-60 10-86l7 2c-11 25-13 52-9 84Z" fill={INK} />
      <g fill={LEAF}>
        <path d="M139 44c-12-16-30-18-44-8 16-2 30 2 44 8Z" />
        <path d="M139 44c-16-4-30 2-38 18 12-10 24-16 38-18Z" />
        <path d="M139 44c8-18 26-24 40-16-16 0-28 6-40 16Z" />
        <path d="M139 44c16-6 32 0 40 16-12-10-26-16-40-16Z" />
        <path d="M139 44c-2-14 6-28 20-34-6 12-12 22-20 34Z" />
      </g>
      {/* Rises from the bottom edge rather than spanning the art: the longest
          price line on a phone runs as far as x = 60. */}
      <path d="M60 140c4-18 20-30 40-22s26 8 40 0 26-8 40 0v22Z" fill={WATER} />
      <path d="M80 140c6-10 14-14 25-10s24 8 37 0 26-8 38 0v10Z" fill={FOAM} />
    </>
  );
}

function Healthcare() {
  return (
    <>
      <circle cx="122" cy="70" r="58" fill="currentColor" />
      <path d="M122 124c-32-22-54-42-54-68 0-16 12-28 27-28 11 0 21 6 27 16 6-10 16-16 27-16 15 0 27 12 27 28 0 26-22 46-54 68Z" fill={TOMATO} />
      <path d="M78 74h22l8-18 13 34 11-24 6 8h22" fill="none" stroke={PAPER} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="42" r="18" fill={PAPER} />
      <path d="M38 32h8v6h6v8h-6v6h-8v-6h-6v-8h6Z" fill={TOMATO} />
      <Sparkle x={166} y={22} r={9} />
    </>
  );
}

function Diving() {
  return (
    <>
      <circle cx="118" cy="72" r="56" fill="currentColor" />
      {/* Snorkel: rises behind the mask on the right, mouthpiece tucked under. */}
      <path d="M160 18h10v74c0 14-10 24-24 24h-10v-10h10c8 0 14-6 14-14Z" fill={INK} />
      <rect x="157" y="12" width="16" height="10" rx="3" fill={TOMATO} />
      {/* Strap, then the frame and its two lenses. */}
      <rect x="58" y="62" width="120" height="10" rx="5" fill={INK} />
      <path d="M78 50h80c8 0 12 6 12 12v18c0 10-8 18-18 18h-14c-6 0-10-4-12-10l-4-8-4 8c-2 6-6 10-12 10H84c-10 0-18-8-18-18V62c0-6 4-12 12-12Z" fill={INK} />
      <path d="M84 58h28c4 0 6 2 6 6v6l-4 10c-2 5-5 8-10 8h-16c-6 0-10-4-10-10V64c0-4 2-6 6-6Z" fill={WATER} />
      <path d="M152 58h-28c-4 0-6 2-6 6v6l4 10c2 5 5 8 10 8h16c6 0 10-4 10-10V64c0-4-2-6-6-6Z" fill={WATER} />
      <g fill={FOAM}>
        <path d="M86 62h10l-12 14v-10c0-2 1-4 2-4Z" />
        <path d="M126 62h10l-12 14v-10c0-2 1-4 2-4Z" />
      </g>
      {/* Bubbles rising off the left — clear of the title on a phone. */}
      <g fill={PAPER}>
        <circle cx="62" cy="40" r="9" />
        <circle cx="46" cy="22" r="6" />
        <circle cx="70" cy="14" r="4" />
        <circle cx="96" cy="24" r="5" />
      </g>
      {/* A small fish under the mask. */}
      <path d="M92 120c8-10 22-10 30 0-8 10-22 10-30 0Z" fill={TOMATO} />
      <path d="M122 120l12-8v16Z" fill={TOMATO} />
      <circle cx="100" cy="118" r="2.5" fill={INK} />
    </>
  );
}

function Coffee() {
  return (
    <>
      <circle cx="118" cy="74" r="56" fill="currentColor" />
      {/* Steam, three soft curls rising off the cup. */}
      <g fill="none" stroke={PAPER} strokeWidth="5" strokeLinecap="round">
        <path d="M100 44c-8-8 8-14 0-24" />
        <path d="M118 40c-8-8 8-14 0-26" />
        <path d="M136 44c-8-8 8-14 0-24" />
      </g>
      {/* Saucer under the cup. */}
      <ellipse cx="118" cy="124" rx="50" ry="9" fill={INK} />
      <ellipse cx="118" cy="121" rx="38" ry="5" fill={STONE_LIGHT} />
      {/* Handle, then the cup over it. */}
      <circle cx="152" cy="84" r="14" fill="none" stroke={PAPER} strokeWidth="8" />
      <path d="M84 58h68v34c0 16-14 28-30 28h-8c-16 0-30-12-30-28Z" fill={PAPER} />
      <rect x="84" y="72" width="68" height="10" fill={TOMATO} />
      <ellipse cx="118" cy="58" rx="34" ry="7" fill={BEAN} />
      <ellipse cx="118" cy="58" rx="26" ry="4" fill={CREMA} />
      {/* Two beans to the left, clear of the title on a phone. */}
      <g transform="rotate(-30 58 108)">
        <ellipse cx="58" cy="108" rx="10" ry="14" fill={BEAN} />
        <path d="M58 95c-5 8 5 18 0 26" fill="none" stroke={CREMA} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g transform="rotate(20 70 128)">
        <ellipse cx="70" cy="128" rx="8" ry="11" fill={BEAN} />
        <path d="M70 118c-4 6 4 14 0 20" fill="none" stroke={CREMA} strokeWidth="2" strokeLinecap="round" />
      </g>
      <Sparkle x={166} y={28} r={9} />
      <Sparkle x={70} y={30} r={7} />
    </>
  );
}

function Massage() {
  return (
    <>
      <circle cx="120" cy="70" r="56" fill="currentColor" />
      {/* A stack of warm stones, the classic spa still life. */}
      <ellipse cx="120" cy="120" rx="50" ry="14" fill={STONE} />
      <ellipse cx="120" cy="116" rx="46" ry="10" fill={STONE_LIGHT} />
      <ellipse cx="118" cy="96" rx="36" ry="12" fill={STONE} />
      <ellipse cx="118" cy="92" rx="32" ry="8" fill={STONE_LIGHT} />
      <ellipse cx="122" cy="74" rx="26" ry="10" fill={STONE} />
      <ellipse cx="122" cy="71" rx="22" ry="6" fill={STONE_LIGHT} />
      {/* A leaf sprig resting on top. */}
      <path d="M122 64c-2-18 10-30 28-32-2 18-12 30-28 32Z" fill={LEAF} />
      <path d="M122 64c-14-6-20-18-16-30 12 6 18 16 16 30Z" fill="#3fb56f" />
      <path d="M122 64c6-10 14-18 24-24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {/* A drop of oil and a candle glow, left of the stack. */}
      <path d="M64 70c6 9 10 14 10 19a10 10 0 0 1-20 0c0-5 4-10 10-19Z" fill={PAPER} />
      <rect x="160" y="96" width="14" height="28" rx="3" fill={PAPER} />
      <path d="M167 80c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z" fill={TOMATO} />
      <Sparkle x={58} y={30} r={8} />
      <Sparkle x={166} y={30} r={10} />
    </>
  );
}

/**
 * Any category without its own drawing: the service's icon, inked on a paper
 * disc inside the same glow every drawn card has, with the bubbles and
 * sparkles that make it read as one of the set rather than a placeholder.
 */
function Fallback({ Icon }: { Icon?: LucideIcon }) {
  return (
    <>
      <circle cx="120" cy="72" r="56" fill="currentColor" />
      <circle cx="120" cy="72" r="36" fill={PAPER} />
      {Icon && <Icon x={96} y={48} width={48} height={48} color={INK} strokeWidth={2} />}
      <g fill={PAPER}>
        <circle cx="62" cy="40" r="8" />
        <circle cx="48" cy="22" r="5" />
        <circle cx="70" cy="16" r="3.5" />
        <circle cx="168" cy="112" r="6" />
      </g>
      <Sparkle x={166} y={28} r={10} />
      <Sparkle x={70} y={112} r={8} />
    </>
  );
}

const ART: Record<string, ComponentType> = {
  diving: Diving,
  meal_subscription: Meal,
  apartment_cleaning: Cleaning,
  car_wash: CarWash,
  beach_membership: Membership,
  healthcare: Healthcare,
  coffee: Coffee,
  massage: Massage,
};

/** True when the category has its own drawing (false still draws the fallback). */
export function hasCategoryBannerArt(key: string): boolean {
  return key in ART;
}

/** Always renders a drawing: the category's own, or the illustrated fallback. */
export function CategoryBannerArt({ categoryKey, icon, className, glow = GLOW }: {
  categoryKey: string;
  /** The service's icon, drawn by the fallback when the category has no art. */
  icon?: LucideIcon;
  className?: string;
  /** The halo behind the drawing — a lighter shade of the card it sits on. */
  glow?: string;
}) {
  const Art = ART[categoryKey];
  // The halo is drawn in currentColor, so each card's tone sets it.
  return (
    <svg viewBox="0 0 180 140" aria-hidden className={className} style={{ color: glow }} preserveAspectRatio="xMaxYMid meet">
      {Art ? <Art /> : <Fallback Icon={icon} />}
    </svg>
  );
}
