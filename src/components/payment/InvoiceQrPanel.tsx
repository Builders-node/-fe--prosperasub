import { Bitcoin, CheckCircle2, Copy, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface Props {
  mode: "lightning" | "onchain";
  invoice?: string | null;   // lightning payment_request
  address?: string | null;   // on-chain BTC address
  uri?: string | null;       // bitcoin:… URI (on-chain QR)
  sats: number;
  totalCents: number;
  isPaid: boolean;
  successLabel?: string;     // e.g. "Activating membership…"
  waitingLabel?: string;     // override the default waiting text (on-chain uses a longer copy)
}

/**
 * Shared visual for Lightning + on-chain checkout screens. Every service uses
 * the same header, QR frame, amount card, invoice/address row, and status
 * strip — so the checkout looks identical across Cleaning / Food / Beach /
 * Cart.
 */
export function InvoiceQrPanel({
  mode, invoice, address, uri, sats, totalCents, isPaid,
  successLabel = "Activating…",
  waitingLabel,
}: Props) {
  const qrValue = mode === "lightning" ? invoice : (uri ?? (address ? `bitcoin:${address}` : ""));
  const linkHref = mode === "lightning" ? `lightning:${invoice}` : (uri ?? `bitcoin:${address}`);
  const rowLabel = mode === "lightning" ? "Lightning Invoice" : "Bitcoin Address";
  const rowValue = mode === "lightning" ? invoice ?? "" : address ?? "";
  const defaultWaiting = mode === "lightning"
    ? "Waiting for payment..."
    : "Waiting for payment… on-chain can take a few minutes.";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <section className="overflow-hidden rounded-3xl bg-card p-5 space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground">
        {mode === "lightning" ? <Zap className="h-5 w-5 text-bitcoin" /> : <Bitcoin className="h-5 w-5 text-bitcoin" />}
        {mode === "lightning" ? "Pay with Lightning" : "Pay on-chain (Bitcoin)"}
      </h2>

      {qrValue && (
        <a href={linkHref} className="flex justify-center rounded-2xl bg-white p-4 cursor-pointer">
          <QRCodeSVG value={qrValue} size={200} level="M" />
        </a>
      )}

      <div className="rounded-2xl bg-muted/40 p-4 text-center">
        <p className="text-sm text-muted-foreground">Amount</p>
        <p className="text-2xl font-black text-bitcoin">{sats.toLocaleString()} sats</p>
        <p className="text-sm text-muted-foreground">
          {formatUSD(totalCents)} total{mode === "onchain" ? " · send exactly this amount" : ""}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">{rowLabel}</Label>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-xl bg-muted/40 p-3 text-xs break-all max-h-20 overflow-y-auto">{rowValue}</code>
          <Button variant="secondary" size="icon" onClick={() => copy(rowValue)} aria-label={`Copy ${rowLabel}`}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={`flex items-center justify-center gap-2 rounded-2xl p-4 ${isPaid ? "bg-green-500/10" : "bg-bitcoin/10"}`}>
        {isPaid ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-500">
              {mode === "lightning" ? "Payment confirmed!" : "Payment detected!"} {successLabel}
            </span>
          </>
        ) : (
          <>
            <Spinner size="md" className="text-bitcoin" />
            <span className="text-sm font-medium">{waitingLabel ?? defaultWaiting}</span>
          </>
        )}
      </div>
    </section>
  );
}
