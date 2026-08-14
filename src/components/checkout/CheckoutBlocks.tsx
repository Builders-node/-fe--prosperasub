import { ChevronRight } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * The checkout, as four cards.
 *
 * The old screen was one long card that mixed what you are buying with the
 * questions being asked about it — a start date, an address, a phone number, a
 * notes box — and then a summary of the same thing further down. The redesign
 * separates them: what you bought, who you are, what it costs, how you pay.
 * Each is a card, in that order, and none of them explains another.
 *
 * These are presentational on purpose. Every screen that sells something feeds
 * them the same four shapes, which is what stops the cart and the single-plan
 * checkout from drifting apart again.
 */

/** One thing being bought — a plan, a basket line, a renewal. */
export function CheckoutLineItem({
  title, description, priceCents, image, quantity,
}: {
  title: string;
  description?: string | null;
  priceCents: number;
  image?: string | null;
  /** Shown only when more than one, because "× 1" is noise. */
  quantity?: number;
}) {
  return (
    <div className="flex gap-3 rounded-radius-md bg-card p-3">
      {/* No placeholder when there is no photograph: an empty grey square reads
          as a picture that failed to load, and most plans have no picture. */}
      {image && (
        <img
          src={image}
          alt=""
          className="h-[72px] w-[72px] shrink-0 rounded-radius-sm object-cover"
          loading="lazy"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-[16px] font-bold leading-tight text-foreground">{title}</p>
        {description && (
          <p className="mt-1 line-clamp-2 text-[14px] text-muted-foreground">{description}</p>
        )}
        <p className="mt-auto pt-3 text-right text-[18px] font-bold tabular-nums text-foreground">
          {quantity && quantity > 1 && (
            <span className="mr-2 text-[14px] font-semibold text-muted-foreground">× {quantity}</span>
          )}
          {formatUSD(priceCents)}
        </p>
      </div>
    </div>
  );
}

/**
 * Who the order is for.
 *
 * A summary with a way in, rather than four inputs on the checkout itself. The
 * details are the same ones every time, so showing them back and letting them
 * be corrected beats asking for them again — and it keeps the till on one
 * screen.
 */
export function PersonalDataCard({
  name, lines, onEdit, incomplete, open, children,
}: {
  name: string | null;
  /** email, phone, address — whatever this purchase actually needs. */
  lines: Array<string | null | undefined>;
  onEdit: () => void;
  /** Something required is missing, so the card asks instead of stating. */
  incomplete?: boolean;
  /** When the fields live in this card rather than on another screen. */
  open?: boolean;
  children?: React.ReactNode;
}) {
  const shown = lines.filter((l): l is string => !!l && !!l.trim());
  return (
    <section className="rounded-radius-md bg-card p-4">
      <h2 className="text-[20px] font-black tracking-tight text-foreground">Personal data</h2>
      <button
        type="button"
        onClick={onEdit}
        aria-expanded={children ? !!open : undefined}
        className="mt-3 flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn(
            "block text-[16px] font-bold",
            name ? "text-foreground" : "text-muted-foreground",
          )}>
            {name || "Add your details"}
          </span>
          {shown.map((line) => (
            <span key={line} className="mt-0.5 block truncate text-[13px] text-muted-foreground">
              {line}
            </span>
          ))}
          {incomplete && (
            <span className="mt-1 block text-[13px] font-semibold text-destructive">
              Needed before you can pay
            </span>
          )}
        </span>
        <ChevronRight
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            children && open && "rotate-90",
          )}
        />
      </button>
      {children && open && <div className="mt-4 space-y-4">{children}</div>}
    </section>
  );
}

/** What it adds up to. The fee is named, because a surprise at the till is not one. */
export function ResumeCard({
  goodsCents, feeCents, totalCents, feeLabel = "Fee", extra,
}: {
  goodsCents: number;
  feeCents: number;
  totalCents: number;
  feeLabel?: string;
  /** Rows a particular purchase needs — a term, a number of people. */
  extra?: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-radius-md bg-card p-4">
      <h2 className="text-[20px] font-black tracking-tight text-foreground">Resume</h2>
      <dl className="mt-3 space-y-2.5">
        {extra?.map((row) => (
          <Line key={row.label} label={row.label} value={row.value} />
        ))}
        <Line label="Goods" value={formatUSD(goodsCents)} />
        {feeCents > 0 && <Line label={feeLabel} value={formatUSD(feeCents)} />}
        <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
          <dt className="text-[16px] font-bold text-foreground">Total</dt>
          <dd className="text-[18px] font-black tabular-nums text-foreground">{formatUSD(totalCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[15px] text-foreground">{label}</dt>
      <dd className="text-[15px] tabular-nums text-muted-foreground">{value}</dd>
    </div>
  );
}
