import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Grouping several plans into one offer the customer picks options on.
 *
 * This editor deliberately does NOT edit prices. A variant's price is its
 * plan's price, and that plan is still edited where it always was — the meal
 * plan editor, the cleaning plan editor. The mirror trigger carries the change
 * into the variant and the offer's "from" price recomputes itself. A second
 * price field here would be a second source of truth for the same number, and
 * the two would disagree within a week.
 *
 * What it does is the part that is impossible anywhere else: name the axes a
 * plan varies along, and say which plan is which combination.
 */

interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
  status: string;
  parent_plan_id: string | null;
  option_keys: Record<string, string> | null;
  source_plan_id: string | null;
}

interface DraftOption { key: string; label: string }
interface DraftGroup { id?: string; key: string; label: string; options: DraftOption[] }

/** "Meals per day" → "meals_per_day". Stable, readable, and what a variant stores. */
const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function PlanOptionsEditor({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const KEY = ["plan-options-editor", providerId] as const;

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: plans, error } = await supabaseDb
        .from("provider_plans")
        .select("id, name, price_cents, status, parent_plan_id, option_keys, source_plan_id")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const rows = (plans ?? []) as PlanRow[];
      const offerIds = rows.filter((r) => !r.parent_plan_id).map((r) => r.id);
      const { data: groups } = offerIds.length
        ? await supabaseDb.from("plan_option_groups")
            .select("id, plan_id, key, label, sort_order")
            .in("plan_id", offerIds).order("sort_order", { ascending: true })
        : { data: [] as any[] };
      const groupIds = (groups ?? []).map((g: any) => g.id);
      const { data: options } = groupIds.length
        ? await supabaseDb.from("plan_options")
            .select("id, group_id, key, label, sort_order")
            .in("group_id", groupIds).order("sort_order", { ascending: true })
        : { data: [] as any[] };

      return { rows, groups: groups ?? [], options: options ?? [] };
    },
  });

  const rows = data?.rows ?? [];
  const offers = rows.filter((r) => !r.parent_plan_id);
  /** The offer being edited. An offer is one that already has variants, or the one just picked. */
  const [offerId, setOfferId] = useState<string>("");

  useEffect(() => {
    if (offerId || !rows.length) return;
    const withVariants = offers.find((o) => rows.some((r) => r.parent_plan_id === o.id));
    if (withVariants) setOfferId(withVariants.id);
  }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const offer = offers.find((o) => o.id === offerId) ?? null;

  // ── Draft state ───────────────────────────────────────────────────────────
  const [draftGroups, setDraftGroups] = useState<DraftGroup[]>([]);
  const [members, setMembers] = useState<Record<string, Record<string, string>>>({});
  const [newGroupLabel, setNewGroupLabel] = useState("");

  useEffect(() => {
    if (!offer || !data) { setDraftGroups([]); setMembers({}); return; }
    const gs = (data.groups as any[]).filter((g) => g.plan_id === offer.id);
    setDraftGroups(gs.map((g) => ({
      id: g.id,
      key: g.key,
      label: g.label,
      options: (data.options as any[]).filter((o) => o.group_id === g.id)
        .map((o) => ({ key: String(o.key), label: o.label })),
    })));
    setMembers(Object.fromEntries(
      rows.filter((r) => r.parent_plan_id === offer.id)
        .map((r) => [r.id, { ...(r.option_keys ?? {}) }]),
    ));
  }, [offerId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Plans that could join: anything that isn't the offer and isn't in another offer. */
  const candidates = rows.filter((r) =>
    r.id !== offerId && (!r.parent_plan_id || r.parent_plan_id === offerId));

  const assigned = candidates.filter((r) => members[r.id]);

  // ── Problems worth blocking a save for ────────────────────────────────────
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!draftGroups.length) out.push("Add at least one option — days per week, size, anything the plan varies by.");
    draftGroups.forEach((g) => {
      if (!g.options.length) out.push(`"${g.label}" has no values yet.`);
    });
    const seen = new Map<string, string>();
    assigned.forEach((plan) => {
      const picks = members[plan.id] ?? {};
      const missing = draftGroups.filter((g) => !picks[g.key]);
      if (missing.length) {
        out.push(`${plan.name} has no ${missing.map((m) => m.label.toLowerCase()).join(" or ")}.`);
        return;
      }
      // Two plans on the same combination would make one of them unreachable —
      // the picker can only ever land on the first.
      const fingerprint = draftGroups.map((g) => `${g.key}=${picks[g.key]}`).join("|");
      const clash = seen.get(fingerprint);
      if (clash) out.push(`${plan.name} and ${clash} are the same combination.`);
      else seen.set(fingerprint, plan.name);
    });
    if (assigned.length < 2) out.push("An offer needs at least two plans; with one there is nothing to choose.");
    return out;
  }, [draftGroups, members, assigned]);

  /** Combinations the axes allow that nothing sells — a warning, not an error. */
  const gaps = useMemo(() => {
    if (!draftGroups.length || draftGroups.some((g) => !g.options.length)) return [];
    const combos = draftGroups.reduce<Array<Record<string, string>>>(
      (acc, g) => acc.flatMap((base) => g.options.map((o) => ({ ...base, [g.key]: o.key }))),
      [{}],
    );
    return combos.filter((combo) =>
      !assigned.some((plan) => draftGroups.every((g) => (members[plan.id] ?? {})[g.key] === combo[g.key])),
    ).map((combo) => draftGroups
      .map((g) => g.options.find((o) => o.key === combo[g.key])?.label ?? combo[g.key])
      .join(" · "));
  }, [draftGroups, members, assigned]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!offer) throw new Error("Pick which plan is the offer first.");

      // Groups and their values are rewritten wholesale: the set is small, and
      // a diff would have to reason about a renamed key that variants still
      // point at. Delete-then-insert keeps the keys authoritative.
      const existing = (data?.groups as any[]).filter((g) => g.plan_id === offer.id);
      const keep = new Set(draftGroups.map((g) => g.key));
      const removable = existing.filter((g) => !keep.has(g.key)).map((g) => g.id);
      if (removable.length) {
        const { error } = await supabaseDb.from("plan_option_groups").delete().in("id", removable);
        if (error) throw error;
      }

      for (const [index, group] of draftGroups.entries()) {
        const match = existing.find((g) => g.key === group.key);
        let groupId = match?.id as string | undefined;
        if (groupId) {
          const { error } = await supabaseDb.from("plan_option_groups")
            .update({ label: group.label, sort_order: index }).eq("id", groupId);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabaseDb.from("plan_option_groups")
            .insert({ plan_id: offer.id, key: group.key, label: group.label, sort_order: index })
            .select("id").single();
          if (error) throw error;
          groupId = created.id;
        }

        const { error: delErr } = await supabaseDb.from("plan_options").delete().eq("group_id", groupId);
        if (delErr) throw delErr;
        if (group.options.length) {
          const { error: optErr } = await supabaseDb.from("plan_options").insert(
            group.options.map((o, i) => ({ group_id: groupId, key: o.key, label: o.label, sort_order: i })),
          );
          if (optErr) throw optErr;
        }
      }

      // Members. Anything previously in this offer that is no longer assigned
      // goes back to being a plan of its own rather than a variant nobody can
      // reach.
      const previous = rows.filter((r) => r.parent_plan_id === offer.id).map((r) => r.id);
      const now = new Set(assigned.map((r) => r.id));
      const released = previous.filter((id) => !now.has(id));
      if (released.length) {
        const { error } = await supabaseDb.from("provider_plans")
          .update({ parent_plan_id: null, option_keys: null }).in("id", released);
        if (error) throw error;
      }
      for (const plan of assigned) {
        const { error } = await supabaseDb.from("provider_plans")
          .update({ parent_plan_id: offer.id, option_keys: members[plan.id] })
          .eq("id", plan.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Options saved");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["plan-offers"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save the options"),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (offers.length < 2 && !offer) {
    return (
      <div className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">
        This business needs at least two plans before they can be grouped into one offer with options.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card p-4">
        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          The offer customers see
        </Label>
        <Select value={offerId} onValueChange={setOfferId}>
          <SelectTrigger className="mt-2 max-w-md">
            <SelectValue placeholder="Pick the plan that stands for the whole offer" />
          </SelectTrigger>
          <SelectContent>
            {offers.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">
          One card on the listing. Its price shows as "from" the cheapest combination and is worked
          out for you — you go on setting each plan's own price where you always did.
        </p>
      </div>

      {offer && (
        <>
          {/* ── Axes ── */}
          <section className="rounded-2xl bg-card p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-muted-foreground">
              What the customer chooses
            </h3>

            <div className="mt-3 space-y-4">
              {draftGroups.map((group, gi) => (
                <div key={group.key} className="rounded-xl bg-muted/40 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={group.label}
                      onChange={(e) => setDraftGroups((prev) => prev.map((g, i) =>
                        i === gi ? { ...g, label: e.target.value } : g))}
                      className="h-9 max-w-xs font-semibold"
                    />
                    <Button variant="ghost" size="sm" onClick={() =>
                      setDraftGroups((prev) => prev.filter((_, i) => i !== gi))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {group.options.map((option, oi) => (
                      <span key={option.key} className="inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-sm">
                        {option.label}
                        <button
                          type="button"
                          aria-label={`Remove ${option.label}`}
                          onClick={() => setDraftGroups((prev) => prev.map((g, i) =>
                            i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <AddValue onAdd={(label) => setDraftGroups((prev) => prev.map((g, i) =>
                      i === gi
                        ? (g.options.some((o) => o.key === slug(label))
                            ? g
                            : { ...g, options: [...g.options, { key: slug(label), label }] })
                        : g))} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Input
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
                placeholder="Add a choice — Days per week, Apartment size…"
                className="h-9 max-w-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!newGroupLabel.trim() || draftGroups.some((g) => g.key === slug(newGroupLabel))}
                onClick={() => {
                  setDraftGroups((prev) => [...prev, { key: slug(newGroupLabel), label: newGroupLabel.trim(), options: [] }]);
                  setNewGroupLabel("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </section>

          {/* ── Which plan is which combination ── */}
          <section className="rounded-2xl bg-card p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-muted-foreground">
              Which plan is which combination
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Prices come from the plans themselves — edit one in your plan list and it updates here.
            </p>

            <div className="mt-3 space-y-2">
              {candidates.map((plan) => {
                const picks = members[plan.id];
                return (
                  <div key={plan.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/40 p-3">
                    <button
                      type="button"
                      onClick={() => setMembers((prev) => {
                        const next = { ...prev };
                        if (next[plan.id]) delete next[plan.id];
                        else next[plan.id] = {};
                        return next;
                      })}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                        picks ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background",
                      )}
                      aria-label={picks ? `Remove ${plan.name}` : `Add ${plan.name}`}
                    >
                      {picks && <Check className="h-4 w-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{plan.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{formatUSD(plan.price_cents)}</p>
                    </div>

                    {picks && draftGroups.map((group) => (
                      <Select
                        key={group.key}
                        value={picks[group.key] ?? ""}
                        onValueChange={(value) => setMembers((prev) => ({
                          ...prev,
                          [plan.id]: { ...(prev[plan.id] ?? {}), [group.key]: value },
                        }))}
                      >
                        <SelectTrigger className="h-9 w-[150px]">
                          <SelectValue placeholder={group.label} />
                        </SelectTrigger>
                        <SelectContent>
                          {group.options.map((o) => (
                            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          {(problems.length > 0 || gaps.length > 0) && (
            <section className="space-y-2 rounded-2xl bg-card p-4">
              {problems.map((p) => (
                <p key={p} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {p}
                </p>
              ))}
              {problems.length === 0 && gaps.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing is sold for {gaps.length === 1 ? "this combination" : "these combinations"}:{" "}
                  <span className="font-medium text-foreground">{gaps.join(", ")}</span>. Customers see
                  {gaps.length === 1 ? " it" : " them"} greyed out — add a plan for
                  {gaps.length === 1 ? " it" : " them"} if that isn't deliberate.
                </p>
              )}
            </section>
          )}

          <Button
            size="lg"
            disabled={problems.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save options"}
          </Button>
        </>
      )}
    </div>
  );
}

function AddValue({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !value.trim()) return;
          e.preventDefault();
          onAdd(value.trim());
          setValue("");
        }}
        placeholder="Add a value"
        className="h-8 w-36 text-sm"
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={!value.trim()}
        onClick={() => { onAdd(value.trim()); setValue(""); }}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </span>
  );
}
