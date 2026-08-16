import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkspaceTabsCard } from "@/components/provider/WorkspaceTabsCard";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";

/**
 * The tab strip + bodies of a legacy-backed provider workspace. The strip
 * itself is the shared card so the universal portal and this one are the same
 * control; only the tab list differs.
 */
export function PortalTabsView<T>({ tabs, provider, isOwner }: {
  tabs: PortalTab<T>[]; provider: T; isOwner: boolean;
}) {
  const visible = tabs.filter((t) => !t.ownerOnly || isOwner);
  return (
    <Tabs defaultValue={visible[0]?.value} className="space-y-1">
      <WorkspaceTabsCard tabs={visible.map((t) => ({ value: t.value, label: t.label }))} />
      {visible.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-1">
          {t.render(provider, isOwner)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
