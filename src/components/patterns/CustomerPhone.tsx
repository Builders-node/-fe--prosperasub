import { Phone, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The customer's phone on a provider-facing order row.
 *
 * A provider looking at an order almost always wants to *call* the person, so
 * this is a tel: link rather than text you have to select and re-type on a
 * phone. WhatsApp sits next to it because that's how people here actually
 * reach each other — the number is already stored as a WhatsApp number on food
 * and rental orders.
 *
 * One component for every list so a provider switching between Food, Cleaning
 * and the Bookings calendar sees the number in the same place, same shape.
 */

/** Digits only, keeping a leading +. wa.me wants bare digits; tel: tolerates both. */
function digits(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Empty strings are stored all over the legacy tables (cleaning_clients.phone
  // is `''`, not null) — treat them as "no phone" rather than rendering a link
  // to nowhere.
  if (!trimmed) return null;
  // Needs enough digits to be dialable. Guards against stray values like "-".
  return digits(trimmed).length >= 6 ? trimmed : null;
}

/**
 * Pick the first usable number from a fallback chain, e.g.
 * `pickPhone(sub.customer_whatsapp, profile?.whatsapp, profile?.phone_number)`.
 */
export function pickPhone(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const p = normalizePhone(c);
    if (p) return p;
  }
  return null;
}

interface Props {
  phone: string | null | undefined;
  /** Hide the WhatsApp shortcut where the number isn't a WhatsApp number. */
  whatsapp?: boolean;
  className?: string;
}

export function CustomerPhone({ phone, whatsapp = true, className }: Props) {
  const value = normalizePhone(phone);
  if (!value) return null;
  const bare = digits(value);

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <a
        href={`tel:${value.replace(/\s+/g, "")}`}
        // stopPropagation: these rows sit inside expandable/clickable cards, and
        // tapping the number should dial, not toggle the card.
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground/90 hover:text-primary"
      >
        <Phone className="h-3 w-3 shrink-0" />
        {value}
      </a>
      {whatsapp && (
        <a
          href={`https://wa.me/${bare}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`WhatsApp ${value}`}
          title="WhatsApp"
          className="text-muted-foreground hover:text-emerald-500"
        >
          <MessageCircle className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}
