import { ChevronRight } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * The checkout, as cards — measured off the Figma frame rather than guessed.
 *
 * The numbers here are the design's own: cards run full-bleed at 4px apart, a
 * line item is padded 8/16/8/8 around a 104px thumbnail at radius 8, a section
 * card is radius 24 with 16px of vertical padding and its rows inset 16.
 * The type ramp is five styles and no more — Semi Bold 20 for a card heading,
 * Semi Bold 16 for a title or a price, Semi Bold 14 for a row label, Regular 14
 * for its value, Regular 12 for a description — all tracked at -2%.
 *
 * The colours needed no translation: #2a2a2a, #7d7d7d, #f6f6f6 and #f7a21b are
 * already `--card-foreground`, `--muted-foreground`, `--inset` and the brand
 * accent, so these use the tokens and follow the theme at night.
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
    <div className="flex gap-4 rounded-radius-md bg-card py-2 pl-2 pr-4 tracking-[-0.02em]">
      {/* No placeholder when there is no photograph: an empty grey square reads
          as a picture that failed to load, and most plans have no picture. */}
      {image && (
        <img
          src={image}
          alt=""
          className="h-[104px] w-[104px] shrink-0 rounded-[8px] object-cover"
          loading="lazy"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col py-2">
        <p className="truncate text-[16px] font-semibold leading-tight text-foreground">{title}</p>
        {description && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{description}</p>
        )}
        <p className="mt-auto pt-2 text-right text-[16px] font-semibold tabular-nums text-foreground">
          {quantity && quantity > 1 && (
            <span className="mr-2 text-[12px] font-normal text-muted-foreground">× {quantity}</span>
          )}
          {formatUSD(priceCents)}
        </p>
      </div>
    </div>
  );
}

/** A section card: radius 24, 16 top and bottom, rows inset 16. */
export function CheckoutCard({ title, children, className }: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-radius-lg bg-card py-4 tracking-[-0.02em]", className)}>
      {title && (
        <h2 className="px-4 text-[20px] font-semibold leading-none text-foreground">{title}</h2>
      )}
      <div className={cn("px-4", title && "mt-3")}>{children}</div>
    </section>
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
    <CheckoutCard title="Personal data">
      <button
        type="button"
        onClick={onEdit}
        aria-expanded={children ? !!open : undefined}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn(
            "block text-[16px] font-semibold",
            name ? "text-foreground" : "text-muted-foreground",
          )}>
            {name || "Add your details"}
          </span>
          {shown.map((line) => (
            <span key={line} className="mt-0.5 block truncate text-[12px] text-muted-foreground">
              {line}
            </span>
          ))}
          {incomplete && (
            <span className="mt-1 block text-[12px] font-semibold text-destructive">
              Needed before you can pay
            </span>
          )}
        </span>
        <ChevronRight
          className={cn(
            "h-6 w-6 shrink-0 text-muted-foreground transition-transform",
            children && open && "rotate-90",
          )}
        />
      </button>
      {children && open && <div className="mt-4 space-y-4">{children}</div>}
    </CheckoutCard>
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
    <CheckoutCard title="Resume">
      <dl className="space-y-2">
        {extra?.map((row) => (
          <Line key={row.label} label={row.label} value={row.value} />
        ))}
        <Line label="Goods" value={formatUSD(goodsCents)} />
        {feeCents > 0 && <Line label={feeLabel} value={formatUSD(feeCents)} />}
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <dt className="text-[14px] font-semibold text-foreground">Total</dt>
          <dd className="text-[16px] font-semibold tabular-nums text-foreground">{formatUSD(totalCents)}</dd>
        </div>
      </dl>
    </CheckoutCard>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[14px] font-semibold text-foreground">{label}</dt>
      <dd className="text-[14px] tabular-nums text-muted-foreground">{value}</dd>
    </div>
  );
}

/**
 * The field list inside Personal data — a grey block of borderless rows.
 *
 * The redesign has no bordered input pills anywhere; the cart's checkout was
 * already built this way and the single-plan one was not, so the same two
 * questions looked like different forms depending on how you arrived. One
 * component now, so they cannot drift again.
 */
export function FieldRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border/40 overflow-hidden rounded-radius-md bg-inset">
      {children}
    </div>
  );
}

export function FieldRow({
  icon, label, required, children, align = "center",
}: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  /** `start` for a multi-line control, so the icon sits on the first line. */
  align?: "center" | "start";
}) {
  return (
    <div className={cn("flex gap-3 px-4", align === "center" ? "items-center" : "items-start py-3")}>
      <span className={cn("shrink-0 text-muted-foreground", align === "start" && "mt-0.5")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <span className={cn(
          "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
          align === "center" && "pt-3",
        )}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {children}
      </div>
    </div>
  );
}

/** The borderless control inside a FieldRow. */
export const fieldInputClass =
  "w-full border-0 bg-transparent px-0 pb-3 pt-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60";
