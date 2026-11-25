import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, LayoutGrid, Plus, Search, Trash2, X } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input, fieldClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/patterns/Skeleton";
import { Photo } from "@/components/patterns/Photo";
import { QueryError } from "@/components/patterns/QueryError";
import { ImageField } from "@/components/food/ImageField";
import { CollectionCover } from "@/components/discovery/CollectionCover";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { planIndex, planPhotos, useHomePlans, type HomePlan } from "@/components/discovery/homePlans";
import { collectionHref, offersLabel } from "@/lib/collections";
import { useTagDictionary } from "@/lib/tags";
import { useConfirm } from "@/components/patterns/ConfirmDialog";

/**
 * Collections — "Popular", "Date night", "For families". Each is a shelf on
 * the home page (title, one line, the first eight offers) AND a page of its
 * own, /collections/<address>, with a cover, a few sentences and every offer
 * (Edge routes/collections.ts, tables home_collections + _plans).
 *
 * One row per collection, in the order they show on the home page; a row opens
 * into its editor. Only live, public offers can be picked — the same list the
 * site draws from — so a collection can never point at something a customer
 * cannot buy.
 */

interface Shelf {
  id: string; title: string; subtitle: string | null; sortOrder: number; isActive: boolean;
  planIds: string[]; tagKey: string | null;
  slug: string | null; coverUrl: string | null; description: string | null;
}
const KEY = ["admin-collections"];
const MAX_PLANS = 60;

async function call(path: string, method: string, body?: unknown) {
  const { data, error } = await adminApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (error) throw error;
  return data;
}

/** Hand-picked first, then every other live plan carrying the tag. */
function resolved(shelf: Shelf, plans: HomePlan[], index: Map<string, HomePlan>) {
  const picked = shelf.planIds.map((id) => index.get(id)).filter((p): p is HomePlan => !!p);
  const auto = shelf.tagKey
    ? plans.filter((p) => Array.isArray(p.tags) && p.tags.includes(shelf.tagKey!) && !shelf.planIds.includes(p.id))
    : [];
  return { picked, auto, all: [...picked, ...auto] };
}

export default function Collections() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await call("/admin/collections", "GET")) as { enabled: boolean; tagsReady?: boolean; pagesReady?: boolean; rows: Shelf[] },
  });
  const { data: plans = [] } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);
  const rows = data?.rows ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["home-collections"] });
  };

  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => call("/admin/collections", "POST", { title, isActive: false }) as Promise<{ id: string }>,
    onSuccess: (r) => { setTitle(""); setOpen(r?.id ?? null); toast.success("Collection created — add offers, then switch it on"); refresh(); },
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
    <SuperAdminLayout
      title="Collections"
      subtitle="Hand-picked offers. Each is a shelf on the home page and a page of its own."
      actions={<Button size="sm" variant="secondary" asChild><Link to="/collections" target="_blank"><ExternalLink className="h-4 w-4" /> View on site</Link></Button>}
    >
      {data && !data.enabled && (
        <p className="mb-4 rounded-radius-md bg-card p-4 text-body text-muted-foreground">
          Collections aren't available yet. Diagnostics shows what is missing.
        </p>
      )}
      {data?.enabled && data.pagesReady === false && (
        <p className="mb-4 rounded-radius-md bg-card p-4 text-body text-muted-foreground">
          Covers, descriptions and page addresses switch on once the collection_pages migration is applied. Shelves and their pages already work.
        </p>
      )}

      <form
        className="mb-4 flex items-end gap-2 rounded-radius-lg bg-card p-4"
        onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(); }}
      >
        <div className="min-w-0 flex-1">
          <Input inputSize="sm" label="New collection" placeholder="e.g. Popular, Date night, For families"
            value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={data?.enabled === false} />
        </div>
        <Button size="sm" type="submit" loading={create.isPending} disabled={!title.trim() || data?.enabled === false}>
          <Plus className="h-4 w-4" /> Create
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        data?.enabled !== false && (
          <div className="rounded-radius-lg bg-card p-8 text-center">
            <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-title font-semibold text-foreground">No collections yet</p>
            <p className="mx-auto mt-1 max-w-sm text-body text-muted-foreground">
              Create one above, add offers and a cover, then switch it on. It appears on the home page as a shelf and gets its own page.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <ShelfRow
              key={r.id}
              shelf={r}
              plans={plans}
              index={index}
              open={open === r.id}
              onToggle={() => setOpen(open === r.id ? null : r.id)}
              onMove={(dir) => move.mutate({ from: i, to: i + dir })}
              canUp={i > 0}
              canDown={i < rows.length - 1}
              onChanged={refresh}
              tagsReady={!!data?.tagsReady}
              pagesReady={!!data?.pagesReady}
            />
          ))}
        </div>
      )}
    </SuperAdminLayout>
  );
}

