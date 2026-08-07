import { Network } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where a sale came from.
 *
 * A subscription provisioned by the Builders Node partner integration looked
 * exactly like one bought on the platform, so a provider reading their list had
 * no way to tell which customer they actually onboarded and which arrived
 * through the partner. That matters for who to chase about payment and for
 * reconciling what the partner says they sold.
 *
 * The marker is `payment_reference`: `provisionSubscription` writes
 * `builders-node:<their ref>` (backend integrations.service.ts) precisely so
 * the call is idempotent, which makes it a reliable origin flag too — there is
 * no dedicated column to add.
 */

const BN_PREFIX = "builders-node:";

export type SaleOrigin =
  | { key: "builders_node"; label: string; externalRef: string }
  | { key: "platform"; label: null; externalRef: null };

export function saleOrigin(paymentReference: unknown): SaleOrigin {
  if (typeof paymentReference !== "string" || !paymentReference.startsWith(BN_PREFIX)) {
    return { key: "platform", label: null, externalRef: null };
  }
  // Strip repeatedly: the partner sends refs that are sometimes already
  // prefixed, so production holds `builders-node:builders-node:<uuid>`. Showing
  // that back would be noise.
  let ref = paymentReference;
  while (ref.startsWith(BN_PREFIX)) ref = ref.slice(BN_PREFIX.length);
  return { key: "builders_node", label: "Builders Node", externalRef: ref };
}

/** True when this sale arrived through the partner rather than our checkout. */
export function isFromBuildersNode(paymentReference: unknown): boolean {
  return saleOrigin(paymentReference).key === "builders_node";
}

/**
 * A single booking says where it came from directly — `cleaning_bookings.source`
 * is written as `builders_node` by the partner endpoint. Unlike a subscription
 * there's no payment reference to read, because the visit draws on a
 * subscription that was paid for separately.
 *
 * Everything else in that column describes how WE made the row
 * (`admin_manual`, `admin_bulk`, `user_recurring_schedule`, …), so only the
 * partner value is worth surfacing.
 */
export function bookingOrigin(source: unknown): SaleOrigin {
  return source === "builders_node"
    ? { key: "builders_node", label: "Builders Node", externalRef: "" }
    : { key: "platform", label: null, externalRef: null };
}

/**
 * Renders nothing for a platform sale — the common case shouldn't carry a
 * badge saying "normal".
 *
 * Pass whichever markers the row has — `source` for a cleaning visit,
 * `paymentReference` for anything that was paid for. Either one is enough:
 * food and rental have no `source` column at all, so keying only on that made
 * the badge unreachable on the deliveries view; and a cleaning visit generated
 * by the recurring scheduler carries `source: "user_recurring_schedule"` even
 * though the subscription behind it came from the partner.
 */
export function SaleOriginBadge({
  paymentReference,
  source,
  className,
}: {
  paymentReference?: unknown;
  source?: unknown;
  className?: string;
}) {
  const bySource = bookingOrigin(source);
  const byRef = saleOrigin(paymentReference);
  const origin = bySource.key === "builders_node" ? bySource : byRef;
  if (origin.key !== "builders_node") return null;

  return (
    <span
      title={
        origin.externalRef
          ? `Provisioned by Builders Node · ref ${origin.externalRef}`
          : "Booked through Builders Node"
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5",
        "text-[10px] font-bold uppercase tracking-wide text-sky-400",
        className,
      )}
    >
      <Network className="h-3 w-3" />
      {origin.label}
    </span>
  );
}
