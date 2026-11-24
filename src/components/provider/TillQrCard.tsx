import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TillPinForm } from "@/components/till/TillPinForm";

/**
 * The till QR: customers scan it in the app, see what their subscription here
 * includes today, and press Get (pages/Redeem.tsx → Edge routes/redeem.ts).
 * The business sees each collection on Schedule → Today.
 *
 * A different code from "Your QR code" on purpose: that one sells (it opens
 * the plans), this one hands over what was already bought. Always the live
 * address — a printed code outlives the tab it was made in.
 */
const PUBLIC_ORIGIN = "https://everysub.net";

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function TillQrCard({ providerId, name, embedded = false }: { providerId: string; name: string; embedded?: boolean }) {
  const url = `${PUBLIC_ORIGIN}/redeem/${providerId}`;
  const holder = useRef<HTMLDivElement>(null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    catch { toast.error("Could not copy the link"); }
  };

  const print = () => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    const markup = new XMLSerializer().serializeToString(svg);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>
      @page { margin: 20mm; }
      body { margin: 0; min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: Inter, Arial, sans-serif; color: #000; }
      h1 { margin: 0; font-size: 40px; font-weight: 700; }
      p { margin: 12px 0 32px; font-size: 22px; }
      svg { width: 110mm; height: 110mm; }
      small { margin-top: 24px; font-size: 16px; }
    </style></head><body><h1>${escapeHtml(name)}</h1><p>Subscribers: scan to collect</p>${markup}<small>Open the EverySub app or your camera</small></body></html>`;
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) return;
      win.onafterprint = () => frame.remove();
      win.focus();
      win.print();
    };
    document.body.appendChild(frame);
  };

  return (
    <section className={embedded ? "tracking-[-0.02em]" : "rounded-radius-lg bg-card p-4 tracking-[-0.02em]"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div ref={holder} className="w-fit shrink-0 rounded-radius-md bg-white p-3">
          <QRCodeSVG value={url} size={140} level="M" />
        </div>
        <div className="min-w-0">
          {!embedded && <h2 className="text-heading font-semibold text-foreground">Till QR</h2>}
          <p className={embedded ? "text-body text-muted-foreground" : "mt-1 text-body text-muted-foreground"}>
            Put it at the till. A subscriber scans it, sees what their plan includes today and presses Get —
            you see it at once on Schedule → Today. Or staff scan the customer's own code and enter the PIN below.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={print}><Printer className="h-4 w-4" /> Print</Button>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={copy}><Copy className="h-4 w-4" /> Copy link</Button>
          </div>
        </div>
      </div>
      {/* The other way to collect: staff scan the customer's code and type this. */}
      <TillPinForm providerId={providerId} />
    </section>
  );
}
