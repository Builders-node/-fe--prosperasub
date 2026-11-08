import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type SortDir = "asc" | "desc";
export type SortValue = string | number | boolean | Date | null | undefined;
export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

export interface SortState<K extends string> {
  key: K | null;
  dir: SortDir;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const isEmpty = (v: SortValue) => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

const asComparable = (v: SortValue): string | number => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "boolean") return v ? 1 : 0;
  return v as string | number;
};

/** a vs b ascending; empties are handled by the caller (always last). */
export function compareValues(a: SortValue, b: SortValue): number {
  const x = asComparable(a);
  const y = asComparable(b);
  if (typeof x === "number" && typeof y === "number") return x - y;
  return collator.compare(String(x), String(y));
}

/** Sort a copy; empties last whichever the direction, ties keep their order. */
export function sortRows<T>(rows: T[], get: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const ae = isEmpty(a.v);
      const be = isEmpty(b.v);
      if (ae || be) return ae && be ? a.i - b.i : ae ? 1 : -1;
      return compareValues(a.v, b.v) * sign || a.i - b.i;
    })
    .map((x) => x.row);
}

/**
 * Click-to-sort for any table: a column's header toggles it, a second click
 * flips the direction. Numbers and dates start descending (largest, newest
 * first — what an admin looks for), text starts A→Z.
 *
 * The choice lives in the URL (`?sort=joined` / `?sort=-joined`), so a reload,
 * a shared link or Back keeps it. A page with two tables passes its own
 * `param` for the second one.
 *
 * Without a choice the rows keep the order the caller gave them — which is the
 * page's own default sort, so nothing changes until someone clicks.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: SortAccessors<T, K>,
  opts: { param?: string; initial?: { key: K; dir: SortDir } } = {},
) {
  const param = opts.param ?? "sort";
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);

  const state: SortState<K> = useMemo(() => {
    if (raw) {
      const desc = raw.startsWith("-");
      const key = (desc ? raw.slice(1) : raw) as K;
      if (key in accessors) return { key, dir: desc ? "desc" : "asc" };
    }
    return opts.initial ? { key: opts.initial.key, dir: opts.initial.dir } : { key: null, dir: "asc" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, opts.initial?.key, opts.initial?.dir]);

  const sorted = useMemo(
    () => (state.key ? sortRows(rows, accessors[state.key], state.dir) : rows),
    // accessors are usually inline; rows + state decide the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, state.key, state.dir],
  );

  const toggle = useCallback((key: K) => {
    let dir: SortDir;
    if (state.key === key) {
      dir = state.dir === "asc" ? "desc" : "asc";
    } else {
      const sample = rows.map(accessors[key]).find((v) => !isEmpty(v));
      dir = typeof sample === "number" || sample instanceof Date ? "desc" : "asc";
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(param, dir === "desc" ? `-${key}` : key);
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.key, state.dir, rows, param, setParams]);

  /** Spread onto <SortHeader> (and its aria-sort onto the cell). */
  const headerProps = useCallback((key: K) => ({
    active: state.key === key,
    dir: state.dir,
    onSort: () => toggle(key),
  }), [state.key, state.dir, toggle]);

  const ariaSort = useCallback((key: K): "ascending" | "descending" | "none" =>
    state.key === key ? (state.dir === "asc" ? "ascending" : "descending") : "none",
  [state.key, state.dir]);

  return { sorted, sortKey: state.key, sortDir: state.dir, toggle, headerProps, ariaSort };
}
