import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Car, Info, CarFront, Shield, PlusCircle, MapPin, Users, ExternalLink } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderInfoTab } from "@/components/rental/admin/ProviderInfoTab";
import { ProviderVehiclesTab } from "@/components/rental/admin/ProviderVehiclesTab";
import { ProviderInsuranceTab } from "@/components/rental/admin/ProviderInsuranceTab";
import { ProviderExtrasTab } from "@/components/rental/admin/ProviderExtrasTab";
import { ProviderDeliveryTab } from "@/components/rental/admin/ProviderDeliveryTab";
import { ProviderStaffTab } from "@/components/rental/admin/ProviderStaffTab";
import { useMyCarRentals } from "@/hooks/useMyCarRentals";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

export default function MyCarRental() {
  const { providers, isLoading } = useMyCarRentals();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("providerId"));

  const selected = providers.find((p) => p.id === selectedId) ?? providers[0] ?? null;
  const isOwner = selected?.myRole === "owner";

  if (isLoading) {
    return (
      <UserLayout title="My Car Rental">
        <div className="app-container space-y-4 py-6">
          <div className="h-20 animate-pulse rounded-2xl bg-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        </div>
      </UserLayout>
    );
  }

  if (!selected) {
    return (
      <UserLayout title="My Car Rental">
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <Car className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">You don't manage a car rental</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            If you should have access to a car-rental provider, ask a platform administrator to add you as its owner or a manager.
          </p>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="My Car Rental">
      <div className="app-container space-y-6 py-6">
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
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
            {selected.logo_url ? (
              <img src={selected.logo_url} alt={selected.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Car className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">{selected.name}</h1>
              <Badge className={`rounded-full text-xs ${STATUS_COLORS[selected.status]}`}>{selected.status}</Badge>
              <Badge variant="secondary" className="rounded-full text-xs capitalize">{selected.myRole}</Badge>
            </div>
            {selected.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{selected.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full"
            onClick={() => window.open(`/cars`, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5" /> View Public
          </Button>
        </div>

        <Tabs defaultValue="info" key={selected.id}>
          <TabsList className="mb-6 w-full">
            <TabsTrigger value="info" className="gap-2"><Info className="h-4 w-4" /><span>Info</span></TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-2"><CarFront className="h-4 w-4" /><span>Vehicles</span></TabsTrigger>
            <TabsTrigger value="insurance" className="gap-2"><Shield className="h-4 w-4" /><span className="hidden sm:inline">Insurance</span><span className="sm:hidden">Ins.</span></TabsTrigger>
            <TabsTrigger value="extras" className="gap-2"><PlusCircle className="h-4 w-4" /><span>Extras</span></TabsTrigger>
            <TabsTrigger value="delivery" className="gap-2"><MapPin className="h-4 w-4" /><span>Delivery</span></TabsTrigger>
            {isOwner && <TabsTrigger value="staff" className="gap-2"><Users className="h-4 w-4" /><span>Staff</span></TabsTrigger>}
          </TabsList>

          <TabsContent value="info"><ProviderInfoTab provider={selected} /></TabsContent>
          <TabsContent value="vehicles"><ProviderVehiclesTab providerId={selected.id} /></TabsContent>
          <TabsContent value="insurance"><ProviderInsuranceTab providerId={selected.id} /></TabsContent>
          <TabsContent value="extras"><ProviderExtrasTab providerId={selected.id} /></TabsContent>
          <TabsContent value="delivery"><ProviderDeliveryTab providerId={selected.id} /></TabsContent>
          {isOwner && <TabsContent value="staff"><ProviderStaffTab provider={selected} /></TabsContent>}
        </Tabs>
      </div>
    </UserLayout>
  );
}
