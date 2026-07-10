import { useState, type ComponentType, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ServiceConfig, ProviderConfig } from "@/lib/services/registry";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

interface BaseProvider {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  myRole?: "owner" | "manager";
}

export interface PortalTab<T> {
  /** Stable tab key. */
  value: string;
  /** Full label shown on desktop. */
  label: string;
  /** Optional shorter label used on mobile — falls back to `label`. */
  mobileLabel?: string;
  icon: ComponentType<{ className?: string }>;
  /** Only owners see this tab (e.g. Staff). */
  ownerOnly?: boolean;
  /** Rendered inside <TabsContent>. */
  render: (provider: T, isOwner: boolean) => ReactNode;
}

interface Props<T extends BaseProvider> {
  service: ServiceConfig & { providers: ProviderConfig };
  providers: T[];
  isLoading: boolean;
  tabs: PortalTab<T>[];
  /** Optional avatar URL extractor (differs per service — logo_url vs avatar_url). */
  getAvatarUrl?: (p: T) => string | null | undefined;
  /** Optional full-width banner URL extractor (some services don't render one). */
  getBannerUrl?: (p: T) => string | null | undefined;
  /** Public URL to open from the "View Public" button. */
  getPublicHref: (p: T) => string;
  /** Copy for the empty state. */
  emptyTitle?: string;
  emptySubtitle?: string;
}

/**
 * Shared portal shell used by every marketplace provider's owner/manager
 * page (My Restaurant, My Car Rental, and future services). The shell owns
 * layout, provider selection, loading + empty state, header rendering, and
 * the tab strip. Each service supplies:
 *   - its typed provider list (from useMy* hook)
 *   - the tab definitions to render
 *   - a couple of URL/field mappers where the schema legitimately differs
 * The service registry supplies title/icon/labels so nothing service-specific
 * is hardcoded here.
 */
export function ProviderPortalShell<T extends BaseProvider>({
  service, providers, isLoading, tabs,
  getAvatarUrl, getBannerUrl, getPublicHref,
  emptyTitle, emptySubtitle,
}: Props<T>) {
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("providerId"));

  const selected = providers.find((p) => p.id === selectedId) ?? providers[0] ?? null;
  const isOwner = selected?.myRole === "owner";
  const labels = service.providers.labels;
  const Icon = service.icon;
  const pageTitle = `My ${labels.singular}`;

  if (isLoading) {
    return (
      <UserLayout title={pageTitle}>
        <div className="app-container space-y-4 py-6">
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        </div>
      </UserLayout>
    );
  }

  if (!selected) {
    return (
      <UserLayout title={pageTitle}>
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <Icon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">
            {emptyTitle ?? `You don't manage a ${labels.singular.toLowerCase()}`}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {emptySubtitle ?? `If you should have access to a ${labels.singular.toLowerCase()}, ask a platform administrator to add you as its owner or a manager.`}
          </p>
        </div>
      </UserLayout>
    );
  }

  const avatarUrl = getAvatarUrl?.(selected) ?? null;
  const bannerUrl = getBannerUrl?.(selected) ?? null;
  const visibleTabs = tabs.filter((t) => !t.ownerOnly || isOwner);

  return (
    <UserLayout title={pageTitle}>
      {bannerUrl && (
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-transparent md:h-56">
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="app-container space-y-6 py-6">
        {/* Business switcher — shown only when the user manages more than one. */}
        {providers.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  p.id === selected.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-card p-4 sm:gap-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:h-14 sm:w-14">
            {avatarUrl ? (
              <img src={avatarUrl} alt={selected.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Icon className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{selected.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {selected.status && (
                <Badge className={`rounded-full text-xs ${STATUS_COLORS[selected.status] ?? ""}`}>
                  {selected.status}
                </Badge>
              )}
              {selected.myRole && (
                <Badge variant="secondary" className="rounded-full text-xs capitalize">{selected.myRole}</Badge>
              )}
            </div>
            {selected.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{selected.description}</p>
            )}
          </div>
          <Button
            variant="outline" size="sm"
            className="order-last w-full shrink-0 gap-1.5 rounded-full sm:order-none sm:w-auto"
            onClick={() => window.open(getPublicHref(selected), "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" /> View Public
          </Button>
        </div>

        {/* Tabs — keyed by selected provider so switching resets inner state. */}
        <Tabs defaultValue={visibleTabs[0]?.value} key={selected.id}>
          <TabsList equalWidth className="mb-6 w-full">
            {visibleTabs.map((t) => {
              const TabIcon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} equalWidth className="gap-2 px-2 sm:px-space-4">
                  <TabIcon className="hidden h-4 w-4 sm:block" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.mobileLabel ?? t.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {visibleTabs.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              {t.render(selected, isOwner)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </UserLayout>
  );
}
