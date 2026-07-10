import { useState } from "react";
import { cn } from "@/lib/utils";

interface Item {
  key: string;
  label: string;
  render: () => React.ReactNode;
}

interface Props {
  items: Item[];
  defaultKey?: string;
  className?: string;
}

/**
 * Small pill-tab strip used *inside* a provider workspace tab to combine
 * multiple related surfaces (e.g. Cars Add-ons = Insurance / Extras /
 * Delivery). Keeps the outer tab-bar short while letting related editors
 * live under one grouping.
 */
export function InnerPillTabs({ items, defaultKey, className }: Props) {
  const [active, setActive] = useState<string>(defaultKey ?? items[0]?.key ?? "");
  const current = items.find((i) => i.key === active) ?? items[0];
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => {
          const on = i.key === active;
          return (
            <button
              key={i.key}
              type="button"
              onClick={() => setActive(i.key)}
              aria-pressed={on}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors",
                on
                  ? "bg-foreground text-background"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {i.label}
            </button>
          );
        })}
      </div>
      <div>{current?.render()}</div>
    </div>
  );
}
