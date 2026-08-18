import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkspaceTabsCard } from "@/components/provider/WorkspaceTabsCard";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { useTabParam } from "@/hooks/useTabParam";

/**
 * The tab strip + bodies of a provider workspace.
 *
 * The tab lives in `?tab=` rather than in component state, so a reload — or a
 * Back, or a link somebody pastes to a colleague — lands on the tab you were
 * on. It used to be `defaultValue`, which meant every refresh dropped you back
 * on Overview: a provider halfway through the day's list lost their place
 * whenever the page reloaded.
 *
 * The conventions live in `useTabParam`, shared with every other tabbed
 * screen so they cannot drift apart.
 */
export function PortalTabsView<T>({ tabs, provider, isOwner }: {
  tabs: PortalTab<T>[]; provider: T; isOwner: boolean;
}) {
  const visible = tabs.filter((t) => !t.ownerOnly || isOwner);
  const [active, setActive] = useTabParam(visible.map((t) => t.value));

  return (
    <Tabs value={active} onValueChange={setActive} className="space-y-1">
      <WorkspaceTabsCard tabs={visible.map((t) => ({ value: t.value, label: t.label }))} />
      {visible.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-1">
          {t.render(provider, isOwner)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
