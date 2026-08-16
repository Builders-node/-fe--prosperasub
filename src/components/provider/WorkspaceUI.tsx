import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The workspace's furniture, in the redesign's language.
 *
 * Everything below the tabs was written before it and shows: headings in
 * `font-black` floating on the page background, micro-labels in 11px uppercase
 * with wide tracking, values in another weight again. The header three
 * centimetres above them is 24 semibold over 16 regular on a 24-radius card.
 * Both looks are defensible; having both on one screen is not.
 *
 * So the ramp is fixed here and imported, rather than retyped per tab:
 *   24/600  a page's own name          — the header card
 *   20/600  a section's name           — WorkspaceSection
 *   16/400  a label, a body line       — muted for labels
 *   14/400  a hint under a control
 * No uppercase, no black, no tracking games.
 */

/** A surface: 24 of radius, 16 of padding, the card fill. */
export function WorkspaceCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-radius-lg bg-card p-4 tracking-[-0.02em]", className)}>
      {children}
    </section>
  );
}

/**
 * A named section. The title sits INSIDE the card with its content rather
 * than floating above it — a heading on the page background belonged to the
 * old look and left every tab starting with an orphaned line of text.
 */
export function WorkspaceSection({
  title, subtitle, action, className, bodyClassName, children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned control on the title row — an Edit or Add button. */
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <WorkspaceCard className={className}>
      {/* Title and its control share one row; the subtitle runs the full width
          under both. Nesting the subtitle beside the button pushed the button
          onto a line of its own at 375, where it read as a third heading. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-[20px] font-semibold leading-[26px] text-foreground">{title}</h2>
        {action}
      </div>
      {subtitle && (
        <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">{subtitle}</p>
      )}
      {children != null && <div className={cn("mt-4", bodyClassName)}>{children}</div>}
    </WorkspaceCard>
  );
}

/** One figure on the inset fill: 16 of label over 24 of number. */
export function WorkspaceStat({ label, value, hint }: {
  label: string; value: string; hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-radius-md bg-inset p-3">
      <span className="truncate text-[16px] leading-[22px] text-muted-foreground">{label}</span>
      <span className="mt-1 text-[24px] font-semibold leading-[29px] tabular-nums text-foreground">{value}</span>
      {hint && <span className="mt-1 text-[14px] leading-[18px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * A line of the business's own details: what it is, then what it says.
 *
 * The icon sits on the inset fill at the same 16 radius the stat tiles use,
 * replacing the round grey badge — a circle was the only round thing left on
 * these screens.
 */
export function WorkspaceRow({ icon, label, children }: {
  icon?: ReactNode; label: string; children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-inset text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[16px] leading-[22px] text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-[16px] leading-[22px] text-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Nothing here yet, said in the same voice as everything else. */
export function WorkspaceEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[16px] leading-[22px] text-muted-foreground">{children}</p>;
}
