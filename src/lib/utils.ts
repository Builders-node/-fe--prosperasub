import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design system uses custom spacing (`space-*`) and radius (`radius-*`)
// scales (see tailwind.config). The stock tailwind-merge doesn't know these
// values, so it fails to dedupe e.g. `p-space-4` against a default `pt-0`,
// leaving both classes and silently collapsing top padding to 0. Register the
// custom scales so class overrides merge correctly.
const SPACE = ["space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-8"];
const RADIUS = ["radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-full"];

const twMerge = extendTailwindMerge({
  extend: {
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
