import { useState, useRef, useEffect } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface Props {
  totalCents: number;
  /** Called with the payment id once payment is CONFIRMED paid. */
  onPaid: (paymentId: string) => void;
  orderMeta?: Record<string, unknown>;
  serviceName?: string;
}

/** LIVES payment via SimpleFi hosted checkout. */
export function InfinitaPaymentPanel({ totalCents, onPaid, orderMeta, serviceName }: Props) {
  const [creating, setCreating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const start = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-simplefi-invoice", {
        body: {
          amount_cents: totalCents,
          description: `${serviceName || "ProsperaSub"} — ${formatUSD(totalCents)}`,
          reference: { orderId: `order-${Date.now()}`, ...(orderMeta || {}) },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.checkout_url || !data?.payment_id) throw new Error("SimpleFi did not return a checkout link.");

      setCheckoutUrl(data.checkout_url);
      window.open(data.checkout_url, "_blank", "noopener,noreferrer");

      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        const { data: v } = await supabase.functions.invoke("verify-simplefi-payment", {
          body: { payment_id: data.payment_id },
        });
        if (v?.paid && !doneRef.current) {
          doneRef.current = true;
          if (pollingRef.current) clearInterval(pollingRef.current);
          setConfirmed(true);
          onPaid(data.payment_id);
        }
      }, 4000);
    } catch (e: any) {
      toast.error(e?.message || "Could not start LIVES payment");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-muted p-4 text-center">
        <p className="text-sm text-muted-foreground">Amount</p>
        <p className="text-2xl font-bold text-purple-500">{formatUSD(totalCents)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Pay with LIVES via SimpleFi</p>
      </div>

      {!checkoutUrl ? (
        <Button className="w-full gap-2" size="lg" onClick={start} disabled={creating || totalCents <= 0}>
          {creating ? <><Spinner size="sm" className="mr-1" /> Preparing…</> : <><ExternalLink className="h-4 w-4" /> Pay with LIVES</>}
        </Button>
      ) : confirmed ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm font-semibold text-green-500">
          <ShieldCheck className="h-4 w-4" /> Payment confirmed
        </div>
      ) : (
        <div className="space-y-3">
          <Button asChild className="w-full gap-2" size="lg" variant="outline">
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Re-open payment page
            </a>
          </Button>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-purple-500/10 p-3 text-xs text-muted-foreground">
            <Spinner size="sm" />
            Waiting for payment confirmation… this updates automatically once paid.
          </div>
        </div>
      )}
    </div>
  );
}
