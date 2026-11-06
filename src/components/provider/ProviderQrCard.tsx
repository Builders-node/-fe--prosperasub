import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The business's own QR, for a counter, a flyer or a door: it opens the public
 * page that lists everything the business sells.
 *
 * It also carries the business's client code (`?ref=CODE`). Someone who signs
 * up after scanning it becomes the business's own client, and the platform
 * takes no commission on their orders with it — the same as typing the code
 * (useReferralCapture → /account/referrals/claim → claim_provider_client).
 *
 * It always encodes the production address. A printed code outlives whatever
 * tab it was made in, and one made on dev or localhost would point nowhere.
 */
const PUBLIC_ORIGIN = "https://everysub.net";
const PNG_SIZE = 1200;
/** White margin round the code, as a share of its side — scanners need it. */
const QUIET_ZONE = 0.08;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fileSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "provider";

export function ProviderQrCard({ name, publicHref, isPublic, clientCode }: {
  name: string;
  /** providers.client_code — rides on the link so a scan attributes the client. */
  clientCode?: string | null;
  /** Path of the provider's public page, from `providerHref`. */
  publicHref: string;
  /** False while the page is hidden: the code works only once it goes live. */
  isPublic: boolean;
}) {
  const url = `${PUBLIC_ORIGIN}${publicHref}` +
    (clientCode ? `${publicHref.includes("?") ? "&" : "?"}ref=${encodeURIComponent(clientCode)}` : "");
  const holder = useRef<HTMLDivElement>(null);
  const svgMarkup = () => {
    const svg = holder.current?.querySelector("svg");
    return svg ? new XMLSerializer().serializeToString(svg) : null;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const download = () => {
    const markup = svgMarkup();
    if (!markup) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PNG_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
      // Sharp edges: a scaled-up code must not blur between its modules.
      ctx.imageSmoothingEnabled = false;
      const margin = Math.round(PNG_SIZE * QUIET_ZONE);
      ctx.drawImage(img, margin, margin, PNG_SIZE - margin * 2, PNG_SIZE - margin * 2);
      const link = document.createElement("a");
      link.download = `${fileSlug(name)}-qr.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.onerror = () => toast.error("Could not create the image");
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  };

  /** A hidden frame rather than a new tab, which a popup blocker would stop. */
  const print = () => {
    const markup = svgMarkup();
    if (!markup) return;
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
    </style></head><body><h1>${escapeHtml(name)}</h1><p>Scan to see our plans</p>${markup}<small>everysub.net${clientCode ? ` · code ${escapeHtml(clientCode)}` : ""}</small></body></html>`;
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
    <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div ref={holder} className="w-fit shrink-0 rounded-radius-md bg-white p-3">
          <QRCodeSVG value={url} size={140} level="M" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">Your QR code</h2>
          <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">
            {isPublic
              ? "Print it for a counter or a flyer. Customers scan it and see all your plans."
              : "Customers will see your plans here once your page is live. Until then the code opens nothing."}
          </p>
          {clientCode && (
            <p className="mt-2 text-[14px] leading-[20px] text-muted-foreground">
              Your client code: <span className="font-semibold text-foreground">{clientCode}</span>.
              Clients who sign up with this QR or code pay no platform commission on your services.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={print}><Printer className="h-4 w-4" />Print</Button>
            <Button size="sm" variant="secondary" onClick={download}><Download className="h-4 w-4" />Download PNG</Button>
            <Button size="sm" variant="secondary" onClick={copy}><Copy className="h-4 w-4" />Copy link</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
