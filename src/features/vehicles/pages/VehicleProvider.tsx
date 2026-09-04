import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, Mail, MapPin, Phone } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/patterns/QueryError";
import { ShareButton } from "@/components/patterns/ShareButton";
import { LinkifiedText } from "@/components/patterns/LinkifiedText";
import { YdSectionHeading } from "@/components/yd/YdPrimitives";
import { ProviderReviewsBlock } from "@/components/reviews/ProviderReviewsBlock";
import { useGoBack } from "@/hooks/useGoBack";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatWorkingHours } from "@/lib/workingHours";
import { formatUSD } from "@/lib/pricing";
import { TRANSPORT_UNIT } from "@/lib/services/transport";
import { carPath } from "../lib/routes";
import { VehicleCard } from "../components/VehicleCard";
import { useVehicles } from "../hooks/useVehicles";
import { useVehicleTypes } from "../hooks/useVehicleTypes";

/**
 * One rental business, inside the unit that runs it.
 *
 * Every business on the platform has a page a customer can open — it is where
 * you find out who you are renting from, what else they have and what other
 * people said. Transport had none: its businesses were reachable only through
 * the marketplace's `/services/<slug>/providers/<id>`, a URL built out of the
 * archetype the unit no longer has, and the fleet only offered a door when
 * there was more than one company to choose between.
 *
 * The shelf groups by TYPE when the fleet is mixed, because that is the
 * question a visitor has of a company that rents both cars and motorbikes.
 */
export default function VehicleProvider() {
  const { providerId = "" } = useParams<{ providerId: string }>();
  const goBack = useGoBack(carPath());

  const providerQ = useQuery({
    queryKey: ["vehicle-provider", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, description, avatar_url, banner_url, location, working_hours, contact_phone, contact_email, admin_user_id, unit, status")
        .eq("id", providerId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        id: string; name: string; description: string | null;
        avatar_url: string | null; banner_url: string | null;
        location: string | null; working_hours: unknown;
        contact_phone: string | null; contact_email: string | null;
        admin_user_id: string | null; unit: string | null; status: string;
      } | null;
    },
  });

  const fleetQ = useVehicles({ providerId, enabled: !!providerId });
  const typesQ = useVehicleTypes();

  const provider = providerQ.data;
  const fleet = fleetQ.data ?? [];

  /** Cheapest day rate on the shelf — the figure a visitor is scanning for. */
  const fromCents = useMemo(() => {
    const prices = fleet.map((v) => v.daily_price_cents ?? 0).filter((n) => n > 0);
    return prices.length ? Math.min(...prices) : 0;
  }, [fleet]);

  /** The shelf, split by type only when there is more than one. */
  const groups = useMemo(() => {
    const byType = new Map<string, typeof fleet>();
    fleet.forEach((v) => {
      const k = v.category_key ?? "";
      byType.set(k, [...(byType.get(k) ?? []), v]);
    });
    if (byType.size <= 1) return null;
    const order = typesQ.data ?? [];
    const keys = [
      ...order.map((t) => t.key).filter((k) => byType.has(k)),
      ...[...byType.keys()].filter((k) => !order.some((t) => t.key === k)),
    ];
    const labelOf = new Map(order.map((t) => [t.key, t.label]));
    return keys.map((k) => ({ key: k, label: labelOf.get(k) ?? "Other", items: byType.get(k)! }));
  }, [fleet, typesQ.data]);

  if (providerQ.isLoading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  // A marketplace provider pasted into a transport URL, or a deleted one.
  if (providerQ.isError || !provider || provider.unit !== TRANSPORT_UNIT) {
    return (
      <AppContainer className="py-space-8">
        <QueryError
          title="This rental business isn't here"
          error={providerQ.error}
          onRetry={() => void providerQ.refetch()}
        />
        <Button asChild variant="outline" className="mt-4">
          <Link to={carPath()}>Back to the fleet</Link>
        </Button>
      </AppContainer>
    );
  }

  const hours = formatWorkingHours(provider.working_hours);

  return (
    <div>
      <DesktopHeader />
      <HomeHeader
        title="Car Rental"
        showBackButton
        onBack={goBack}
        rightAction={<ShareButton title={provider.name} />}
      />

      {/* Banner, or the plain card top when the business has not uploaded one. */}
      {provider.banner_url && (
        <div className="h-36 w-full overflow-hidden bg-muted md:h-52">
          <img src={provider.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <AppContainer className="py-space-4 md:py-space-8">
        <section className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-radius-md bg-card">
            {provider.avatar_url
              ? <img src={provider.avatar_url} alt="" className="h-full w-full object-cover" />
              : <Building2 className="h-7 w-7 text-muted-foreground/50" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.5px] text-foreground">
              {provider.name}
            </h1>
            <p className="mt-1 text-[14px] leading-[18px] text-muted-foreground">
              {fleet.length} {fleet.length === 1 ? "vehicle" : "vehicles"}
              {fromCents > 0 && <> · from {formatUSD(fromCents)} / day</>}
            </p>
          </div>
        </section>

        {provider.description && (
          <p className="mt-4 whitespace-pre-line text-[16px] leading-[22px] text-foreground">
            <LinkifiedText text={provider.description} />
          </p>
        )}

        {/* How to reach them — the rest of the platform shows the same four. */}
        <div className="mt-4 divide-y divide-border/60 rounded-radius-md bg-card">
          {provider.location && <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={provider.location} />}
          {hours && <InfoRow icon={<Clock className="h-4 w-4" />} label="Opening hours" value={hours} />}
          {provider.contact_phone && <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={provider.contact_phone} />}
          {provider.contact_email && <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={provider.contact_email} />}
        </div>

        <div className="mt-6">
          {fleetQ.isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : fleetQ.isError ? (
            <QueryError title="Couldn't load this fleet" error={fleetQ.error} onRetry={() => void fleetQ.refetch()} />
          ) : fleet.length === 0 ? (
            <div className="rounded-radius-md bg-card py-12 text-center">
              <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">Nothing listed yet</p>
              <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
                This business has no vehicles on the platform right now.
              </p>
            </div>
          ) : groups ? (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.key || "other"}>
                  <YdSectionHeading title={g.label} count={g.items.length} />
                  <div className="space-y-3">
                    {g.items.map((v) => <VehicleCard key={v.id} v={v} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <YdSectionHeading title="Vehicles" count={fleet.length} />
              <div className="space-y-3">
                {fleet.map((v) => <VehicleCard key={v.id} v={v} />)}
              </div>
            </>
          )}
        </div>

        <div className="mt-8">
          <ProviderReviewsBlock
            providerId={provider.id}
            service="cars"
            ownerUserId={provider.admin_user_id}
            placeholder="How was the car, and the handover?"
          />
        </div>
      </AppContainer>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 whitespace-pre-line text-[14px] leading-[18px] text-foreground">{value}</p>
      </div>
    </div>
  );
}