function ShelfRow({
  shelf, plans, index, open, onToggle, onMove, canUp, canDown, onChanged, tagsReady, pagesReady,
}: {
  shelf: Shelf; plans: HomePlan[]; index: Map<string, HomePlan>; open: boolean; onToggle: () => void;
  onMove: (dir: -1 | 1) => void; canUp: boolean; canDown: boolean; onChanged: () => void;
  tagsReady: boolean; pagesReady: boolean;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const { all } = resolved(shelf, plans, index);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => call(`/admin/collections/${shelf.id}`, "PATCH", body),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });
  const remove = useMutation({
    mutationFn: () => call(`/admin/collections/${shelf.id}`, "DELETE"),
    onSuccess: () => { toast.success("Collection deleted"); onChanged(); },
    onError: (e: Error) => toast.error(e.message || "Could not delete"),
  });

  return (
    <section className={cn("overflow-hidden rounded-radius-lg bg-card", open && "ring-1 ring-border")}>
      {confirmDialog}
      {/* The row: cover, name, what is on it, on/off, order. */}
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <CollectionCover coverUrl={shelf.coverUrl} plans={all} className="h-14 w-20 shrink-0 rounded-radius-md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title font-semibold text-foreground">{shelf.title}</span>
            <span className="block truncate text-meta text-muted-foreground">
              {offersLabel(all.length)}
              {shelf.tagKey ? " · fills from a tag" : ""}
              {shelf.slug ? ` · /collections/${shelf.slug}` : ""}
            </span>
          </span>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        <label className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
          <Switch checked={shelf.isActive} onCheckedChange={(v) => patch.mutate({ isActive: v })} aria-label="On site" />
          <span className="hidden w-12 sm:inline">{shelf.isActive ? "On site" : "Hidden"}</span>
        </label>
        <div className="hidden shrink-0 items-center sm:flex">
          <IconBtn label="Move up" disabled={!canUp} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Move down" disabled={!canDown} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-t border-border p-4">
          <Details shelf={shelf} pagesReady={pagesReady} saving={patch.isPending} onSave={(b) => patch.mutate(b)} />

          {tagsReady && <TagFill shelf={shelf} plans={plans} onPick={(tagKey) => patch.mutate({ tagKey })} />}

          <Offers shelf={shelf} plans={plans} index={index} onChanged={onChanged} />

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {shelf.isActive ? (
              <Button size="sm" variant="secondary" asChild>
                <Link to={collectionHref(shelf)} target="_blank"><ExternalLink className="h-4 w-4" /> Open page</Link>
              </Button>
            ) : (
              <span className="text-meta text-muted-foreground">Hidden: not on the home page and its page does not open. Switch it on when it is ready.</span>
            )}
            <span className="flex-1" />
            <span className="flex items-center sm:hidden">
              <IconBtn label="Move up" disabled={!canUp} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconBtn>
              <IconBtn label="Move down" disabled={!canDown} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconBtn>
            </span>
            <Button size="sm" variant="secondary" loading={remove.isPending}
              onClick={async () => {
                if (await confirm({ title: `Delete “${shelf.title}”?`, description: "The offers stay; only this collection and its page go.", confirmLabel: "Delete collection" })) remove.mutate();
              }}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30">
      {children}
    </button>
  );
}

/** Title, the line under it, and — for the page — cover, text and address. */
function Details({ shelf, pagesReady, saving, onSave }: {
  shelf: Shelf; pagesReady: boolean; saving: boolean; onSave: (body: Record<string, unknown>) => void;
}) {
  const init = () => ({ title: shelf.title, subtitle: shelf.subtitle ?? "", description: shelf.description ?? "", slug: shelf.slug ?? "" });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [shelf.title, shelf.subtitle, shelf.description, shelf.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const body: Record<string, unknown> = {};
  if (f.title.trim() !== shelf.title) body.title = f.title.trim();
  if ((f.subtitle.trim() || null) !== shelf.subtitle) body.subtitle = f.subtitle.trim() || null;
  if (pagesReady && (f.description.trim() || null) !== shelf.description) body.description = f.description.trim() || null;
  if (pagesReady && f.slug.trim() && f.slug.trim() !== shelf.slug) body.slug = f.slug.trim();
  const dirty = Object.keys(body).length > 0;

  return (
    <div className={cn("grid gap-4", pagesReady && "md:grid-cols-[280px_1fr]")}>
      {pagesReady && (
        <ImageField
          label="Cover"
          value={shelf.coverUrl ?? ""}
          onChange={(url) => onSave({ coverUrl: url || null })}
          pathPrefix="collections"
          aspectClass="aspect-[16/9] w-full"
        />
      )}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input inputSize="sm" label="Title" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input inputSize="sm" label="Line under the title (home page)" value={f.subtitle} maxLength={160}
            placeholder="e.g. What everyone on the island signs up for" onChange={(e) => setF({ ...f, subtitle: e.target.value })} />
        </div>
        {pagesReady && (
          <>
            <Textarea label="About this collection (its page)" value={f.description} maxLength={600} rows={3} showCount
              placeholder="A few sentences: who it is for and why these offers."
              onChange={(e) => setF({ ...f, description: e.target.value })} />
            <Input inputSize="sm" label="Page address" value={f.slug} maxLength={60}
              leftIcon={<span className="text-meta text-muted-foreground">/collections/</span>}
              className="pl-[104px]"
              onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })} />
          </>
        )}
        {dirty && (
          <div className="flex gap-2">
            <Button size="sm" loading={saving} disabled={!f.title.trim()} onClick={() => onSave(body)}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => setF(init())}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TagFill({ shelf, plans, onPick }: { shelf: Shelf; plans: HomePlan[]; onPick: (tagKey: string | null) => void }) {
  const dict = useTagDictionary();
  const autoCount = shelf.tagKey
    ? plans.filter((p) => Array.isArray(p.tags) && p.tags.includes(shelf.tagKey!) && !shelf.planIds.includes(p.id)).length
    : 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-body text-foreground">Also add every plan tagged</span>
      <select
        className={cn(fieldClass, "w-auto min-w-[180px]")}
        value={shelf.tagKey ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
        aria-label="Fill with a tag"
      >
        <option value="">— no tag, hand-picked only —</option>
        {dict.groups.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {g.tags.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </optgroup>
        ))}
      </select>
      {shelf.tagKey && <span className="text-meta text-muted-foreground">+{autoCount} automatically, after the hand-picked ones</span>}
    </div>
  );
}

