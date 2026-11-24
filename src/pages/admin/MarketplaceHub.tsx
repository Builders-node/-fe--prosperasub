import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, GripVertical, Inbox, Plus } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { useServiceArchetypes, type ServiceArchetype } from "@/hooks/useServiceArchetypes";
import { ServiceArchetypeDialog } from "@/components/admin/ServiceArchetypeDialog";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { cn } from "@/lib/utils";
import { fetchApplications } from "@/lib/admin/providerApplications";

/** Sentinel bucket for rows whose `archetype_key` is null. */
const UNASSIGNED = "__unassigned";
const COUNTS_KEY = ["marketplace-hub-counts"] as const;
/** Chips shown inline before the row says "+N more". */
const CHIP_LIMIT = 6;

interface CategoryChip { key: string; label: string; archetype_key: string | null; is_active: boolean }

/** "1 business", "2 businesses". */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The businesses list counts both as Live. */
const isLive = (status: string) => status === "active" || status === "approved";

/**
 * Services & categories — one row per service.
 *
 * Was a grid of cards with three number tiles each: 21 identical tiles, no
 * categories in sight on a page named after them, and nothing could be done
 * without drilling in. Now every row carries what an admin actually changes
 * here: on/off, the order on the site (drag the handle), the categories as
 * chips (click one to edit it, + to add), and counts that open the filtered
 * list they count.
 *
 * Editing and deleting a service still live on its drill-down page, where the
 * admin can see what the change affects.
 */
