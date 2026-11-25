import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ChevronDown, Copy, Download, MessageCircle, Printer, Share2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { accountApi } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tr } from "@/lib/tr";

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

export function ProviderQrCard({ name, publicHref, isPublic, clientCode, providerId, embedded = false }: {
  name: string;
  /** Universal id — for the count of clients who came through the code. */
  providerId?: string;
  /** providers.client_code — rides on the link so a scan attributes the client. */
  clientCode?: string | null;
  /** Path of the provider's public page, from `providerHref`. */
  publicHref: string;
  /** False while the page is hidden: the code works only once it goes live. */
  isPublic: boolean;
  /** Inside QrCodesCard's tabs: no card of its own, and the tab names it. */
  embedded?: boolean;
}) {
  const url = `${PUBLIC_ORIGIN}${publicHref}` +
    (clientCode ? `${publicHref.includes("?") ? "&" : "?"}ref=${encodeURIComponent(clientCode)}` : "");
  const holder = useRef<HTMLDivElement>(null);

  // Clients who signed up through this code (provider_clients, read via the API).
  const { data: clients } = useQuery({
    queryKey: ["provider-clients", providerId],
    enabled: !!providerId && !!clientCode,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/clients`);
      if (error) return null;
      return data as { count: number; clients: Array<{ name: string; since: string }> };
    },
  });

  const shareText = tr("{name} is on EverySub — see our plans and subscribe here: {url}", { name, url });
  const svgMarkup = () => {
    const svg = holder.current?.querySelector("svg");
    return svg ? new XMLSerializer().serializeToString(svg) : null;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(tr("Link copied"));
    } catch {
      toast.error(tr("Could not copy the link"));
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
    img.onerror = () => toast.error(tr("Could not create the image"));
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

  /**
   * One thing to do with the code, and one place for the rest.
   *
   * There used to be four equal buttons — Print, Download PNG, Copy link,
   * WhatsApp — which wrapped onto a second line beside the code and gave no
   * hint which mattered. Print is the job this card exists for (a counter, a
   * flyer); the other three are all "send it somewhere", so they live in one
   * Share menu.
   */
  return (
    <section className={embedded ? "tracking-[-0.02em]" : "rounded-radius-lg bg-card p-4 tracking-[-0.02em]"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div ref={holder} className="w-fit shrink-0 rounded-radius-md bg-white p-2.5">
          <QRCodeSVG value={url} size={120} level="M" />
        </div>
        <div className="min-w-0 flex-1">
          {!embedded && <h2 className="text-heading font-semibold text-foreground">{tr("Your QR code")}</h2>}
          <p className={embedded ? "text-body text-muted-foreground" : "mt-1 text-body text-muted-foreground"}>
            {isPublic
              ? tr("Put it on a counter or a flyer. A scan opens your page with all your plans.")
              : tr("It starts working once your page is live. Until then the code opens nothing.")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={print} className="gap-1.5"><Printer className="h-4 w-4" />{tr("Print")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" className="gap-1.5">
                  <Share2 className="h-4 w-4" />{tr("Share")}<ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onSelect={copy}><Copy className="h-4 w-4" />{tr("Copy link")}</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />{tr("Send on WhatsApp")}</a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={download}><Download className="h-4 w-4" />{tr("Download image")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      {/* Why sharing it pays — under the code and its actions rather than
          between them, in two short lines instead of a paragraph. */}
      {clientCode && (
        <div className="mt-4 rounded-radius-md bg-inset px-3 py-2.5">
          <p className="text-meta text-foreground">
            <span className="font-semibold">{tr("0% commission")}</span>{" "}{tr("on anyone who signs up through this code (")}<span className="font-semibold">{clientCode}</span>).
          </p>
          {clients && (
            <p className="mt-0.5 text-meta text-muted-foreground">
              {clients.count === 0
                ? tr("No clients through it yet.")
                : (clients.count === 1 ? tr("{count} client so far{value2}.", { count: clients.count, value2: clients.clients[0] ? tr(" · latest: {name}", { name: clients.clients[0].name }) : "" }) : tr("{count} clients so far{value2}.", { count: clients.count, value2: clients.clients[0] ? tr(" · latest: {name}", { name: clients.clients[0].name }) : "" }))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
