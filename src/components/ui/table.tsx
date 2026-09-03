import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one table in this app.
 *
 * There were two ways to build one — this primitive and a hand-rolled
 * `<table>` — and the hand-rolled ones each picked their own text size, their
 * own wrapper and their own idea of whether a phone could reach the right-hand
 * columns. Everything is this now, so a table looks like a table.
 *
 * Written to DESIGN.md: the semantic type roles rather than ad-hoc sizes
 * (`caption` for a header cell, `body` for a value), a card for a surface, and
 * hairline row dividers — which the design does sanction; what it forbids is a
 * border used to make a whole component feel separated (§2, and `--border` is
 * described there as exactly this).
 *
 * The horizontal scroll lives here rather than at each call site, because
 * forgetting it is invisible on a laptop and makes columns unreachable on a
 * phone. A wide table should still pass `min-w-[...]` so columns keep their
 * width instead of crushing.
 */

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto rounded-radius-md bg-card">
      <table ref={ref} className={cn("w-full caption-bottom text-body", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("bg-muted/40 [&_tr]:border-0", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("bg-muted/40 font-semibold [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/60 transition-colors last:border-0",
        "data-[state=selected]:bg-muted hover:bg-muted/40",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-11 whitespace-nowrap px-space-4 text-left align-middle text-caption text-muted-foreground",
        "[&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("px-space-4 py-space-3 align-middle [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-space-4 text-caption text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