export default function MarketplaceHub() {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [creating, setCreating] = useState(false);
  // Transport is not among these by construction — it is a unit of its own
  // with no archetype at all (lib/services/vehiclesUnit).
  const { archetypes, isLoading: archesLoading } = useServiceArchetypes(false);

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: COUNTS_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const [cats, providerRows, plans, apps] = await Promise.all([
        fetchAllRows<CategoryChip>(() => supabaseDb
          .from("service_categories").select("key, label, archetype_key, is_active, sort_order")
          .order("sort_order").order("key")),
        fetchAllRows<{ id: string; archetype_key: string | null; status: string; unit: string | null }>(() => supabaseDb
          // Transport's businesses are excluded: they carry no archetype by
          // design and would otherwise fill the Unassigned bucket, which is
          // for rows ORPHANED by a deleted service.
          .from("providers").select("id, archetype_key, status, unit").eq("unit", "marketplace").order("id")),
        fetchAllRows<{ provider_id: string }>(() => supabaseDb
          .from("provider_plans").select("provider_id, status").order("id")),
        fetchApplications({ status: "pending" }),
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
      const categoriesBy: Record<string, CategoryChip[]> = {};
      cats.forEach((c) => { (categoriesBy[c.archetype_key ?? UNASSIGNED] ??= []).push(c); });

      return {
        categoriesBy,
        businesses: tally(providerRows, (r) => r.archetype_key),
        live: tally(providerRows.filter((p) => isLive(p.status)), (r) => r.archetype_key),
        plans: tally(plans, (r) => archetypeOfProvider.get(r.provider_id) ?? null),
        pendingApps: tally(apps, (r) => r.archetype_key),
      };
    },
  });

  const at = (m: Record<string, number> | undefined, k: string) => m?.[k] ?? 0;

  /**
   * `providers.archetype_key` is `ON DELETE SET NULL`, so deleting a service
   * orphans its businesses and plans instead of cascading them away. This row
   * is their door; it only appears when there is something behind it.
   */
  const orphans = {
    businesses: at(counts?.businesses, UNASSIGNED),
    plans: at(counts?.plans, UNASSIGNED),
    categories: counts?.categoriesBy[UNASSIGNED]?.length ?? 0,
  };
  const hasOrphans = orphans.businesses + orphans.plans + orphans.categories > 0;

  // ── Order: local while dragging, written once on drop ────────────────────
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(archetypes.map((a) => a.key)); }, [archetypes]);
  const byKey = useMemo(() => new Map(archetypes.map((a) => [a.key, a])), [archetypes]);
  const rows = order.map((k) => byKey.get(k)).filter(Boolean) as ServiceArchetype[];

  const invalidateServices = () => {
    void qc.invalidateQueries({ queryKey: ["service-archetypes"] });
    void qc.invalidateQueries({ queryKey: ["admin-service-archetypes"] });
  };

  const saveOrder = useMutation({
    mutationFn: async (keys: string[]) => {
      // Only rows whose position changed; spaced by 10 so a hand edit in the
      // service dialog can still slot one in between.
      const writes = keys
        .map((key, i) => ({ key, sort_order: (i + 1) * 10 }))
        .filter(({ key, sort_order }) => byKey.get(key)?.sort_order !== sort_order);
      const results = await Promise.all(writes.map(({ key, sort_order }) =>
        supabaseDb.from("service_archetypes").update({ sort_order }).eq("key", key)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      if (userData?.id && writes.length) await logAuditEvent(userData.id, "edit", "service_archetype", "order", { order: keys });
    },
    onSuccess: () => { toast.success("Order saved — the site shows services in this order"); invalidateServices(); },
    onError: (e: Error) => { toast.error(e.message); setOrder(archetypes.map((a) => a.key)); },
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

  const drag = useRowDrag(order, setOrder, (keys) => saveOrder.mutate(keys));

  const loading = archesLoading || countsLoading;

  return (
    <SuperAdminLayout
      title="Services"
      subtitle="What the platform sells. Drag to set the order on the site."
      actions={
        <Button className="gap-2" onClick={() => setCreating(true)}>
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
          <ul ref={drag.listRef} className="divide-y divide-border/40 rounded-radius-lg bg-card px-1.5">
            {rows.map((a) => {
              const cats = counts?.categoriesBy[a.key] ?? [];
              const pending = at(counts?.pendingApps, a.key);
              const detail = `/admin/marketplace/service/${a.key}`;
              const dragging = drag.draggingKey === a.key;
              return (
                <li
                  key={a.key}
                  data-row-key={a.key}
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

                  <Link to={detail} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md bg-inset", !a.is_active && "opacity-50")}>
                    <a.Icon className="h-5 w-5 text-foreground" />
                  </Link>

                  <div className={cn("min-w-0 flex-1", !a.is_active && "opacity-60")}>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <Link to={detail} className="truncate text-title font-semibold text-foreground hover:underline">{a.label}</Link>
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

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {cats.slice(0, CHIP_LIMIT).map((c) => (
                        <Link
                          key={c.key}
                          to={`${detail}?tab=categories&edit=${encodeURIComponent(c.key)}`}
                          className={cn(
                            "inline-flex h-7 max-w-[180px] items-center truncate rounded-full bg-inset px-2.5 text-[13px] text-foreground transition-colors hover:bg-muted",
                            !c.is_active && "text-muted-foreground line-through decoration-muted-foreground/50",
                          )}
                          title={c.is_active ? `Edit ${c.label}` : `${c.label} (hidden)`}
                        >
                          {c.label}
                        </Link>
                      ))}
                      {cats.length > CHIP_LIMIT && (
                        <Link to={`${detail}?tab=categories`} className="inline-flex h-7 items-center rounded-full px-2 text-[13px] text-muted-foreground hover:text-foreground">
                          +{cats.length - CHIP_LIMIT} more
                        </Link>
                      )}
                      <Link
                        to={`${detail}?tab=categories&new=1`}
                        aria-label={`Add a category to ${a.label}`}
                        title="Add a category"
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2 text-[13px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />{cats.length === 0 && "Add category"}
                      </Link>
                    </div>
                  </div>

                  <div className="mt-2 flex shrink-0 items-center gap-1 sm:mt-0">
                    <Switch
                      checked={a.is_active}
                      disabled={setActive.isPending}
                      onCheckedChange={(next) => setActive.mutate({ key: a.key, next })}
                      aria-label={a.is_active ? `${a.label} is on the site. Switch off` : `${a.label} is hidden. Switch on`}
                      title={a.is_active ? "On the site" : "Hidden from the site"}
                    />
                    <Link to={detail} aria-label={`Open ${a.label}`} className="hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-inset hover:text-foreground sm:flex">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
            {rows.length === 0 && (
              <li className="p-6 text-center text-body text-muted-foreground">No services yet. Add the first one.</li>
            )}
          </ul>

          {hasOrphans && (
            <Link
              to="/admin/marketplace/service/unassigned"
              className="flex items-center gap-3 rounded-radius-lg border border-dashed border-attention/40 bg-card p-3 transition-colors hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-attention/15">
                <AlertTriangle className="h-5 w-5 text-attention" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-foreground">Not in any service</span>
                <span className="block truncate text-meta text-muted-foreground">
                  {[
                    orphans.businesses && plural(orphans.businesses, "business", "businesses"),
                    orphans.plans && plural(orphans.plans, "plan", "plans"),
                    orphans.categories && plural(orphans.categories, "category", "categories"),
                  ].filter(Boolean).join(" · ")} — reassign or remove them
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
        </div>
      )}

      <ServiceArchetypeDialog
        open={creating}
        onOpenChange={(v) => !v && setCreating(false)}
        archetype={creating ? "new" : null}
        invalidateKeys={[[...COUNTS_KEY]]}
      />
    </SuperAdminLayout>
  );
}

function StatLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="tabular-nums hover:text-foreground hover:underline">{children}</Link>;
}

/**
 * Drag-to-reorder for a vertical list, by a handle. Pointer events rather than
 * HTML5 drag-and-drop so it works with a finger as well as a mouse; arrow keys
 * on the handle move a row one place for keyboard users.
 */
function useRowDrag(order: string[], setOrder: (next: string[]) => void, commit: (next: string[]) => void) {
  const listRef = useRef<HTMLUListElement>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const live = useRef<string[]>(order);
  live.current = order;
  const startOrder = useRef<string[]>([]);

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

  const handleProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startOrder.current = live.current;
      setDraggingKey(key);
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (draggingKey !== key || !listRef.current) return;
      // The row whose middle the pointer has passed is where this one goes.
      const others = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-row-key]"));
      let to = 0;
      others.forEach((el) => {
        if (el.dataset.rowKey === key) return;
        const r = el.getBoundingClientRect();
        if (e.clientY > r.top + r.height / 2) to += 1;
      });
      move(key, to);
    },
    onPointerUp: () => {
      if (draggingKey !== key) return;
      setDraggingKey(null);
      if (startOrder.current.join() !== live.current.join()) commit(live.current);
    },
    onPointerCancel: () => { setDraggingKey(null); setOrder(startOrder.current); },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const i = live.current.indexOf(key);
      const next = move(key, i + (e.key === "ArrowUp" ? -1 : 1));
      if (next.join() !== order.join()) commit(next);
    },
  });

  return { listRef, draggingKey, handleProps };
}
