import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Circle, MapPin, Pencil, Plus, Trash2, Undo2 } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { TabPills } from "@/components/admin/TabPills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/patterns/Skeleton";
import { QueryError } from "@/components/patterns/QueryError";
import { adminApi } from "@/integrations/supabase/client";
import { useTabParam } from "@/hooks/useTabParam";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ZONE_COLORS, etaText, zoneColor, type DeliveryZone } from "@/lib/delivery/zones";
import type { ZoneDraft } from "@/components/delivery/ZoneMap";
import { format } from "date-fns";

const ZoneMap = lazy(() => import("@/components/delivery/ZoneMap"));

/**
 * Delivery — the platform's zones, the deliveries into them, and the couriers.
 *
 * A zone is drawn on the map (click the corners) or is a circle of N km around
 * a point; each has its price, a free-from threshold, a minimum order and the
 * time it promises. Offers switch delivery on in their editor and choose which
 * zones; the checkout prices it from here and the database checks it again.
 *
 * The fee is the platform's (platform couriers deliver), so it never reaches a
 * business's balance.
 */

const ZONES_KEY = ["admin-delivery-zones"];

async function call<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { data, error } = await adminApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (error) throw error;
  return data as T;
}

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

export default function Delivery() {
  const [tab, setTab] = useTabParam(["zones", "deliveries", "couriers"] as const);
  return (
    <SuperAdminLayout title="Delivery" subtitle="Where we deliver, for how much, and who brings it">
      <TabPills
        className="mb-4"
        tabs={[{ value: "zones", label: "Zones" }, { value: "deliveries", label: "Deliveries" }, { value: "couriers", label: "Couriers" }]}
        value={tab}
        onChange={setTab}
      />
      {tab === "zones" ? <ZonesTab /> : tab === "deliveries" ? <DeliveriesTab /> : <CouriersTab />}
    </SuperAdminLayout>
  );
}

// ── Zones ────────────────────────────────────────────────────────────────────

function ZonesTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ZONES_KEY,
    queryFn: () => call<{ enabled: boolean; zones: DeliveryZone[] }>("/admin/delivery/zones"),
  });
  const zones = q.data?.zones ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ZONES_KEY });
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
        ? call(`/admin/delivery/zones/${form.id}`, "PATCH", body)
        : call("/admin/delivery/zones", "POST", { ...body, sortOrder: zones.length });
    },
    onSuccess: () => { toast.success("Zone saved"); close(); refresh(); },
    onError: (e: Error) => toast.error(e.message || "Could not save the zone"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => call<{ archived: boolean }>(`/admin/delivery/zones/${id}`, "DELETE"),
    onSuccess: (r) => { toast.success(r?.archived ? "Orders use this zone — it was switched off instead" : "Zone deleted"); close(); refresh(); },
    onError: (e: Error) => toast.error(e.message || "Could not delete it"),
  });

  const toggle = useMutation({
    mutationFn: (z: DeliveryZone) => call(`/admin/delivery/zones/${z.id}`, "PATCH", { isActive: !z.is_active }),
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
              <Label>Delivery time</Label>
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
              Delivering to this zone
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
            No zones yet. Draw the first one — offers can then switch delivery on and customers see the price and time under the pin.
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

// ── Deliveries ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "New", assigned: "Assigned", on_the_way: "On the way", delivered: "Delivered", failed: "Failed",
};

interface DeliveryRow {
  id: string;
  start_date: string;
  price_cents: number;
  delivery_fee_cents: number;
  delivery_point: { lat: number; lng: number; line?: string; details?: string } | null;
  delivery_status: string | null;
  courier_id: string | null;
  customer_whatsapp: string | null;
  notes: string | null;
  metadata: { plan_name?: string; customer_name?: string } | null;
  created_at: string;
  providers: { name: string } | null;
  delivery_zones: { name: string } | null;
}
interface Courier { id: string; name: string; phone: string | null; is_active: boolean; user_id: string | null }

function useCouriers() {
  return useQuery({
    queryKey: ["admin-couriers"],
    queryFn: () => call<{ enabled: boolean; couriers: Courier[] }>("/admin/couriers"),
  });
}

function DeliveriesTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("open");
  const q = useQuery({
    queryKey: ["admin-deliveries"],
    queryFn: () => call<{ enabled: boolean; rows: DeliveryRow[] }>("/admin/deliveries"),
  });
  const couriers = useCouriers().data?.couriers.filter((c) => c.is_active) ?? [];
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) =>
    status === "all" ? true
    : status === "open" ? !["delivered", "failed"].includes(r.delivery_status ?? "")
    : r.delivery_status === status), [q.data, status]);

  const update = useMutation({
    mutationFn: ({ id, ...b }: { id: string; status?: string; courierId?: string | null }) => call(`/admin/deliveries/${id}`, "PATCH", b),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-deliveries"] }); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message || "Could not update"),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <QueryError title="Couldn't load deliveries" error={q.error as Error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[["open", "To deliver"], ["delivered", "Delivered"], ["failed", "Failed"], ["all", "All"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setStatus(v)}
            className={cn("h-9 rounded-full px-4 text-[14px] font-semibold transition-colors",
              status === v ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-radius-lg bg-card p-4 text-body text-muted-foreground">
          {status === "open" ? "Nothing to deliver right now." : "No deliveries here."}
        </p>
      ) : rows.map((r) => {
        const p = r.delivery_point;
        return (
          <div key={r.id} className="space-y-3 rounded-radius-lg bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{r.metadata?.plan_name ?? "Order"} · {r.providers?.name ?? "—"}</p>
                <p className="text-meta text-muted-foreground">
                  {[r.metadata?.customer_name, r.customer_whatsapp, format(new Date(r.created_at), "MMM d, HH:mm")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="text-meta tabular-nums text-muted-foreground">
                {r.delivery_zones?.name ?? "Zone"} · {r.delivery_fee_cents ? formatUSD(r.delivery_fee_cents) : "free"}
              </p>
            </div>
            {p && (
              <div className="rounded-radius-md bg-inset p-3 text-body">
                <p className="text-foreground">{p.line ?? "Pinned location"}</p>
                {p.details && <p className="text-meta text-muted-foreground">{p.details}</p>}
                <a className="text-meta font-semibold text-primary" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}>Open in Maps</a>
              </div>
            )}
            {r.notes && <p className="text-meta text-muted-foreground">Note: {r.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Select value={r.delivery_status ?? "pending"} onValueChange={(v) => update.mutate({ id: r.id, status: v })}>
                <SelectTrigger inputSize="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={r.courier_id ?? "none"} onValueChange={(v) => update.mutate({ id: r.id, courierId: v === "none" ? null : v })}>
                <SelectTrigger inputSize="sm" className="w-[180px]"><SelectValue placeholder="Courier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No courier</SelectItem>
                  {couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Couriers ─────────────────────────────────────────────────────────────────

function CouriersTab() {
  const qc = useQueryClient();
  const q = useCouriers();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-couriers"] });
  const add = useMutation({
    mutationFn: () => call("/admin/couriers", "POST", { name, phone, email: email.trim() || undefined }),
    onSuccess: () => { setName(""); setPhone(""); setEmail(""); refresh(); toast.success("Courier added"); },
    onError: (e: Error) => toast.error(e.message || "Could not add"),
  });
  const toggle = useMutation({
    mutationFn: (c: Courier) => call(`/admin/couriers/${c.id}`, "PATCH", { isActive: !c.is_active }),
    onSuccess: refresh,
  });
  /** Linking an account is what opens /courier for that person. */
  const link = useMutation({
    mutationFn: ({ id, email: e }: { id: string; email: string | null }) => call(`/admin/couriers/${id}`, "PATCH", { email: e }),
    onSuccess: (_d, v) => { refresh(); toast.success(v.email ? "Account linked — they can open everysub.net/courier" : "Account unlinked"); },
    onError: (e: Error) => toast.error(e.message || "Could not link it"),
  });
  if (q.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="max-w-[720px] space-y-3">
      <p className="text-body text-muted-foreground">
        A courier with a linked account opens <span className="font-semibold text-foreground">everysub.net/courier</span> on their phone:
        their deliveries, directions, and the buttons that tell the customer it is on the way and delivered.
      </p>
      <div className="flex flex-wrap gap-2 rounded-radius-lg bg-card p-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="min-w-[160px] flex-1" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" className="min-w-[160px] flex-1" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their EverySub account email" className="min-w-[220px] flex-[2]" />
        <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="mr-1.5 h-4 w-4" /> Add</Button>
      </div>
      {(q.data?.couriers ?? []).map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-radius-md bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className={cn("text-body font-semibold", c.is_active ? "text-foreground" : "text-muted-foreground")}>{c.name}</p>
            <p className="text-meta text-muted-foreground">
              {[c.phone, c.user_id ? "Account linked · opens /courier" : "No account linked"].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="secondary" disabled={link.isPending}
            onClick={() => {
              if (c.user_id) { if (window.confirm(`Unlink ${c.name}'s account?`)) link.mutate({ id: c.id, email: null }); return; }
              const e = window.prompt(`${c.name}'s EverySub account email`)?.trim();
              if (e) link.mutate({ id: c.id, email: e });
            }}>
            {c.user_id ? "Unlink" : "Link account"}
          </Button>
          <Switch checked={c.is_active} onCheckedChange={() => toggle.mutate(c)} aria-label={`${c.name} is working`} />
        </div>
      ))}
    </div>
  );
}
