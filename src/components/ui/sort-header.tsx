import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table/useTableSort";

/**
 * A column header you can click to sort by. Goes inside a <TableHead> or a
 * grid header cell; pair it with `useTableSort(...).headerProps(key)`.
 *
 * The arrow says the current direction on the active column; the others show a
 * faint up/down so it is clear every header can be clicked.
 */
export function SortHeader({
  children, active, dir, onSort, align = "left", className,
}: {
  children: ReactNode;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "group inline-flex items-center gap-1 rounded-sm font-inherit transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        active ? "text-foreground" : "text-inherit",
        align === "right" && "ml-auto flex-row-reverse",
        align === "center" && "mx-auto",
        className,
      )}
      aria-label={`Sort by ${typeof children === "string" ? children : "this column"}${active ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}
    >
      <span>{children}</span>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "opacity-100" : "opacity-40 group-hover:opacity-70")} />
    </button>
  );
}
