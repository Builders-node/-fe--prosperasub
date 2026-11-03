import type { ComponentType } from "react";

/**
 * The drawn half of the home page's category banners, keyed by
 * service_categories.key. Flat shapes on the orange promo card, right-aligned
 * and clear of the words on the left. The fixed colours are the point: the card
 * is the same orange in both themes, so a theme token would only drift from it.
 *
 * A category with no drawing here keeps the service's icon, so adding one in
 * the admin needs no code — this file only makes it look better.
 */

const INK = "#2a2118";
const PAPER = "#fff8ec";
const SHADE = "#d9860b";
const GLOW = "#ffc766";
const TOMATO = "#e5482d";
const LEAF = "#2f9e5b";
const WATER = "#3b9ae1";
const FOAM = "#d9eefb";

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
      <circle cx="124" cy="70" r="64" fill={SHADE} />
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
      <circle cx="122" cy="82" r="50" fill={GLOW} />
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
      <circle cx="122" cy="70" r="58" fill={GLOW} />
      <path d="M122 124c-32-22-54-42-54-68 0-16 12-28 27-28 11 0 21 6 27 16 6-10 16-16 27-16 15 0 27 12 27 28 0 26-22 46-54 68Z" fill={TOMATO} />
      <path d="M78 74h22l8-18 13 34 11-24 6 8h22" fill="none" stroke={PAPER} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="42" r="18" fill={PAPER} />
      <path d="M38 32h8v6h6v8h-6v6h-8v-6h-6v-8h6Z" fill={TOMATO} />
      <Sparkle x={166} y={22} r={9} />
    </>
  );
}

const ART: Record<string, ComponentType> = {
  meal_subscription: Meal,
  apartment_cleaning: Cleaning,
  car_wash: CarWash,
  beach_membership: Membership,
  healthcare: Healthcare,
};

export function hasCategoryBannerArt(key: string): boolean {
  return key in ART;
}

export function CategoryBannerArt({ categoryKey, className }: { categoryKey: string; className?: string }) {
  const Art = ART[categoryKey];
  if (!Art) return null;
  return (
    <svg viewBox="0 0 180 140" aria-hidden className={className} preserveAspectRatio="xMaxYMid meet">
      <Art />
    </svg>
  );
}
