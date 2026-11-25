import type { PortalTab } from "@/components/provider/portalTab";
import { useTabParam } from "@/hooks/useTabParam";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

/**
 * The workspace's tabs as a rail, for a laptop.
 *
 * On a phone the tabs are a scrolling segmented strip (WorkspaceTabsCard). On
 * a wide screen that strip was a 1,250-wide card holding seven words, and it
 * sat under the banner — so every tab began a third of the way down the
 * screen. Here they are a list in the left column, in the same row style as
 * the admin's navigation.
 *
 * It is not a Radix trigger: the strip and the bodies are rendered further
 * down the tree, possibly behind a legacy access check. Both read the active
 * tab from `?tab=` through `useTabParam`, so with the same list of values they
 * agree without sharing any state.
 */
export function WorkspaceSideNav({ tabs }: { tabs: PortalTab<unknown>[] }) {
  const [active, setActive] = useTabParam(tabs.map((t) => t.value));

  return (
    <nav aria-label={tr("Business sections")} className="rounded-radius-lg bg-card p-2">
      <ul className="space-y-0.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.value === active;
          return (
            <li key={t.value}>
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActive(t.value)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-radius-md px-3 py-2 text-left text-[14px] leading-[20px] tracking-[-0.01em] transition-colors",
                  isActive
                    ? "bg-[hsl(var(--app-control-muted))] font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-[hsl(var(--app-control-muted))] hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
