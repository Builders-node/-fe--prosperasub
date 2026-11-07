import { Fragment, useState } from "react";
import { Layers, MoreHorizontal, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Options & prices — what a customer can choose inside one plan, and what
 * each combination costs.
 *
 * It used to be three disconnected things: chips with arrows and crosses, a
 * free-floating "Name it" field, and a flat list of every combination
 * ("Every day · 1", "mon-fri · 1"…) that grew as a product of the choices and
 * could show the same row twice when two values slugged to the same key. Now:
 *
 *  - empty: one card that says what options are FOR, with one-tap starters;
 *  - a choice is a card: its name, its values as chips, and "add a value";
 *  - prices follow the shape: one choice → a list, two → a grid (rows × columns),
 *    more → a list; an empty cell means "not offered";
 *  - "fill empty cells" for the common case where most prices are the same.
 *
 * Keys are unique by construction (`uniqueKey`), whatever the label — Cyrillic,
 * an emoji or a repeated word used to produce "" or a collision.
 */

export interface DraftOption { key: string; label: string }
export interface DraftGroup { id?: string; key: string; label: string; options: DraftOption[] }

const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** A readable key that no sibling already holds. */
export function uniqueKey(label: string, taken: string[], fallback: string): string {
  const base = slug(label) || fallback;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export const comboKey = (groups: DraftGroup[], combo: Record<string, string>) =>
  groups.map((g) => `${g.key}=${combo[g.key] ?? ""}`).join("|");

const STARTERS: Array<{ label: string; values: string[] }> = [
  { label: "Size", values: ["Small", "Medium", "Large"] },
  { label: "Days per week", values: ["3 days", "5 days", "7 days"] },
  { label: "People", values: ["1 person", "2 people", "Family"] },
];

const cents = (text: string) => {
  const n = Number(String(text).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export function OptionsEditor({ groups, setGroups, prices, setPrices, combos, perLabel }: {
  groups: DraftGroup[];
  setGroups: (fn: (gs: DraftGroup[]) => DraftGroup[]) => void;
  prices: Record<string, string>;
  setPrices: (fn: (p: Record<string, string>) => Record<string, string>) => void;
  /** Every combination the choices allow (from the editor — it saves them). */
  combos: Array<Record<string, string>>;
  /** "month", "week"… or null for a one-time purchase. */
  perLabel: string | null;
}) {
  const [opened, setOpened] = useState(groups.length > 0);
  const [fill, setFill] = useState("");

  const addGroup = (label: string, values: string[] = []) => {
    setGroups((gs) => {
      const key = uniqueKey(label, gs.map((g) => g.key), `choice_${gs.length + 1}`);
      const options: DraftOption[] = [];
      values.forEach((v, i) => options.push({ key: uniqueKey(v, options.map((o) => o.key), `value_${i + 1}`), label: v }));
      return [...gs, { key, label, options }];
    });
    setOpened(true);
  };
  const patchGroup = (gi: number, fn: (g: DraftGroup) => DraftGroup) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? fn(g) : g)));
  const move = (gi: number, step: -1 | 1) => setGroups((gs) => {
    const next = [...gs];
    const j = gi + step;
    if (j < 0 || j >= next.length) return gs;
    [next[gi], next[j]] = [next[j], next[gi]];
    return next;
  });

  // ── Empty: say what this is for ──
  if (!opened && groups.length === 0) {
    return (
      <section className="rounded-radius-lg bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-inset"><Layers className="h-5 w-5 text-muted-foreground" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-title font-semibold text-foreground">Options & prices</p>
            <p className="mt-0.5 text-body text-muted-foreground">
              Right now this plan has one price. Add options if customers choose something that changes the price — a size, how many days a week, how many people.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <Button key={s.label} size="sm" variant="secondary" onClick={() => addGroup(s.label, s.values)}>
              <Plus /> {s.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setOpened(true)}>Something else</Button>
        </div>
      </section>
    );
  }

  const unvalued = groups.filter((g) => g.options.length === 0);
  const pricedCount = combos.filter((c) => cents(prices[comboKey(groups, c)] ?? "") > 0).length;
  const fromCents = combos.reduce((m, c) => {
    const v = cents(prices[comboKey(groups, c)] ?? "");
    return v > 0 && (m === 0 || v < m) ? v : m;
  }, 0);
  const priceInput = (combo: Record<string, string>, aria: string) => {
    const k = comboKey(groups, combo);
    return (
      <Input
        inputSize="sm" inputMode="decimal" aria-label={aria}
        value={prices[k] ?? ""}
        onChange={(e) => setPrices((p) => ({ ...p, [k]: e.target.value }))}
        placeholder="Not offered"
        className="bg-card text-right tabular-nums placeholder:text-left placeholder:text-meta"
        leftIcon={<span className="text-meta text-muted-foreground">$</span>}
      />
    );
  };
  const labelOf = (g: DraftGroup, key: string) => g.options.find((o) => o.key === key)?.label ?? key;

  return (
    <section className="space-y-4 rounded-radius-lg bg-card p-4">
      <div>
        <p className="text-title font-semibold text-foreground">Options & prices</p>
        <p className="mt-0.5 text-body text-muted-foreground">
          What the customer picks before paying. Each combination gets its own price.
        </p>
      </div>

      {/* ── 1. The choices ── */}
      <div className="space-y-2">
        <p className="text-meta font-semibold text-muted-foreground">1 · What can the customer choose?</p>
        {groups.map((g, gi) => (
          <div key={g.key} className="rounded-radius-md bg-inset p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="Choice name"
                  value={g.label}
                  onChange={(e) => patchGroup(gi, (x) => ({ ...x, label: e.target.value }))}
                  placeholder="Choice name — e.g. Size"
                  inputSize="sm" className="w-full bg-card font-semibold"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`${g.label || "Choice"} actions`}><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={gi === 0} onSelect={() => move(gi, -1)}>Show first{gi > 0 ? "" : " (already)"}</DropdownMenuItem>
                  <DropdownMenuItem disabled={gi === groups.length - 1} onSelect={() => move(gi, 1)}>Show later</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-negative" onSelect={() => setGroups((gs) => gs.filter((_, i) => i !== gi))}>
                    Remove this choice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {g.options.map((o, oi) => (
                <span key={o.key} className="inline-flex h-9 items-center gap-1 rounded-full bg-card pl-3.5 pr-1.5 text-body font-semibold text-foreground">
                  {o.label}
                  <button
                    type="button" aria-label={`Remove ${o.label}`}
                    onClick={() => patchGroup(gi, (x) => ({ ...x, options: x.options.filter((_, j) => j !== oi) }))}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <AddValue
                placeholder={g.options.length ? "Add another" : "Add a value — e.g. Large"}
                onAdd={(label) => patchGroup(gi, (x) => ({
                  ...x,
                  options: x.options.some((o) => o.label.toLowerCase() === label.toLowerCase())
                    ? x.options
                    : [...x.options, { key: uniqueKey(label, x.options.map((o) => o.key), `value_${x.options.length + 1}`), label }],
                }))}
              />
            </div>
            {g.options.length === 0 && (
              <p className="mt-2 text-meta text-attention">Add at least one value, then press Enter.</p>
            )}
          </div>
        ))}
        <NewChoice onAdd={(label) => addGroup(label)} first={groups.length === 0} />
      </div>

      {/* ── 2. The prices ── */}
      {groups.length > 0 && (
        <div className="space-y-2">
          <p className="text-meta font-semibold text-muted-foreground">
            2 · Prices{perLabel ? ` per ${perLabel}` : ""}
          </p>

          {unvalued.length > 0 ? (
            <p className="rounded-radius-md bg-inset p-3 text-body text-muted-foreground">
              Give {unvalued.map((g) => `“${g.label || "the new choice"}”`).join(" and ")} at least one value to set prices.
            </p>
          ) : groups.length === 2 ? (
            // Two choices: a grid (rows × columns) where there is room; on a
            // phone, the same thing grouped by the first choice.
            <>
            <div className="space-y-2 md:hidden">
              {groups[0].options.map((r) => (
                <div key={r.key} className="rounded-radius-md bg-inset p-2">
                  <p className="px-1 pb-1.5 text-body font-semibold text-foreground">{r.label}</p>
                  <div className="space-y-1.5">
                    {groups[1].options.map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-3 pl-1">
                        <span className="min-w-0 truncate text-body text-muted-foreground">{c.label}</span>
                        <span className="w-36 shrink-0">{priceInput({ [groups[0].key]: r.key, [groups[1].key]: c.key }, `${r.label}, ${c.label}`)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-radius-md bg-inset p-2 md:block">
              <div className="grid min-w-max gap-1.5" style={{ gridTemplateColumns: `minmax(96px,auto) repeat(${groups[1].options.length}, minmax(120px,1fr))` }}>
                <span />
                {groups[1].options.map((c) => (
                  <span key={c.key} className="truncate px-1 text-center text-meta font-semibold text-muted-foreground">{c.label}</span>
                ))}
                {groups[0].options.map((r) => (
                  <Fragment key={r.key}>
                    <span className="flex items-center truncate pr-2 text-body font-semibold text-foreground">{r.label}</span>
                    {groups[1].options.map((c) => (
                      <span key={c.key}>{priceInput({ [groups[0].key]: r.key, [groups[1].key]: c.key }, `${r.label}, ${c.label}`)}</span>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
            </>
          ) : (
            <div className="space-y-1">
              {combos.map((combo) => {
                const label = groups.map((g) => labelOf(g, combo[g.key])).join(" · ");
                return (
                  <div key={comboKey(groups, combo)} className="flex items-center justify-between gap-3 rounded-radius-md bg-inset py-1.5 pl-3 pr-1.5">
                    <span className="min-w-0 truncate text-body font-semibold text-foreground">{label}</span>
                    <span className="w-36 shrink-0">{priceInput(combo, label)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {unvalued.length === 0 && combos.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input inputSize="sm" inputMode="decimal" value={fill} onChange={(e) => setFill(e.target.value)} placeholder="Same price"
                leftIcon={<span className="text-meta text-muted-foreground">$</span>} wrapperClassName="w-36" aria-label="Price for empty cells" />
              <Button size="sm" variant="secondary" disabled={!cents(fill)}
                onClick={() => {
                  setPrices((p) => {
                    const next = { ...p };
                    combos.forEach((c) => { const k = comboKey(groups, c); if (!cents(next[k] ?? "")) next[k] = fill; });
                    return next;
                  });
                  setFill("");
                }}>
                Fill empty
              </Button>
            </div>
          )}

          {unvalued.length === 0 && (
            <p className="text-meta text-muted-foreground">
              {pricedCount === 0
                ? "Nothing is on sale yet — enter at least one price."
                : `${pricedCount} of ${combos.length} on sale · customers see “from ${formatUSD(fromCents)}”.`}{" "}
              An empty price means you don't offer that combination; anyone already subscribed to it keeps their plan.
            </p>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <button
          type="button"
          onClick={() => { if (window.confirm("Remove all options? The plan goes back to one price.")) { setGroups(() => []); setOpened(false); } }}
          className="text-meta font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Remove all options — back to one price
        </button>
      )}
    </section>
  );
}

function NewChoice({ onAdd, first }: { onAdd: (label: string) => void; first: boolean }) {
  const [label, setLabel] = useState("");
  const submit = () => { if (label.trim()) { onAdd(label.trim()); setLabel(""); } };
  return (
    <div className={cn("flex items-center gap-2 rounded-radius-md p-3", first ? "bg-inset" : "border border-dashed border-border")}>
      <div className="min-w-0 flex-1">
        <Input
          value={label} onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={first ? "Name the choice — e.g. Size, Days per week" : "Another choice — e.g. Delivery time"}
          inputSize="sm" className="w-full bg-card" aria-label="New choice name"
        />
      </div>
      <Button size="sm" variant="secondary" disabled={!label.trim()} onClick={submit}><Plus /> Add</Button>
    </div>
  );
}

function AddValue({ onAdd, placeholder }: { onAdd: (label: string) => void; placeholder: string }) {
  const [value, setValue] = useState("");
  const submit = () => { if (value.trim()) { onAdd(value.trim()); setValue(""); } };
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder={placeholder} inputSize="sm" className="w-56 max-w-full bg-card" aria-label="New value"
      />
      <Button variant="ghost" size="icon" disabled={!value.trim()} onClick={submit} aria-label="Add value"><Plus className="h-4 w-4" /></Button>
    </span>
  );
}
