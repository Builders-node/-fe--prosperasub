import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderQrCard } from "@/components/provider/ProviderQrCard";
import { TillQrCard } from "@/components/provider/TillQrCard";

/**
 * A business's two QR codes in one card, one at a time.
 *
 *   New customers — sells: opens the plans, and brings clients at 0% commission
 *   At the till   — hands over: subscribers scan it to collect (pages/Redeem)
 *
 * Two codes side by side read as a puzzle ("which one do I print?"); a tab
 * says what each is for before showing it.
 */
export function QrCodesCard({ name, providerId, publicHref, isPublic, clientCode, showTill }: {
  name: string;
  providerId: string;
  publicHref: string;
  isPublic: boolean;
  clientCode: string | null;
  /** A business with a service sells subscriptions to collect; a vehicles fleet does not. */
  showTill: boolean;
}) {
  const [tab, setTab] = useState<"sell" | "till">("sell");
  const sell = (
    <ProviderQrCard embedded name={name} clientCode={clientCode} providerId={providerId}
      publicHref={publicHref} isPublic={isPublic} />
  );
  return (
    <section className="space-y-4 rounded-radius-lg bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading font-semibold text-foreground">QR codes</h2>
        {showTill && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "sell" | "till")}>
            <TabsList variant="segment">
              <TabsTrigger value="sell" variant="segment">New customers</TabsTrigger>
              <TabsTrigger value="till" variant="segment">At the till</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {!showTill || tab === "sell" ? sell : <TillQrCard embedded providerId={providerId} name={name} />}
    </section>
  );
}