/** The hand-picked offers, in order, and a searchable list to add more. */
function Offers({ shelf, plans, index, onChanged }: {
  shelf: Shelf; plans: HomePlan[]; index: Map<string, HomePlan>; onChanged: () => void;
}) {
  const ids = shelf.planIds;
  const [q, setQ] = useState("");
  const setPlans = useMutation({
    mutationFn: (planIds: string[]) => call(`/admin/collections/${shelf.id}/plans`, "PUT", { planIds }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message || "Could not save the offers"),
  });
  const swap = (i: number, j: number) => {
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setPlans.mutate(next);
  };
  const needle = q.trim().toLowerCase();
  const available = plans
    .filter((p) => !ids.includes(p.id))
    .filter((p) => !needle || `${p.name} ${p.provider?.name ?? ""}`.toLowerCase().includes(needle));
  const full = ids.length >= MAX_PLANS;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="text-label text-foreground">In this collection <span className="text-muted-foreground">· {ids.length} of {MAX_PLANS} · first 8 show on the home page</span></p>
        <div className="max-h-[420px] space-y-0.5 overflow-y-auto rounded-radius-md bg-background p-1">
          {ids.length === 0 && (
            <p className="p-3 text-meta text-muted-foreground">
              {shelf.tagKey ? "No hand-picked offers — the tag fills it." : "Nothing yet. Pick offers on the right — a collection with none is not shown."}
            </p>
          )}
          {ids.map((id, i) => {
            const p = index.get(id);
            return (
              <div key={id} className={cn("flex items-center gap-2 rounded-radius-sm px-2 py-1.5", i === 7 && ids.length > 8 && "border-b border-dashed border-border pb-2")}>
                <span className="w-5 shrink-0 text-meta tabular-nums text-muted-foreground">{i + 1}</span>
                <Photo src={p ? planPhotos(p)[0] : null} className="h-9 w-9 shrink-0 rounded-radius-sm object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-foreground">{p?.name ?? "Offer no longer on sale"}</span>
                  <span className="block truncate text-meta text-muted-foreground">
                    {p ? [p.provider?.name, p.price_cents ? formatUSD(p.price_cents) : null].filter(Boolean).join(" · ") : "Hidden from the site until it is live again"}
                  </span>
                </span>
                <IconBtn label="Up" disabled={i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="h-4 w-4" /></IconBtn>
                <IconBtn label="Down" disabled={i === ids.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="h-4 w-4" /></IconBtn>
                <IconBtn label="Remove" onClick={() => setPlans.mutate(ids.filter((x) => x !== id))}><X className="h-4 w-4" /></IconBtn>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-label text-foreground">Add offers</p>
        <Input inputSize="sm" placeholder="Search by plan or business" value={q} onChange={(e) => setQ(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />} aria-label="Search offers" />
        <div className="max-h-[372px] space-y-0.5 overflow-y-auto rounded-radius-md bg-background p-1">
          {available.length === 0 && <p className="p-3 text-meta text-muted-foreground">{needle ? "Nothing matches." : "Every live offer is already here."}</p>}
          {available.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={full || setPlans.isPending}
              onClick={() => setPlans.mutate([...ids, p.id])}
              className="flex w-full items-center gap-2 rounded-radius-sm px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
            >
              <Photo src={planPhotos(p)[0]} className="h-9 w-9 shrink-0 rounded-radius-sm object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-foreground">{p.name}</span>
                <span className="block truncate text-meta text-muted-foreground">
                  {[p.provider?.name, p.price_cents ? formatUSD(p.price_cents) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
