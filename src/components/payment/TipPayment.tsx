import { useState, useRef, useEffect } from "react";
import { Heart, Copy, Zap, Bitcoin, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RecordArgs {
  amountCents: number;
  /** Normalised method ("crypto" for Infinita, otherwise lightning/onchain/paypal). */
  method: string;
  paymentRef: string;
  pending: boolean;
}

interface Props {
  /** Shown in the invoice/charge metadata, e.g. "Food Tip" / "Cleaning Tip". */
  serviceName: string;
  /** Edge-function context tag, e.g. "food_tip" / "cleaning_tip". */
  context: string;
  /** Prefix for the lightning invoice external id, e.g. "food-tip". */
  externalIdPrefix: string;
  /** Admin link embedded in the charge metadata. */
  adminUrl: string;
  customerName?: string | null;
  /** Amount already tipped (for the badge). */
  tippedCents?: number;
  /** Persist the tip after payment is confirmed (throw to signal failure). */
  onRecord: (args: RecordArgs) => Promise<void>;
  /** Refresh parent data after a successful tip. */
  onDone?: () => void;
  heading?: string;
  presets?: number[];
}

export function TipPayment({
  serviceName, context, externalIdPrefix, adminUrl, customerName,
  tippedCents = 0, onRecord, onDone, heading = "Leave a tip", presets = [200, 500, 1000],
}: Props) {
  const { enabled: enabledMethods } = usePaymentMethods();
  const { btcPrice, convertToSats, isLoading: priceLoading } = useBtcPrice();

  const [tipCents, setTipCents] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const [payOpen, setPayOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [onchainAddress, setOnchainAddress] = useState<string | null>(null);
  const [onchainUri, setOnchainUri] = useState<string | null>(null);
  const [lockedSats, setLockedSats] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createdRef = useRef(false);
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const finish = async (paymentRef: string, pending = false) => {
    if (createdRef.current) return;
    createdRef.current = true;
    try {
      await onRecord({
        amountCents: tipCents,
        method: paymentMethod === "infinita" ? "crypto" : paymentMethod,
        paymentRef,
        pending,
      });
    } catch (e: any) {
      createdRef.current = false;
      toast.error(e?.message || "Could not record tip");
      return;
    }
    if (pollingRef.current) clearInterval(pollingRef.current);
    setDone(true); setPayOpen(false);
    onDone?.();
    toast.success("Thank you for the tip! 💛");
  };

  const start = async () => {
    if (tipCents <= 0) return;
    createdRef.current = false;
    const desc = `${serviceName} — ${formatUSD(tipCents)}`;
    if (paymentMethod === "infinita" || paymentMethod === "paypal") { setPayOpen(true); return; }
    if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
    const sats = convertToSats(centsToDollars(tipCents));
    if (sats <= 0) { toast.error("Tip amount too small."); return; }
    setGenerating(true); setLockedSats(sats);
    try {
      if (paymentMethod === "onchain") {
        const { data, error } = await supabase.functions.invoke("create-onchain-charge", {
          body: { amount_sats: sats, amount_cents: tipCents, description: desc, service_name: serviceName, client_name: customerName ?? "", admin_url: adminUrl },
        });
        if (error) throw error; if (data?.error) throw new Error(data.error);
        setOnchainAddress(data.address);
        setOnchainUri(`bitcoin:${data.address}?amount=${(sats / 1e8).toFixed(8)}&label=ProsperaSub`);
        setPayOpen(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          const { data: v } = await supabase.functions.invoke("verify-onchain-payment", { body: { address: data.address, amount_sats: sats } });
          if (v?.paid) finish(data.address);
        }, 5000);
      } else {
        const { data, error } = await supabase.functions.invoke("create-invoice", {
          body: { amount_cents: tipCents, amount_sats: sats, context, description: desc, service_name: serviceName, client_name: customerName ?? "", admin_url: adminUrl, external_id: `${externalIdPrefix}-${Date.now()}`.slice(0, 100) },
        });
        if (error) throw error; if (data.error) throw new Error(data.error);
        setInvoice(data.payment_request); setPayOpen(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          const { data: v } = await supabase.functions.invoke("verify-payment", { body: { payment_hash: data.payment_hash } });
          if (v?.paid) finish(data.payment_hash);
        }, 3000);
      }
    } catch (e: any) { toast.error(e?.message || "Could not start tip payment"); setLockedSats(null); }
    finally { setGenerating(false); }
  };

  const cancel = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setInvoice(null); setOnchainAddress(null); setOnchainUri(null); setLockedSats(null); setPayOpen(false);
  };
  const estSats = btcPrice ? convertToSats(centsToDollars(tipCents)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Heart className="h-4 w-4 text-rose-400" /> {heading}</p>
        {tippedCents > 0 && <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-400">Tipped {formatUSD(tippedCents)}</span>}
      </div>

      {!payOpen && !done && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((c) => (
              <button key={c} type="button" onClick={() => { setTipCents(c); setCustomTip(""); }}
                className={cn("rounded-2xl px-3 py-2.5 text-sm font-bold transition-colors",
                  tipCents === c ? "bg-primary/15 text-foreground ring-1 ring-primary" : "bg-muted/40 text-muted-foreground hover:text-foreground")}>
                {formatUSD(c)}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input type="number" min={1} step={1} value={customTip}
              onChange={(e) => { setCustomTip(e.target.value); setTipCents(Math.round(parseFloat(e.target.value || "0") * 100)); }}
              placeholder="Custom amount" className="h-11 rounded-2xl pl-7" />
          </div>
          {tipCents > 0 && (
            <>
              <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
              <Button className="h-11 w-full rounded-2xl font-bold" onClick={start}
                disabled={generating || ((paymentMethod === "lightning" || paymentMethod === "onchain") && (priceLoading || !btcPrice))}>
                {generating ? <><Spinner size="sm" className="mr-2" /> Starting…</>
                  : paymentMethod === "infinita" ? <>Tip {formatUSD(tipCents)} with LIVES</>
                  : paymentMethod === "paypal" ? <>Tip {formatUSD(tipCents)} with PayPal</>
                  : paymentMethod === "onchain" ? <><Bitcoin className="mr-2 h-5 w-5" /> Tip {estSats.toLocaleString()} sats</>
                  : <><Zap className="mr-2 h-5 w-5" /> Tip {estSats.toLocaleString()} sats</>}
              </Button>
            </>
          )}
        </>
      )}

      {payOpen && paymentMethod === "infinita" && (
        <InfinitaPaymentPanel totalCents={tipCents} serviceName="Tip" onPaid={(pid) => finish(pid, false)} />
      )}
      {payOpen && paymentMethod === "paypal" && <PayPalPanel totalCents={tipCents} onPaid={(cap) => finish(cap)} />}
      {payOpen && paymentMethod === "lightning" && invoice && (
        <div className="flex flex-col items-center rounded-2xl border border-border p-4 text-center">
          <p className="mb-2 font-bold">Scan to tip {formatUSD(tipCents)}</p>
          <div className="rounded-xl bg-white p-3"><QRCodeSVG value={invoice} size={180} level="M" /></div>
          <p className="mt-2 text-xs text-muted-foreground">{(lockedSats ?? estSats).toLocaleString()} sats · waiting…</p>
          <Button variant="ghost" size="sm" className="mt-1 gap-1.5" onClick={() => { navigator.clipboard.writeText(invoice); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /> Copy</Button>
        </div>
      )}
      {payOpen && paymentMethod === "onchain" && onchainAddress && (
        <div className="flex flex-col items-center rounded-2xl border border-border p-4 text-center">
          <p className="mb-2 font-bold">Send Bitcoin tip — {formatUSD(tipCents)}</p>
          <div className="rounded-xl bg-white p-3"><QRCodeSVG value={onchainUri ?? `bitcoin:${onchainAddress}`} size={180} level="M" /></div>
          <p className="mt-2 text-xs text-muted-foreground">{(lockedSats ?? estSats).toLocaleString()} sats · waiting…</p>
        </div>
      )}
      {payOpen && <Button variant="ghost" className="w-full" onClick={cancel}>Cancel</Button>}
      {done && <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-500/10 py-2.5 text-sm font-semibold text-green-400"><CheckCircle2 className="h-5 w-5" /> Tip sent — thank you!</div>}
    </div>
  );
}
