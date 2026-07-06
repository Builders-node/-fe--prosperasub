import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";

/**
 * The tab strip + content, split out of ProviderPortalShell so the same rich
 * per-service tabs can render inside the universal provider portal
 * (`/my-provider/:id`) as well as the legacy portal shells. Owner-only tabs are
 * hidden for non-owners.
 */
export function PortalTabsView<T>({ tabs, provider, isOwner }: {
  tabs: PortalTab<T>[]; provider: T; isOwner: boolean;
}) {
  const visible = tabs.filter((t) => !t.ownerOnly || isOwner);
  return (
    <Tabs defaultValue={visible[0]?.value}>
      <TabsList equalWidth className="mb-6 w-full">
        {visible.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.value} value={t.value} equalWidth className="gap-2 px-2 sm:px-space-4">
              <Icon className="hidden h-4 w-4 sm:block" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.mobileLabel ?? t.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {visible.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.render(provider, isOwner)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
