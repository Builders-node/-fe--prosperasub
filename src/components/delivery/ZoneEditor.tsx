import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Circle, MapPin, Pencil, Plus, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/patterns/Skeleton";
import { QueryError } from "@/components/patterns/QueryError";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ZONE_COLORS, etaText, zoneColor, type DeliveryZone } from "@/lib/delivery/zones";
import type { ZoneDraft } from "@/components/delivery/ZoneMap";

const ZoneMap = lazy(() => import("@/components/delivery/ZoneMap"));

/**
 * The zone editor — a list of zones beside a map: draw an area (click the
 * corners) or a circle of N km, give it a fee, a free-from threshold, a
 * minimum order and a promised time.
 *
 * One editor, two owners: the platform's zones (Admin → Delivery, platform
 * couriers, the fee is the platform's) and each business's own (its workspace
 * → Delivery: where it delivers itself or comes to the customer, the fee is
 * the business's). Only `basePath` and `call` differ.
 */

type Unit = "min" | "h" | "day";
const UNIT_MIN: Record<Unit, number> = { min: 1, h: 60, day: 1440 };
const splitEta = (m: number | null): { n: string; u: Unit } =>
  m == null ? { n: "", u: "min" }
  : m >= 1440 && m % 1440 === 0 ? { n: String(m / 1440), u: "day" }
  : m >= 60 && m % 60 === 0 ? { n: String(m / 60), u: "h" }
  : { n: String(m), u: "min" };

interface Form {
  id: string | null;
  name: string;
  fee: string;
  freeFrom: string;
  minOrder: string;
  etaMin: string;
  etaMax: string;
  etaUnit: Unit;
  isActive: boolean;
}

const dollars = (c: number | null | undefined) => (c == null ? "" : String(c / 100));
const cents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));


export interface ZoneEditorProps {
  /** Where the zones live: the platform's, or one business's. */
  basePath: string;
  /** Calls the api (adminApi or accountApi) and throws on an error. */
  call: <T = unknown>(path: string, method?: string, body?: unknown) => Promise<T>;
  queryKey: unknown[];
  /** Shown when there is nothing yet. */
  emptyText?: string;
  /** Words for the time field — "Delivery time", "Arrival time". */
  timeLabel?: string;
}

