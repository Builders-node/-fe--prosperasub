import { X } from "lucide-react";
import { tagIcon, useTagDictionary } from "@/lib/tags";
import { cn } from "@/lib/utils";

/**
 * Tags for a plan, picked from the dictionary (Admin → Settings → Tags) — one
 * row of chips per group, tap to switch.
 *
 * A word on the plan that is NOT in the dictionary (left from the free-text
 * days) is shown under "Other" so it can be removed, and is kept if it isn't:
 * search still finds it, it just isn't a filter.
 */
export function TagPicker({ value, onChange, groups: only }: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Limit to these groups (food: the diets its own table accepts). */
  groups?: string[];
}) {
  const dict = useTagDictionary();
  const groups = only ? dict.groups.filter((g) => only.includes(g.key)) : dict.groups;
  const chosen = new Set(value);
  const known = new Set(dict.groups.flatMap((g) => g.tags.map((t) => t.key)));
  const other = value.filter((k) => !known.has(k));
  const toggle = (key: string) => onChange(chosen.has(key) ? value.filter((k) => k !== key) : [...value, key]);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key} className="space-y-1.5">
          <p className="text-meta font-semibold text-muted-foreground">{g.label}</p>
          <div className="flex flex-wrap gap-2">
            {g.tags.map((t) => {
              const on = chosen.has(t.key);
              const Icon = tagIcon(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t.key)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70",
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {other.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-meta font-semibold text-muted-foreground">Other (search only)</p>
          <div className="flex flex-wrap gap-2">
            {other.map((k) => (
              <span key={k} className="inline-flex h-9 items-center gap-1 rounded-full bg-muted pl-3 pr-1 text-[14px] text-foreground">
                {k}
                <button type="button" aria-label={`Remove ${k}`} onClick={() => toggle(k)}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-background">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
