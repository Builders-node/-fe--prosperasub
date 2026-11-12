import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input, fieldClass } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/patterns/Skeleton";
import { QueryError } from "@/components/patterns/QueryError";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { planIndex, useHomePlans, type HomePlan } from "@/components/discovery/homePlans";

/**
 * Collections — the shelves on the home page ("Popular", "For beginners",
 * "For families"), each a title and an ordered list of offers
 * (Edge routes/collections.ts, tables home_collections + _plans).
 *
 * Shelves show on the home page in the order here, above "Businesses"; an
 * offer can sit on several. Only live, public offers can be picked — the same
 * list the home page draws from — so a shelf can never point at something a
 * customer cannot buy.
 */

interface Shelf { id: string; title: string; subtitle: string | null; sortOrder: number; isActive: boolean; planIds: string[] }
const KEY = ["admin-collections"];

async function call(path: string, method: string, body?: unknown) {
  const { data, error } = await adminApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (error) throw error;
  return data;
}

export default function Collections() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await call("/admin/collections", "GET")) as { enabled: boolean; rows: Shelf[] },
  });
  const { data: plans = [] } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);
  const rows = data?.rows ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["home-collections"] });
  };

  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => call("/admin/collections", "POST", { title }),
    onSuccess: () => { setTitle(""); toast.success("Collection created"); refresh(); },
    onError: (e: Error) => toast.error(e.message || "Could not create it"),
  });

  const move = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const order = [...rows];
      const [it] = order.splice(from, 1);
      order.splice(to, 0, it);
      await Promise.all(order.map((r, i) => r.sortOrder === i ? null : call(`/admin/collections/${r.id}`, "PATCH", { sortOrder: i })));
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not reorder"),
  });

  return (
    <SuperAdminLayout title="Collections" subtitle="Shelves of offers on the home page, in this order">
      {data && !data.enabled && (
        <p className="mb-4 rounded-radius-md bg-card p-4 text-body text-muted-foreground">
          Collections need the database migration (20261119120000_home_collections) before they can be created.
        </p>
      )}

      <form
        className="mb-4 flex items-end gap-2 rounded-radius-lg bg-card p-4"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(); }}
      >
        <div className="min-w-0 flex-1">
          <Input inputSize="sm" label="New collection" placeholder="e.g. Popular, For beginners, For families"
            value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={data?.enabled === false} />
        </div>
        <Button size="sm" type="submit" loading={create.isPending} disabled={!title.trim() || data?.enabled === false}>
          <Plus className="h-4 w-4" /> Create
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        data?.enabled !== false && (
          <p className="rounded-radius-lg bg-card p-6 text-center text-body text-muted-foreground">
            No collections yet. Create one above, then add offers to it — it appears on the home page as its own shelf.
          </p>
        )
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <ShelfCard
              key={r.id}
              shelf={r}
              plans={plans}
              index={index}
              onMove={(dir) => move.mutate({ from: i, to: i + dir })}
              canUp={i > 0}
              canDown={i < rows.length - 1}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </SuperAdminLayout>
  );
}

function ShelfCard({
  shelf, plans, index, onMove, canUp, canDown, onChanged,
}: {
  shelf: Shelf; plans: HomePlan[]; index: Map<string, HomePlan>;
  onMove: (dir: -1 | 1) => void; canUp: boolean; canDown: boolean; onChanged: () => void;
}) {
  const [title, setTitle] = useState(shelf.title);
  const [subtitle, setSubtitle] = useState(shelf.subtitle ?? "");
  useEffect(() => { setTitle(shelf.title); setSubtitle(shelf.subtitle ?? ""); }, [shelf.title, shelf.subtitle]);
  const dirty = title.trim() !== shelf.title || (subtitle.trim() || null) !== shelf.subtitle;

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => call(`/admin/collections/${shelf.id}`, "PATCH", body),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });
  const setPlans = useMutation({
    mutationFn: (planIds: string[]) => call(`/admin/collections/${shelf.id}/plans`, "PUT", { planIds }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message || "Could not save the offers"),
  });
  const remove = useMutation({
    mutationFn: () => call(`/admin/collections/${shelf.id}`, "DELETE"),
    onSuccess: () => { toast.success("Collection deleted"); onChanged(); },
    onError: (e: Error) => toast.error(e.message || "Could not delete"),
  });

  const ids = shelf.planIds;
  const swap = (i: number, j: number) => {
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setPlans.mutate(next);
  };
  const available = plans.filter((p) => !ids.includes(p.id));

  return (
    <section className={cn("space-y-3 rounded-radius-lg bg-card p-4", !shelf.isActive && "opacity-70")}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <Input inputSize="sm" label="Title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="min-w-[220px] flex-[2]">
          <Input inputSize="sm" label="Line under the title (optional)" value={subtitle} maxLength={160}
            onChange={(e) => setSubtitle(e.target.value)} />
        </div>
        {dirty && (
          <Button size="sm" loading={patch.isPending} disabled={!title.trim()}
            onClick={() => patch.mutate({ title: title.trim(), subtitle: subtitle.trim() || null })}>
            Save
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-body text-foreground">
          <Switch checked={shelf.isActive} onCheckedChange={(v) => patch.mutate({ isActive: v })} />
          {shelf.isActive ? "On the home page" : "Hidden"}
        </label>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!canUp} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
        <Button size="sm" variant="secondary" disabled={!canDown} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
        <Button size="sm" variant="secondary" loading={remove.isPending} aria-label="Delete collection"
          onClick={() => { if (window.confirm(`Delete “${shelf.title}”? The offers stay; only the shelf goes.`)) remove.mutate(); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-0.5 rounded-radius-md bg-background p-1">
        {ids.length === 0 && (
          <p className="p-3 text-meta text-muted-foreground">No offers yet — the shelf is not shown until it has one.</p>
        )}
        {ids.map((id, i) => {
          const p = index.get(id);
          return (
            <div key={id} className="flex items-center gap-2 rounded-radius-sm px-3 py-2">
              <span className="w-5 shrink-0 text-meta tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-foreground">{p?.name ?? "Offer no longer on sale"}</span>
                <span className="block truncate text-meta text-muted-foreground">
                  {p ? [p.provider?.name, p.price_cents ? formatUSD(p.price_cents) : null].filter(Boolean).join(" · ") : "Hidden from the home page until it is live again"}
                </span>
              </span>
              <button type="button" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label="Up"
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={i === ids.length - 1} onClick={() => swap(i, i + 1)} aria-label="Down"
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => setPlans.mutate(ids.filter((x) => x !== id))} aria-label="Remove"
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>

      {available.length > 0 && (
        <select
          className={fieldClass}
          value=""
          disabled={setPlans.isPending}
          onChange={(e) => { if (e.target.value) setPlans.mutate([...ids, e.target.value]); }}
          aria-label="Add an offer"
        >
          <option value="">+ Add an offer…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.provider?.name}{p.price_cents ? ` · ${formatUSD(p.price_cents)}` : ""}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