export function ZoneEditor({ basePath, call, queryKey, emptyText, timeLabel = "Delivery time" }: ZoneEditorProps) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey,
    queryFn: () => call<{ enabled: boolean; zones: DeliveryZone[] }>(basePath),
  });
  const zones = q.data?.zones ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey });
    void qc.invalidateQueries({ queryKey: ["provider-zones"] });
    void qc.invalidateQueries({ queryKey: ["delivery-zones"] });
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [draft, setDraft] = useState<ZoneDraft | null>(null);
  const [drawing, setDrawing] = useState(false);

  const startNew = () => {
    setSelectedId(null);
    setForm({ id: null, name: "", fee: "5", freeFrom: "", minOrder: "", etaMin: "30", etaMax: "60", etaUnit: "min", isActive: true });
    setDraft({ shape: "polygon", points: [], center: null, radiusM: 3000, color: ZONE_COLORS[zones.length % ZONE_COLORS.length] });
    setDrawing(true);
  };

  const startEdit = (z: DeliveryZone, i: number) => {
    setSelectedId(z.id);
    const lo = splitEta(z.eta_min_minutes);
    const hi = splitEta(z.eta_max_minutes);
    const unit = z.eta_max_minutes != null ? hi.u : lo.u;
    const inUnit = (m: number | null) => (m == null ? "" : String(+(m / UNIT_MIN[unit]).toFixed(2)));
    setForm({
      id: z.id, name: z.name, fee: dollars(z.fee_cents), freeFrom: dollars(z.free_from_cents), minOrder: dollars(z.min_order_cents),
      etaMin: inUnit(z.eta_min_minutes), etaMax: inUnit(z.eta_max_minutes), etaUnit: unit, isActive: z.is_active,
    });
    setDraft({
      shape: z.shape,
      points: z.polygon ?? [],
      center: z.center_lat != null && z.center_lng != null ? { lat: z.center_lat, lng: z.center_lng } : null,
      radiusM: z.radius_m ?? 3000,
      color: zoneColor(z, i),
    });
    setDrawing(false);
  };

  const close = () => { setForm(null); setDraft(null); setDrawing(false); };

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !draft) return;
      const toMin = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * UNIT_MIN[form.etaUnit]));
      const body = {
        name: form.name,
        shape: draft.shape,
        polygon: draft.shape === "polygon" ? draft.points : undefined,
        center: draft.shape === "circle" ? draft.center : undefined,
        radiusM: draft.shape === "circle" ? draft.radiusM : undefined,
        feeCents: cents(form.fee) ?? 0,
        freeFromCents: cents(form.freeFrom),
        minOrderCents: cents(form.minOrder),
        etaMinMinutes: toMin(form.etaMin),
        etaMaxMinutes: toMin(form.etaMax),
        color: draft.color,
        isActive: form.isActive,
      };
      return form.id
        ? call(`${basePath}/${form.id}`, "PATCH", body)
        : call(basePath, "POST", { ...body, sortOrder: zones.length });
    },
    onSuccess: () => { toast.success("Zone saved"); close(); refresh(); },
    onError: (e: Error) => toast.error(e.message || "Could not save the zone"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => call<{ archived: boolean }>(`${basePath}/${id}`, "DELETE"),
    onSuccess: (r) => { toast.success(r?.archived ? "Orders use this zone — it was switched off instead" : "Zone deleted"); close(); refresh(); },
    onError: (e: Error) => toast.error(e.message || "Could not delete it"),
  });

  const toggle = useMutation({
    mutationFn: (z: DeliveryZone) => call(`${basePath}/${z.id}`, "PATCH", { isActive: !z.is_active }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not change it"),
  });

  const onMapClick = (pt: { lat: number; lng: number }) => {
    setDraft((d) => {
      if (!d) return d;
      if (d.shape === "circle") return { ...d, center: pt };
      return { ...d, points: [...d.points, [pt.lng, pt.lat]] };
    });
  };

  const geometryOk = !!draft && (draft.shape === "circle" ? !!draft.center : draft.points.length >= 3);
  const canSave = !!form?.name.trim() && geometryOk && !save.isPending;

  if (q.isLoading) return <Skeleton className="h-[560px]" />;
  if (q.isError) return <QueryError title="Couldn't load the zones" error={q.error as Error} onRetry={() => void q.refetch()} />;
  if (q.data && !q.data.enabled) {
    return (
      <p className="rounded-radius-md bg-card p-4 text-body text-muted-foreground">
        Delivery needs the database migration (20261124120000_delivery_zones) before zones can be drawn.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-3">
        {form && draft ? (
          <section className="space-y-4 rounded-radius-lg bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title font-semibold text-foreground">{form.id ? "Edit zone" : "New zone"}</h2>
              <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="zn">Name</Label>
              <Input id="zn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="West End, Sandy Bay…" />
            </div>

            {/* Shape */}
            <div className="space-y-2">
              <Label>Area</Label>
              <div className="flex rounded-full bg-inset p-0.5">
                {([["polygon", "Draw on the map", MapPin], ["circle", "Circle", Circle]] as const).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setDraft({ ...draft, shape: v }); setDrawing(true); }}
                    className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition-colors",
                      draft.shape === v ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {draft.shape === "polygon" ? (
                <>
                  <p className="text-meta text-muted-foreground">
                    {drawing
                      ? draft.points.length < 3
                        ? `Click the map to place the corners — ${3 - draft.points.length} more to make an area.`
                        : `${draft.points.length} corners. Keep clicking to add more, or save.`
                      : `${draft.points.length} corners.`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {!drawing && <Button size="sm" variant="secondary" onClick={() => setDrawing(true)}><Pencil className="mr-1.5 h-4 w-4" /> Add corners</Button>}
                    <Button size="sm" variant="secondary" disabled={!draft.points.length}
                      onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })}><Undo2 className="mr-1.5 h-4 w-4" /> Undo</Button>
                    <Button size="sm" variant="secondary" disabled={!draft.points.length}
                      onClick={() => { setDraft({ ...draft, points: [] }); setDrawing(true); }}>Redraw</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-meta text-muted-foreground">
                    {draft.center ? "Click the map to move the centre." : "Click the map where the circle's centre is."}
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-meta text-muted-foreground">
                      <span>Radius</span><span className="tabular-nums text-foreground">{(draft.radiusM / 1000).toFixed(1)} km</span>
                    </div>
                    <input
                      type="range" min={500} max={20000} step={250} value={draft.radiusM}
                      onChange={(e) => setDraft({ ...draft, radiusM: Number(e.target.value) })}
                      className="w-full accent-[hsl(var(--primary))]"
                      aria-label="Radius"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Money label="Fee" value={form.fee} onChange={(v) => setForm({ ...form, fee: v })} />
              <Money label="Free from" value={form.freeFrom} onChange={(v) => setForm({ ...form, freeFrom: v })} placeholder="—" />
              <Money label="Min. order" value={form.minOrder} onChange={(v) => setForm({ ...form, minOrder: v })} placeholder="—" />
            </div>

            <div className="space-y-1.5">
              <Label>{timeLabel}</Label>
              <div className="flex items-center gap-2">
                <Input inputMode="decimal" value={form.etaMin} onChange={(e) => setForm({ ...form, etaMin: e.target.value })} className="w-20" aria-label="From" />
                <span className="text-muted-foreground">–</span>
                <Input inputMode="decimal" value={form.etaMax} onChange={(e) => setForm({ ...form, etaMax: e.target.value })} className="w-20" aria-label="To" />
                <Select value={form.etaUnit} onValueChange={(v) => setForm({ ...form, etaUnit: v as Unit })}>
                  <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="min">minutes</SelectItem>
                    <SelectItem value="h">hours</SelectItem>
                    <SelectItem value="day">days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Colour on the map</Label>
              <div className="flex flex-wrap gap-2">
                {ZONE_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setDraft({ ...draft, color: c })}
                    className={cn("h-7 w-7 rounded-full", draft.color === c && "outline outline-2 outline-offset-2 outline-foreground")}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 text-body text-foreground">
              Serving this zone
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </label>

            <div className="flex gap-2">
              <Button className="flex-1" disabled={!canSave} onClick={() => save.mutate()}>
                {save.isPending && <Spinner size="sm" className="mr-2" />}Save zone
              </Button>
              {form.id && (
                <Button variant="secondary" disabled={remove.isPending} aria-label="Delete zone"
                  onClick={() => { if (window.confirm(`Delete “${form.name}”?`)) remove.mutate(form.id!); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </section>
        ) : (
          <Button className="w-full" onClick={startNew}><Plus className="mr-2 h-4 w-4" /> New zone</Button>
        )}

        {zones.length === 0 && !form ? (
          <p className="rounded-radius-lg bg-card p-4 text-body text-muted-foreground">
            {emptyText ?? "No zones yet. Draw the first one — offers can then switch delivery on and customers see the price and time under the pin."}
          </p>
        ) : (
          <div className="space-y-1">
            {zones.map((z, i) => (
              <div key={z.id}
                className={cn("flex items-center gap-3 rounded-radius-md bg-card p-3 transition-colors", selectedId === z.id && "bg-inset")}>
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: zoneColor(z, i), opacity: z.is_active ? 1 : 0.35 }} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => startEdit(z, i)}>
                  <p className={cn("truncate text-body font-semibold", z.is_active ? "text-foreground" : "text-muted-foreground")}>{z.name}</p>
                  <p className="truncate text-meta text-muted-foreground">
                    {[
                      z.fee_cents ? formatUSD(z.fee_cents) : "Free",
                      etaText(z.eta_min_minutes, z.eta_max_minutes),
                      z.free_from_cents != null ? `free from ${formatUSD(z.free_from_cents)}` : null,
                      z.shape === "circle" && z.radius_m ? `${(z.radius_m / 1000).toFixed(1)} km circle` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </button>
                <Switch checked={z.is_active} onCheckedChange={() => toggle.mutate(z)} aria-label={`Deliver to ${z.name}`} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Suspense fallback={<Skeleton className="h-[560px]" />}>
        <ZoneMap
          className="h-[420px] lg:sticky lg:top-20 lg:h-[calc(100vh-160px)] lg:min-h-[560px]"
          zones={zones}
          selectedId={selectedId}
          editingId={form?.id ?? null}
          draft={draft}
          drawing={drawing && !!draft}
          onMapClick={onMapClick}
          onZoneClick={(id) => { const i = zones.findIndex((z) => z.id === id); if (i >= 0 && !form) startEdit(zones[i], i); }}
        />
      </Suspense>
    </div>
  );
}

function Money({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-meta">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
        <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-7" />
      </div>
    </div>
  );
}

