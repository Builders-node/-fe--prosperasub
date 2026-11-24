import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, GripVertical, Inbox, Plus } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes, type ServiceArchetype } from "@/hooks/useServiceArchetypes";
import { ServiceArchetypeDialog, type Archetype } from "@/components/admin/ServiceArchetypeDialog";
import { CategoryPanel, type CategoryRow } from "@/components/admin/CategoryPanel";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { cn } from "@/lib/utils";
import { fetchApplications } from "@/lib/admin/providerApplications";

/** Sentinel bucket for rows whose `archetype_key` is null. */
const UNASSIGNED = "__unassigned";
const COUNTS_KEY = ["marketplace-hub-counts"] as const;

/** "1 business", "2 businesses". */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The businesses list counts both as Live. */
const isLive = (status: string) => status === "active" || status === "approved";

/**
 * Services & categories — the whole section, on one page.
 *
 * One row per service: on/off, its place on the site (drag the handle), its
 * categories as chips and counts that open the filtered Businesses / Plans
 * lists. A click on a service opens its panel (name, icon, description,
 * delete); a click on a chip opens that category's; + adds one. Chips drag
 * too, which is the categories' order on the site.
 *
 * There used to be a page per service with a Businesses tab (the Businesses
 * list again, filtered) and a Categories tab (these chips again, as cards with
 * the edit hidden in a menu). Old links to it land here with its panel open.
 */
