// Available subscription durations (in weeks) offered for food meal plans.
export const DURATION_OPTIONS = [
  { weeks: 1, label: "1 Week" },
  { weeks: 2, label: "2 Weeks" },
  { weeks: 3, label: "3 Weeks" },
  { weeks: 4, label: "1 Month" },
] as const;

export function durationLabel(weeks: number): string {
  return DURATION_OPTIONS.find((d) => d.weeks === weeks)?.label ?? `${weeks} Weeks`;
}
