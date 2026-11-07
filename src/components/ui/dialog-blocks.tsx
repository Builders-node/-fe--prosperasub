import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dialogs are built from blocks, like every page (DESIGN.md §6, Dialogs).
 *
 * The sheet itself is the page-grey surface; the title sits on it, the
 * content sits on white cards, and the buttons sit at the bottom on the grey —
 * the same layering the account and workspace pages use, instead of a flat
 * panel with hairlines between header, body and footer.
 *
 * A dialog does not have to do anything to get this: DialogContent and
 * SheetContent hand their children to `groupIntoBlocks`, which keeps the
 * chrome (header, footer, explicit blocks) as it is and puts every run of
 * other content on one card. A dialog that wants several cards — a long form
 * with sections — says so with <DialogBlock>.
 */
export function DialogBlock({
  className, title, children,
}: { className?: string; title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section data-dialog-block="" className={cn("min-w-0 space-y-4 rounded-radius-lg bg-card p-4", className)}>
      {title != null && <h3 className="text-title font-semibold text-foreground">{title}</h3>}
      {children}
    </section>
  );
}

/** Flatten fragments so a `<>…</>` of fields groups like the fields themselves. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.forEach(children, (c) => {
    if (c == null || c === false || c === true || c === "") return;
    if (React.isValidElement(c) && c.type === React.Fragment) {
      out.push(...flatten((c.props as { children?: React.ReactNode }).children));
    } else out.push(c);
  });
  return out;
}

export function groupIntoBlocks(
  children: React.ReactNode,
  chrome: ReadonlySet<unknown>,
  blockClassName?: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let run: React.ReactNode[] = [];
  const flush = () => {
    if (!run.length) return;
    out.push(<DialogBlock key={`b${out.length}`} className={blockClassName}>{run}</DialogBlock>);
    run = [];
  };
  for (const c of flatten(children)) {
    const el = React.isValidElement(c) ? c : null;
    const cls = el && typeof (el.props as { className?: unknown }).className === "string"
      ? (el.props as { className: string }).className : "";
    // Already a card — a caller's own block — stays one; no card inside a card.
    const isCard = /\bbg-card\b/.test(cls) && /\brounded-/.test(cls);
    const isChrome = !!el && (chrome.has(el.type) || el.type === DialogBlock || isCard);
    if (isChrome) { flush(); out.push(c); } else run.push(c);
  }
  flush();
  return out;
}

/** On a touch screen, opening a dialog must not raise the keyboard over half of it. */
export function preventTouchAutoFocus<E extends Event>(handler?: (e: E) => void) {
  return (e: E) => {
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) e.preventDefault();
    handler?.(e);
  };
}
