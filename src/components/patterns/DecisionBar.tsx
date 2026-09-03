import { ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The CTA bar a decision page ends with — pinned to the viewport bottom on a
 * phone, in the page flow on a desktop.
 *
 * It publishes its own measured height as `--decision-bar-h`, the same
 * contract CheckoutStickyFooter established: the bar floats over the page, so
 * the page must end above it, and the padding that guaranteed that used to be
 * a guessed constant (`pb-28` here, `pb-32` there). A guessed constant is
 * wrong the moment the bar grows — a "from" price line, a second row, a home
 * indicator — and the last content row quietly slides underneath. Consumers
 * pad with `pb-[calc(var(--decision-bar-h,96px)+16px)] md:pb-*`.
 */
export function DecisionBar({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty("--decision-bar-h", `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--decision-bar-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("fixed bottom-0 left-0 right-0 z-40 rounded-t-radius-lg bg-card md:static", className)}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {children}
    </div>
  );
}
