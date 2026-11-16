import { useCallback } from "react";
import { Footprints, Home, Truck } from "lucide-react";

import { ZoneEditor } from "@/components/delivery/ZoneEditor";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { accountApi } from "@/integrations/supabase/client";

/**
 * A business's own zones — where it goes, and what that costs the customer.
 *
 * The same editor the platform uses (Admin → Delivery). A zone here serves
 * both ways of going out: a VISIT (the business comes to the customer) and the
 * business's OWN DELIVERY. The fee is the business's money and reaches its
 * balance; a platform zone's fee is the platform's.
 *
 * No zones = a visit goes anywhere with no call-out fee, and a delivery goes
 * through the platform's couriers and zones. Which of the three ways an offer
 * allows is chosen on the offer itself (Offerings → How the customer gets it).
 */
export function ProviderDeliveryTab({ providerId }: { providerId: string }) {
  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const { data, error } = await accountApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (error) throw error;
    return data as T;
  }, []);

  return (
    <div className="space-y-1">
      <WorkspaceSection title="How customers get your service" subtitle="Chosen on each offer in Offerings">
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Footprints, title: "Self-service", text: "They come to you. No zone needed." },
            { icon: Home, title: "Visit", text: "You go to them — only inside your zones below, or anywhere if you draw none." },
            { icon: Truck, title: "Delivery", text: "Inside your zones you deliver yourself. With no zones, EverySub's couriers do it." },
          ].map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-radius-md bg-inset p-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block text-body font-semibold text-foreground">{title}</span>
                <span className="block text-meta text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>
      <WorkspaceSection title="Your zones" subtitle="Where you go, the fee, and how soon you arrive. The fee is yours.">
        <ZoneEditor
          basePath={`/account/providers/${providerId}/delivery/zones`}
          call={call}
          queryKey={["my-provider-zones", providerId]}
          timeLabel="Arrival time"
          emptyText="No zones yet. Draw where you go — a circle around your base is enough. Customers then see your fee and arrival time under their pin."
        />
      </WorkspaceSection>
    </div>
  );
}
