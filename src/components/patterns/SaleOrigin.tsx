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
 * Renders nothing for a platform sale — the common case shouldn't carry a
 * badge saying "normal".
 */
export function SaleOriginBadge({
  paymentReference,
  className,
}: {
  paymentReference: unknown;
  className?: string;
}) {
  const origin = saleOrigin(paymentReference);
  if (origin.key !== "builders_node") return null;

  return (
    <span
      title={`Provisioned by Builders Node · ref ${origin.externalRef}`}
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
