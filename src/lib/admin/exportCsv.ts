/**
 * Take what is on screen away with you.
 *
 * There was no export anywhere in the admin panel, so reconciling with a
 * provider or handing anything to an accountant meant copying a table off the
 * screen by hand.
 *
 * It deliberately exports the FILTERED rows rather than the whole table: the
 * admin has already said what they are looking at, and an export that ignores
 * that is a second, silent query whose result nobody asked for.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Excel and Numbers both read a leading `=`, `+`, `-` or `@` as the start of a
 * formula, so a customer who calls themselves `=cmd|…` becomes an instruction
 * on somebody's machine. Prefixing with a quote makes it text again.
 */
const escapeCell = (raw: string | number | null | undefined): string => {
  const s = raw === null || raw === undefined ? "" : String(raw);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
};

export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(","));
  // CRLF and a BOM: without them Excel opens a UTF-8 file as mojibake, and
  // every name on this platform has an accent in it somewhere.
  return "﻿" + [head, ...body].join("\r\n");
}

export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: Array<CsvColumn<T>>,
): void {
  const blob = new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in Safari; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `orders-2026-09-10.csv` — the day it was taken is half of what it is. */
export const datedFilename = (stem: string): string =>
  `${stem}-${new Date().toISOString().slice(0, 10)}.csv`;
