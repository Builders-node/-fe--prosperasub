import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design system uses custom spacing (`space-*`) and radius (`radius-*`)
// scales (see tailwind.config). The stock tailwind-merge doesn't know these
// values, so it fails to dedupe e.g. `p-space-4` against a default `pt-0`,
// leaving both classes and silently collapsing top padding to 0. Register the
// custom scales so class overrides merge correctly.
const SPACE = ["space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-8"];
const RADIUS = ["radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-full"];

/**
 * The semantic type ramp (see tailwind.config `fontSize`). These are font
 * sizes, but tailwind-merge cannot tell `text-control` from a colour, so it
 * kept BOTH `text-control` and a later `text-[16px]` — and which one won was
 * then decided by the order Tailwind happened to emit them, not by the
 * component doing the overriding. Naming them makes a size override actually
 * override, the same reason the spacing and radius scales are listed above.
 */
const FONT_SIZE = [
  "caption", "label", "control", "body", "body-lg",
  "card-title", "panel-title", "section-title", "page-title",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZE }],
    },
    theme: {
      spacing: SPACE,
      padding: SPACE,
      margin: SPACE,
      gap: SPACE,
      space: SPACE,
      inset: SPACE,
      translate: SPACE,
      borderSpacing: SPACE,
      borderRadius: RADIUS,
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
