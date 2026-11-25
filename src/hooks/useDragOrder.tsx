import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drag-to-reorder by pointer events, so it works with a finger as well as a
 * mouse. "rows": a vertical list moved by a handle. "chips": wrapped chips,
 * dragged by the chip itself with a mouse (a finger on a chip just opens it),
 * placed at the chip nearest the pointer. Arrow keys move one place.
 */
export function useDragOrder(order: string[], setOrder: (next: string[]) => void, commit: (next: string[]) => void, mode: "rows" | "chips") {
  const listRef = useRef<HTMLElement>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const live = useRef<string[]>(order);
  live.current = order;
  const startOrder = useRef<string[]>([]);
  const press = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);

  const move = (key: string, to: number) => {
    const from = live.current.indexOf(key);
    if (from < 0 || to === from || to < 0 || to >= live.current.length) return live.current;
    const next = [...live.current];
    next.splice(from, 1);
    next.splice(to, 0, key);
    setOrder(next);
    live.current = next;
    return next;
  };

  const targetIndex = (key: string, x: number, y: number) => {
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>(":scope > [data-drag-key]") ?? []);
    if (mode === "rows") {
      let to = 0;
      els.forEach((el) => {
        if (el.dataset.dragKey === key) return;
        const r = el.getBoundingClientRect();
        if (y > r.top + r.height / 2) to += 1;
      });
      return to;
    }
    let best = live.current.indexOf(key);
    let dist = Infinity;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < dist) { dist = d; best = live.current.indexOf(el.dataset.dragKey!); }
    });
    return best;
  };

  const finish = () => {
    setDraggingKey(null);
    if (startOrder.current.join() !== live.current.join()) commit(live.current);
  };

  const keyMove = (key: string, e: React.KeyboardEvent) => {
    const back = mode === "rows" ? "ArrowUp" : "ArrowLeft";
    const fwd = mode === "rows" ? "ArrowDown" : "ArrowRight";
    if (e.key !== back && e.key !== fwd) return;
    e.preventDefault();
    const before = live.current;
    const next = move(key, before.indexOf(key) + (e.key === back ? -1 : 1));
    if (next.join() !== before.join()) commit(next);
  };

  /** Rows: the handle starts a drag at once. */
  const handleProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startOrder.current = live.current;
      setDraggingKey(key);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (draggingKey !== key) return;
      move(key, targetIndex(key, e.clientX, e.clientY));
    },
    onPointerUp: () => { if (draggingKey === key) finish(); },
    onPointerCancel: () => { setDraggingKey(null); setOrder(startOrder.current); },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => keyMove(key, e),
  });

  /** Chips: a click opens, a mouse drag past 5px reorders instead. */
  const chipProps = (key: string, open: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || e.pointerType !== "mouse") return;
      press.current = { key, x: e.clientX, y: e.clientY, moved: false };
      startOrder.current = live.current;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.key !== key) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      if (!p.moved) { p.moved = true; setDraggingKey(key); }
      move(key, targetIndex(key, e.clientX, e.clientY));
    },
    onPointerUp: () => {
      const p = press.current;
      if (p?.key === key && p.moved) finish();
    },
    onClick: () => {
      const p = press.current;
      press.current = null;
      if (p?.key === key && p.moved) return; // that was a drag, not a click
      open();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => keyMove(key, e),
  });

  return { listRef, draggingKey, handleProps, chipProps };
}

/**
 * The grip every reorderable admin list uses (Services, Collections): drag it,
 * or focus it and press the arrow keys.
 */
export function DragHandle({ label, className, ...props }: { label: string; className?: string } & ReturnType<ReturnType<typeof useDragOrder>["handleProps"]>) {
  return (
    <button
      type="button"
      aria-label={`Move ${label}. Use arrow keys.`}
      title="Drag to reorder"
      {...props}
      className={cn("flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-[6px] text-muted-foreground/60 hover:bg-inset hover:text-foreground active:cursor-grabbing", className)}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
