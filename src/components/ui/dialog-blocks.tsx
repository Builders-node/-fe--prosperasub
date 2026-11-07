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

type AnyEl = React.ReactElement<{ className?: unknown; children?: React.ReactNode }>;
const classOf = (el: AnyEl) => (typeof el.props.className === "string" ? el.props.className : "");

/**
 * A wrapper that only spaces its children (`<div className="space-y-4">`) —
 * opening it lets its parts be grouped into blocks. Anything with a surface,
 * padding or its own layout intent (bg-, p-, border, grid-cols, flex-row…)
 * is content and stays whole.
 */
const SPACING_ONLY = /^(space-y-\S+|gap-\S+|grid|flex|flex-col|w-full|min-w-0|mt-\S+|pt-\S+|pb-\S+|mb-\S+)$/;
function isSpacingWrapper(el: AnyEl): boolean {
  if (el.type !== "div" && el.type !== "section" && el.type !== "form") return false;
  if (el.type === "form") return false; // a form's submit wiring needs its children inside it
  const cls = classOf(el).trim();
  if (!cls) return el.type === "section" || el.type === "div";
  return cls.split(/\s+/).every((t) => SPACING_ONLY.test(t));
}

/**
 * A section's name: an h2–h4, or the small-caps label the older dialogs drew
 * by hand (`text-xs font-bold uppercase tracking-wider`), or a component
 * called *SectionTitle / *SectionLabel.
 */
function isHeading(el: AnyEl): boolean {
  if (el.type === "h2" || el.type === "h3" || el.type === "h4") return true;
  if (typeof el.type === "function" && /Section(Title|Label|Heading)$/.test((el.type as { name?: string }).name ?? "")) return true;
  const cls = classOf(el);
  return (el.type === "p" || el.type === "span" || el.type === "div") && /\buppercase\b/.test(cls) && /\btracking-/.test(cls)
    && React.Children.count(el.props.children) === 1 && typeof el.props.children === "string";
}

/** Flatten fragments and spacing-only wrappers, so their parts group like loose children. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.forEach(children, (c) => {
    if (c == null || c === false || c === true || c === "") return;
    if (React.isValidElement(c)) {
      const el = c as AnyEl;
      if (el.type === React.Fragment || isSpacingWrapper(el)) {
        // Headings inside are found by groupIntoBlocks, wherever they sit.
        out.push(...flatten(el.props.children));
        return;
      }
    }
    out.push(c);
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
  let runTitle: React.ReactNode = undefined;
  const flush = () => {
    if (!run.length && runTitle == null) return;
    out.push(<DialogBlock key={`b${out.length}`} className={blockClassName} title={runTitle}>{run}</DialogBlock>);
    run = []; runTitle = undefined;
  };
  for (const c of flatten(children)) {
    const el = React.isValidElement(c) ? (c as AnyEl) : null;
    const cls = el ? classOf(el) : "";
    // Already a card — a caller's own block — stays one; no card inside a card.
    const isCard = /\bbg-card\b/.test(cls) && /\brounded-/.test(cls);
    const isChrome = !!el && (chrome.has(el.type) || el.type === DialogBlock || isCard);
    if (isChrome) { flush(); out.push(c); continue; }
    // A heading between loose parts starts the next block and names it.
    if (el && isHeading(el)) { flush(); runTitle = el.props.children; continue; }
    run.push(c);
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
