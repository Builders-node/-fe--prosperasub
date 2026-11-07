import type { ComponentType, ReactNode } from "react";

/**
 * One tab of a provider's workspace.
 *
 * This type is all that survived of `ProviderPortalShell`, the per-service
 * portal frame the universal workspace replaced; every caller only ever
 * imported the type.
 */
export interface PortalTab<T> {
  /** Stable tab key. */
  value: string;
  /** Full label shown on desktop. */
  label: string;
  /** Optional shorter label used on mobile — falls back to `label`. */
  mobileLabel?: string;
  icon: ComponentType<{ className?: string }>;
  /** Only owners see this tab (e.g. Staff). */
  ownerOnly?: boolean;
  /** Rendered inside <TabsContent>. */
  render: (provider: T, isOwner: boolean) => ReactNode;
}
