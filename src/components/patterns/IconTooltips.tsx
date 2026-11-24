import { useEffect, useRef, useState } from "react";

/**
 * One tooltip for every icon-only button on the site.
 *
 * A button that is only a picture (a heart, a share arrow, a bell, a close
 * cross) tells a mouse user nothing until they press it. Wrapping each of the
 * dozens of them in a Radix tooltip would be a hundred edits and the next one
 * would be forgotten; instead this listens once, at the root, and shows the
 * button's own name — `data-tooltip` when it has a short one, else its
 * `aria-label` or `title` — over any button or link that has no text of its
 * own. Mouse only: on a touch screen a long-press already means something.
 */
const SELECTOR = "button, a[href], [role='button']";
const DELAY = 350;

function labelOf(el: HTMLElement): string | null {
  const own = el.getAttribute("data-tooltip") ?? el.getAttribute("aria-label") ?? el.getAttribute("data-title");
  if (!own || !own.trim()) return null;
  // Only icon buttons: anything with words of its own already says what it does.
  if ((el.textContent ?? "").replace(/\s+/g, "").length > 0) return null;
  return own.trim();
}

export function IconTooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      const el = current.current;
      // Give a native title back once we are done with it.
      if (el?.dataset.title && !el.getAttribute("title")) el.setAttribute("title", el.dataset.title);
      current.current = null;
      setTip(null);
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el === current.current) return;
      clear();
      if (!el) return;
      // A native title would draw a second, grey tooltip on top of ours.
      const title = el.getAttribute("title");
      if (title) { el.dataset.title = title; el.removeAttribute("title"); }
      const text = labelOf(el);
      if (!text) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, DELAY);
    };

    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerdown", clear, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerdown", clear, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-[240px] rounded-radius-sm bg-foreground px-2.5 py-1 text-meta font-medium text-background shadow-figma animate-in fade-in-0 zoom-in-95"
      style={{
        left: Math.min(Math.max(tip.x, 8), window.innerWidth - 8),
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
      }}
    >
      {tip.text}
    </div>
  );
}
