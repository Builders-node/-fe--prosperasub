import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The admin's in-page tab strip.
 *
 * Three screens drew this by hand — the service drill-down, the vehicles unit
 * and Users — with the same track, the same pill and, for a while, three
 * different selected colours (an amber fill, amber-on-black, an amber ring).
 * Route-based tabs are `AdminPageTabs`; this is its controlled twin, for tabs
 * that switch a `?tab=` param instead of navigating (see PAGE_TYPES §9).
 *
 * Selection INVERTS to `bg-foreground` rather than tinting: the platform's
 * one flat-selection move, theme-agnostic and needing no border or shadow.
 */
export interface TabPill<T extends string> {
  value: T;
  label: string;
  /** Shown when > 0 — a queue length, a pending count. */
  badge?: number;
}

export function TabPills<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: ReadonlyArray<TabPill<T>>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-full bg-muted/50 p-1", className)}>
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <Badge className={cn(
                "h-5 min-w-[20px] rounded-full px-1.5 text-[10px]",
                active ? "bg-background/20 text-background" : "bg-primary/15 text-primary",
              )}>
                {t.badge}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