export default function MarketplaceHub() {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [params, setParams] = useSearchParams();
  const [serviceTarget, setServiceTarget] = useState<ServiceArchetype | "new" | null>(null);
  const [catTarget, setCatTarget] = useState<CategoryRow | { newIn: string } | null>(null);
  // Transport is not among these by construction — it is a unit of its own
  // with no archetype at all (lib/services/vehiclesUnit).
  const { archetypes, isLoading: archesLoading } = useServiceArchetypes(false);

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: COUNTS_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const [cats, providerRows, plans, apps] = await Promise.all([
        fetchAllRows<CategoryRow>(() => supabaseDb
          .from("service_categories").select("key, label, archetype_key, icon, accent, is_active, sort_order, image_url")
          .order("sort_order").order("key")),
        fetchAllRows<{ id: string; archetype_key: string | null; category_key: string | null; status: string }>(() => supabaseDb
          // Transport's businesses are excluded: they carry no archetype by
          // design and are not "without a service".
          .from("providers").select("id, archetype_key, category_key, status, unit").eq("unit", "marketplace").order("id")),
        fetchAllRows<{ provider_id: string }>(() => supabaseDb
          .from("provider_plans").select("provider_id, status").order("id")),
        fetchApplications({ status: "pending" }).catch(() => []),
      ]);

      const archetypeOfProvider = new Map(providerRows.map((p) => [p.id, p.archetype_key]));
      const tally = <T,>(rows: T[], keyOf: (r: T) => string | null) => {
        const m: Record<string, number> = {};
        rows.forEach((r) => {
          const k = keyOf(r) ?? UNASSIGNED;
          m[k] = (m[k] ?? 0) + 1;
        });
        return m;
      };
      const categoriesBy: Record<string, CategoryRow[]> = {};
      cats.forEach((c) => { (categoriesBy[c.archetype_key ?? UNASSIGNED] ??= []).push(c); });

      return {
        categories: cats,
        categoriesBy,
        businesses: tally(providerRows, (r) => r.archetype_key),
        live: tally(providerRows.filter((p) => isLive(p.status)), (r) => r.archetype_key),
        byCategory: tally(providerRows.filter((p) => p.category_key), (r) => r.category_key),
        plans: tally(plans, (r) => archetypeOfProvider.get(r.provider_id) ?? null),
        pendingApps: tally(apps, (r) => r.archetype_key),
      };
    },
  });

  const at = (m: Record<string, number> | undefined, k: string) => m?.[k] ?? 0;

  /**
   * `providers.archetype_key` is `ON DELETE SET NULL`, so deleting a service
   * leaves its businesses without one. This row only appears when there are
   * some, and opens Businesses on "No service".
   */
  const orphans = {
    businesses: at(counts?.businesses, UNASSIGNED),
    plans: at(counts?.plans, UNASSIGNED),
    categories: counts?.categoriesBy[UNASSIGNED] ?? [],
  };
  const hasOrphans = orphans.businesses + orphans.plans + orphans.categories.length > 0;

  // ── Old links: /admin/marketplace/service/:key redirects to ?service=key ──
  const wantService = params.get("service");
  const wantCategory = params.get("category");
  useEffect(() => {
    if ((!wantService && !wantCategory) || archesLoading || countsLoading) return;
    if (wantCategory) {
      const c = counts?.categories.find((x) => x.key === wantCategory);
      if (c) setCatTarget(c);
    } else if (wantService) {
      const a = archetypes.find((x) => x.key === wantService);
      if (a) setServiceTarget(a);
    }
    const q = new URLSearchParams(params);
    q.delete("service"); q.delete("category");
    setParams(q, { replace: true });
  }, [wantService, wantCategory, archesLoading, countsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Service order: local while dragging, written once on drop ─────────────
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(archetypes.map((a) => a.key)); }, [archetypes]);
  const byKey = useMemo(() => new Map(archetypes.map((a) => [a.key, a])), [archetypes]);
  const rows = order.map((k) => byKey.get(k)).filter(Boolean) as ServiceArchetype[];

  const invalidateServices = () => {
    void qc.invalidateQueries({ queryKey: ["service-archetypes"] });
    void qc.invalidateQueries({ queryKey: ["admin-service-archetypes"] });
  };

  /** Writes 10, 20, 30… to the rows whose place changed. */
  const writeOrder = async (table: "service_archetypes" | "service_categories", keys: string[], current: Map<string, number>) => {
    const writes = keys
      .map((key, i) => ({ key, sort_order: (i + 1) * 10 }))
      .filter(({ key, sort_order }) => current.get(key) !== sort_order);
    const results = await Promise.all(writes.map(({ key, sort_order }) =>
      supabaseDb.from(table).update({ sort_order }).eq("key", key)));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    return writes.length;
  };

  const saveOrder = useMutation({
    mutationFn: async (keys: string[]) => {
      const n = await writeOrder("service_archetypes", keys, new Map(archetypes.map((a) => [a.key, a.sort_order])));
      if (userData?.id && n) await logAuditEvent(userData.id, "edit", "service_archetype", "order", { order: keys });
    },
    onSuccess: () => { toast.success("Order saved. The site shows services in this order."); invalidateServices(); },
    onError: (e: Error) => { toast.error(e.message); setOrder(archetypes.map((a) => a.key)); },
  });

  // ── Category order, per service ────────────────────────────────────────────
  const [chipOrder, setChipOrder] = useState<Record<string, string[]>>({});
  useEffect(() => { setChipOrder({}); }, [counts]);
  const chipsOf = (serviceKey: string): CategoryRow[] => {
    const list = counts?.categoriesBy[serviceKey] ?? [];
    const o = chipOrder[serviceKey];
    if (!o) return list;
    const m = new Map(list.map((c) => [c.key, c]));
    return o.map((k) => m.get(k)).filter(Boolean) as CategoryRow[];
  };
  const saveChipOrder = useMutation({
    mutationFn: async ({ serviceKey, keys }: { serviceKey: string; keys: string[] }) => {
      const list = counts?.categoriesBy[serviceKey] ?? [];
      const n = await writeOrder("service_categories", keys, new Map(list.map((c) => [c.key, c.sort_order])));
      if (userData?.id && n) await logAuditEvent(userData.id, "edit", "service_category", `order:${serviceKey}`, { order: keys });
    },
    onSuccess: () => {
      toast.success("Category order saved");
      void qc.invalidateQueries({ queryKey: COUNTS_KEY });
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("categor") });
    },
    onError: (e: Error) => { toast.error(e.message); setChipOrder({}); },
  });

  const setActive = useMutation({
    mutationFn: async ({ key, next }: { key: string; next: boolean }) => {
      const { error } = await supabaseDb.from("service_archetypes").update({ is_active: next }).eq("key", key);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", "service_archetype", key, { is_active: next });
      return { key, next };
    },
    onSuccess: ({ key, next }) => {
      invalidateServices();
      const label = byKey.get(key)?.label ?? "Service";
      if (next) toast.success(`${label} is on the site`);
      else toast(`${label} is hidden from the site`, {
        action: { label: "Undo", onClick: () => setActive.mutate({ key, next: true }) },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drag = useDragOrder(order, setOrder, (keys) => saveOrder.mutate(keys), "rows");

  const loading = archesLoading || countsLoading;
  const nextServiceOrder = (archetypes.reduce((m, a) => Math.max(m, a.sort_order), 0) || 0) + 10;
  const catServiceKey = catTarget ? ("newIn" in catTarget ? catTarget.newIn : catTarget.archetype_key ?? UNASSIGNED) : "";
  const catSiblings = (counts?.categoriesBy[catServiceKey] ?? []).map((c) => c.label);

  return (
    <SuperAdminLayout
      title="Services"
      subtitle="What the platform sells. Drag to set the order on the site."
      actions={
        <Button className="gap-2" onClick={() => setServiceTarget("new")}>
          <Plus className="h-4 w-4" /> New service
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-1 rounded-radius-lg bg-card p-1.5">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-radius-md bg-muted/50" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <ul ref={drag.listRef as React.RefObject<HTMLUListElement>} className="divide-y divide-border/40 rounded-radius-lg bg-card px-1.5">
            {rows.map((a) => {
              const pending = at(counts?.pendingApps, a.key);
              const dragging = drag.draggingKey === a.key;
              return (
                <li
                  key={a.key}
                  data-drag-key={a.key}
                  className={cn(
                    "flex items-start gap-2 py-3 pr-1.5 transition-colors sm:items-center sm:gap-3",
                    dragging && "relative z-10 rounded-radius-md bg-inset ring-1 ring-primary/40",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Move ${a.label}. Use arrow keys.`}
                    title="Drag to reorder"
                    {...drag.handleProps(a.key)}
                    className="mt-2.5 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-[6px] text-muted-foreground/60 hover:bg-inset hover:text-foreground active:cursor-grabbing sm:mt-0"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>

                  <button type="button" onClick={() => setServiceTarget(a)} aria-label={`Edit ${a.label}`}
                    className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md bg-inset hover:bg-muted", !a.is_active && "opacity-50")}>
                    <a.Icon className="h-5 w-5 text-foreground" />
                  </button>

                  <div className={cn("min-w-0 flex-1", !a.is_active && "opacity-60")}>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <button type="button" onClick={() => setServiceTarget(a)} className="truncate text-left text-title font-semibold text-foreground hover:underline">{a.label}</button>
                      <span className="text-meta text-muted-foreground">
                        <StatLink to={`/admin/marketplace/providers?service=${a.key}`}>
                          {plural(at(counts?.businesses, a.key), "business", "businesses")}
                        </StatLink>
                        {at(counts?.businesses, a.key) > 0 && (
                          <>, <StatLink to={`/admin/marketplace/providers?service=${a.key}&status=active`}>{at(counts?.live, a.key)} live</StatLink></>
                        )}
                        {" · "}
                        <StatLink to={`/admin/marketplace/plans?service=${a.key}`}>{plural(at(counts?.plans, a.key), "plan", "plans")}</StatLink>
                      </span>
                      {pending > 0 && (
                        <Link to="/admin/marketplace/providers/applications" className="inline-flex items-center gap-1 text-meta font-semibold text-attention hover:underline">
                          <Inbox className="h-3.5 w-3.5" /> {plural(pending, "application", "applications")}
                        </Link>
                      )}
                    </div>

                    <ChipRow
                      chips={chipsOf(a.key)}
                      onReorder={(keys) => setChipOrder((m) => ({ ...m, [a.key]: keys }))}
                      onCommit={(keys) => saveChipOrder.mutate({ serviceKey: a.key, keys })}
                      onOpen={setCatTarget}
                      onAdd={() => setCatTarget({ newIn: a.key })}
                      addLabel={`Add a category to ${a.label}`}
                    />
                  </div>

                  <div className="mt-2 flex shrink-0 items-center gap-1 sm:mt-0">
                    <Switch
                      checked={a.is_active}
                      disabled={setActive.isPending}
                      onCheckedChange={(next) => setActive.mutate({ key: a.key, next })}
                      aria-label={a.is_active ? `${a.label} is on the site. Switch off` : `${a.label} is hidden. Switch on`}
                      title={a.is_active ? "On the site" : "Hidden from the site"}
                    />
                    <button type="button" onClick={() => setServiceTarget(a)} aria-label={`Edit ${a.label}`}
                      className="hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-inset hover:text-foreground sm:flex">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
            {rows.length === 0 && (
              <li className="p-6 text-center text-body text-muted-foreground">No services yet. Add the first one.</li>
            )}
          </ul>

          {hasOrphans && (
            <div className="flex items-start gap-3 rounded-radius-lg border border-dashed border-attention/40 bg-card p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-attention/15">
                <AlertTriangle className="h-5 w-5 text-attention" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-foreground">Not in any service</p>
                <p className="text-meta text-muted-foreground">
                  {orphans.businesses > 0 && (
                    <StatLink to="/admin/marketplace/providers?service=unassigned">{plural(orphans.businesses, "business", "businesses")}</StatLink>
                  )}
                  {orphans.businesses > 0 && orphans.plans > 0 && " · "}
                  {orphans.plans > 0 && plural(orphans.plans, "plan", "plans")}
                  {" "}— give them a service or remove them.
                </p>
                {orphans.categories.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {orphans.categories.map((c) => (
                      <button key={c.key} type="button" onClick={() => setCatTarget(c)}
                        className="inline-flex h-7 items-center rounded-full bg-inset px-2.5 text-[13px] text-foreground hover:bg-muted">
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ServiceArchetypeDialog
        open={serviceTarget !== null}
        onOpenChange={(v) => !v && setServiceTarget(null)}
        archetype={serviceTarget as Archetype | "new" | null}
        nextSortOrder={nextServiceOrder}
        businessCount={serviceTarget && serviceTarget !== "new" ? at(counts?.businesses, serviceTarget.key) : 0}
        invalidateKeys={[[...COUNTS_KEY]]}
      />
      <CategoryPanel
        target={catTarget}
        onClose={() => setCatTarget(null)}
        services={archetypes.map((a) => ({ key: a.key, label: a.label }))}
        nextSortOrder={((counts?.categoriesBy[catServiceKey] ?? []).reduce((m, c) => Math.max(m, c.sort_order), 0) || 0) + 10}
        businessCount={catTarget && !("newIn" in catTarget) ? at(counts?.byCategory, catTarget.key) : 0}
        siblings={catSiblings}
      />
    </SuperAdminLayout>
  );
}

function StatLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="tabular-nums hover:text-foreground hover:underline">{children}</Link>;
}

/**
 * A service's categories as chips. Click opens one; drag with a mouse moves
 * it (its order on the site); arrow keys move the focused chip.
 */
function ChipRow({ chips, onReorder, onCommit, onOpen, onAdd, addLabel }: {
  chips: CategoryRow[];
  onReorder: (keys: string[]) => void;
  onCommit: (keys: string[]) => void;
  onOpen: (c: CategoryRow) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  const keys = chips.map((c) => c.key);
  const drag = useDragOrder(keys, onReorder, onCommit, "chips");
  return (
    <div ref={drag.listRef as React.RefObject<HTMLDivElement>} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          data-drag-key={c.key}
          {...drag.chipProps(c.key, () => onOpen(c))}
          className={cn(
            "inline-flex h-7 max-w-[180px] select-none items-center truncate rounded-full bg-inset px-2.5 text-[13px] text-foreground transition-colors hover:bg-muted",
            !c.is_active && "text-muted-foreground line-through decoration-muted-foreground/50",
            drag.draggingKey === c.key && "ring-1 ring-primary",
          )}
          title={c.is_active ? `Edit ${c.label}. Drag to reorder.` : `${c.label} (hidden)`}
        >
          {c.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        title="Add a category"
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2 text-[13px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />{chips.length === 0 && "Add category"}
      </button>
    </div>
  );
}

/**
 * Drag-to-reorder by pointer events, so it works with a finger as well as a
 * mouse. "rows": a vertical list moved by a handle. "chips": wrapped chips,
 * dragged by the chip itself with a mouse (a finger on a chip just opens it),
 * placed at the chip nearest the pointer. Arrow keys move one place.
 */
function useDragOrder(order: string[], setOrder: (next: string[]) => void, commit: (next: string[]) => void, mode: "rows" | "chips") {
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
