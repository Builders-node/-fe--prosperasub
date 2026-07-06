import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, CalendarDays, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceCategories } from "@/hooks/useServiceCategories";
import {
  ALL_CAPABILITIES, CAPABILITIES, ComingSoonTab, INFO_TAB_META,
  type CapabilityKey, type CapabilityMeta,
} from "@/components/provider/capabilities";
import { UniversalInfoTab, type UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { UniversalPlansTab } from "@/components/provider/UniversalPlansTab";
import { ProviderBookingsTab } from "@/components/provider/ProviderBookingsTab";
import { BookingSettingsForm } from "@/components/provider/BookingSettingsForm";
import { LegacyOwnerPortal } from "@/components/provider/legacyPortalTabs";
import type { PortalTab } from "@/components/provider/ProviderPortalShell";
import { isLegacySource, legacyIdOf } from "@/lib/services/providerBridge";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

/**
 * The single provider management view — banner + header + tab dispatch. Layout-
 * agnostic on purpose: the user portal wraps it in UserLayout, the admin detail
 * page wraps it in SuperAdminLayout. For legacy-backed providers it mounts the
 * rich per-service tabs (admins get them too via the admin fallback in
 * legacyPortalTabs); otherwise it shows the universal capability tabs. Every
 * provider gets a Booking setup tab.
 */
export function ProviderWorkspace({ providerId, publicHref = "/discovery", backHref = "/my-business" }: {
  providerId: string; publicHref?: string; backHref?: string;
}) {
  const navigate = useNavigate();
  const { categories } = useServiceCategories(false);

  const { data: provider, isLoading } = useQuery({
    queryKey: ["universal-provider", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("*").eq("id", providerId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as UniversalProviderRow | null;
    },
  });

  const capabilityTabs = useMemo(() => {
    if (!provider?.capabilities) return [];
    return ALL_CAPABILITIES
      .filter((c) => provider.capabilities!.includes(c.key))
      .filter((c) => c.key !== "hourly_bookings" && c.key !== "date_range_booking")
      .map((c) => ({ key: c.key as CapabilityKey, meta: c }));
  }, [provider]);

  const showBookings = useMemo(() => {
    if (!provider) return false;
    const caps = provider.capabilities ?? [];
    if (caps.includes("hourly_bookings") || caps.includes("date_range_booking")) return true;
    return ["cleaning", "cars", "beach"].includes(provider.source_service_key ?? "");
  }, [provider]);

  if (isLoading) {
    return (
      <div className="app-container space-y-4 py-6">
        <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-semibold text-foreground">Provider not found</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been removed, or you don't have access.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(backHref)}>Back</Button>
      </div>
    );
  }

  const category = categories.find((c) => c.key === provider.category_key);
  const sourceKey = provider.source_service_key ?? "";
  const legacyId = legacyIdOf(provider);
  const isLegacyPortal = isLegacySource(sourceKey);

  const bookingSetupTab: PortalTab<unknown> = {
    value: "booking-settings",
    label: "Booking setup",
    mobileLabel: "Setup",
    icon: SlidersHorizontal,
    render: () => <BookingSettingsForm provider={provider} />,
  };

  const capabilityPortal = (
    <CapabilityPortal provider={provider} capabilityTabs={capabilityTabs} showBookings={showBookings} />
  );

  return (
    <>
      {provider.banner_url && (
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-transparent md:h-56">
          <img src={provider.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="app-container space-y-6 py-6">
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-card p-4 sm:gap-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:h-14 sm:w-14">
            {provider.avatar_url ? (
              <img src={provider.avatar_url} alt={provider.name} className="h-full w-full object-cover" />
            ) : category ? (
              <div className="flex h-full items-center justify-center"><category.Icon className="h-6 w-6 text-muted-foreground/40" /></div>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{provider.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {provider.status && (
                <Badge className={`rounded-full text-xs ${STATUS_COLORS[provider.status] ?? ""}`}>{provider.status}</Badge>
              )}
              {category && (
                <Badge variant="secondary" className="rounded-full text-xs capitalize">{category.label}</Badge>
              )}
              {provider.capabilities?.map((cap) => {
                const meta = CAPABILITIES[cap as CapabilityKey];
                if (!meta) return null;
                return <Badge key={cap} variant="outline" className="rounded-full text-[10px]">{meta.label}</Badge>;
              })}
            </div>
            {provider.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{provider.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="order-last w-full shrink-0 gap-1.5 rounded-full sm:order-none sm:w-auto"
            onClick={() => window.open(publicHref, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5" /> View Public
          </Button>
        </div>

        {isLegacyPortal
          ? <LegacyOwnerPortal sourceKey={sourceKey} legacyId={legacyId} fallback={capabilityPortal} extraTabs={[bookingSetupTab]} />
          : capabilityPortal}
      </div>
    </>
  );
}

/** The universal capability-driven tab set (Info + per-capability + Bookings + Booking setup). */
function CapabilityPortal({ provider, capabilityTabs, showBookings }: {
  provider: UniversalProviderRow;
  capabilityTabs: { key: CapabilityKey; meta: CapabilityMeta }[];
  showBookings: boolean;
}) {
  const InfoIcon = INFO_TAB_META.icon;
  return (
    <Tabs defaultValue={INFO_TAB_META.tabValue}>
      <TabsList equalWidth className="mb-6 w-full">
        <TabsTrigger value={INFO_TAB_META.tabValue} equalWidth className="gap-2 px-2 sm:px-space-4">
          <InfoIcon className="hidden h-4 w-4 sm:block" />
          <span className="hidden sm:inline">{INFO_TAB_META.tabLabel}</span>
          <span className="sm:hidden">{INFO_TAB_META.tabMobileLabel}</span>
        </TabsTrigger>
        {capabilityTabs.map(({ meta }) => {
          const T = meta.icon;
          return (
            <TabsTrigger key={meta.tabValue} value={meta.tabValue} equalWidth className="gap-2 px-2 sm:px-space-4">
              <T className="hidden h-4 w-4 sm:block" />
              <span className="hidden sm:inline">{meta.tabLabel}</span>
              <span className="sm:hidden">{meta.tabMobileLabel ?? meta.tabLabel}</span>
            </TabsTrigger>
          );
        })}
        {showBookings && (
          <TabsTrigger value="bookings" equalWidth className="gap-2 px-2 sm:px-space-4">
            <CalendarDays className="hidden h-4 w-4 sm:block" />
            <span className="hidden sm:inline">Bookings</span>
            <span className="sm:hidden">Book.</span>
          </TabsTrigger>
        )}
        <TabsTrigger value="booking-settings" equalWidth className="gap-2 px-2 sm:px-space-4">
          <SlidersHorizontal className="hidden h-4 w-4 sm:block" />
          <span className="hidden sm:inline">Booking setup</span>
          <span className="sm:hidden">Setup</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value={INFO_TAB_META.tabValue}>
        <UniversalInfoTab provider={provider} />
      </TabsContent>

      {capabilityTabs.map(({ key, meta }) => (
        <TabsContent key={meta.tabValue} value={meta.tabValue}>
          {key === "subscription_plans"
            ? <UniversalPlansTab providerId={provider.id} />
            : <ComingSoonTab capability={meta} />}
        </TabsContent>
      ))}

      {showBookings && (
        <TabsContent value="bookings">
          <ProviderBookingsTab provider={provider} />
        </TabsContent>
      )}

      <TabsContent value="booking-settings">
        <BookingSettingsForm provider={provider} />
      </TabsContent>
    </Tabs>
  );
}
