import { tr } from "@/lib/tr";
// Available subscription durations (in weeks) offered for food meal plans.
export const DURATION_OPTIONS = [
  { weeks: 1, label: tr("1 Week") },
  { weeks: 2, label: tr("2 Weeks") },
  { weeks: 3, label: tr("3 Weeks") },
  { weeks: 4, label: tr("1 Month") },
] as const;

export function durationLabel(weeks: number): string {
  return DURATION_OPTIONS.find((d) => d.weeks === weeks)?.label ?? tr("{weeks} Weeks", { weeks });
}
