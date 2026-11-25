import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { TabPills } from "@/components/admin/TabPills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/patterns/Skeleton";
import { QueryError } from "@/components/patterns/QueryError";
import { adminApi } from "@/integrations/supabase/client";
import { useTabParam } from "@/hooks/useTabParam";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ZoneEditor } from "@/components/delivery/ZoneEditor";
import { format } from "date-fns";
import { useConfirm } from "@/components/patterns/ConfirmDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tr, trx, dfLocale } from "@/lib/tr";


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

export default function Delivery() {
  const [tab, setTab] = useTabParam(["zones", "deliveries", "couriers"] as const);
  return (
    <SuperAdminLayout title={tr("Delivery")} subtitle={tr("Where we deliver, for how much, and who brings it")}>
      <TabPills
        className="mb-4"
        tabs={[{ value: "zones", label: tr("Zones") }, { value: "deliveries", label: tr("Deliveries") }, { value: "couriers", label: tr("Couriers") }]}
        value={tab}
        onChange={setTab}
      />
      {tab === "zones" ? <ZonesTab /> : tab === "deliveries" ? <DeliveriesTab /> : <CouriersTab />}
    </SuperAdminLayout>
  );
}

// ── Zones ────────────────────────────────────────────────────────────────────

function ZonesTab() {
  return <ZoneEditor basePath="/admin/delivery/zones" call={call} queryKey={ZONES_KEY} />;
}

// ── Deliveries ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: tr("New"), assigned: tr("Assigned"), on_the_way: tr("On the way"), delivered: tr("Delivered"), failed: tr("Failed"),
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
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-deliveries"] }); toast.success(tr("Updated")); },
    onError: (e: Error) => toast.error(e.message || tr("Could not update")),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <QueryError title={tr("Couldn't load deliveries")} error={q.error as Error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[["open", tr("To deliver")], ["delivered", "Delivered"], ["failed", "Failed"], ["all", "All"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setStatus(v)}
            className={cn("h-9 rounded-full px-4 text-[14px] font-semibold transition-colors",
              status === v ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-radius-lg bg-card p-4 text-body text-muted-foreground">
          {status === "open" ? tr("Nothing to deliver right now.") : tr("No deliveries here.")}
        </p>
      ) : rows.map((r) => {
        const p = r.delivery_point;
        return (
          <div key={r.id} className="space-y-3 rounded-radius-lg bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{r.metadata?.plan_name ?? "Order"} · {r.providers?.name ?? "—"}</p>
                <p className="text-meta text-muted-foreground">
                  {[r.metadata?.customer_name, r.customer_whatsapp, format(new Date(r.created_at), "MMM d, HH:mm", { locale: dfLocale })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="text-meta tabular-nums text-muted-foreground">
                {r.delivery_zones?.name ?? "Zone"} · {r.delivery_fee_cents ? formatUSD(r.delivery_fee_cents) : "free"}
              </p>
            </div>
            {p && (
              <div className="rounded-radius-md bg-inset p-3 text-body">
                <p className="text-foreground">{p.line ?? tr("Pinned location")}</p>
                {p.details && <p className="text-meta text-muted-foreground">{p.details}</p>}
                <a className="text-meta font-semibold text-primary" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}>{tr("Open in Maps")}</a>
              </div>
            )}
            {r.notes && <p className="text-meta text-muted-foreground">{trx("Note: {notes}", { notes: r.notes })}</p>}
            <div className="flex flex-wrap gap-2">
              <Select value={r.delivery_status ?? "pending"} onValueChange={(v) => update.mutate({ id: r.id, status: v })}>
                <SelectTrigger inputSize="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={r.courier_id ?? "none"} onValueChange={(v) => update.mutate({ id: r.id, courierId: v === "none" ? null : v })}>
                <SelectTrigger inputSize="sm" className="w-[180px]"><SelectValue placeholder={tr("Courier")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr("No courier")}</SelectItem>
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
  const [confirm, confirmDialog] = useConfirm();
  // In-product dialog instead of the browser's grey prompt box.
  const [linkFor, setLinkFor] = useState<Courier | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const add = useMutation({
    mutationFn: () => call("/admin/couriers", "POST", { name, phone, email: email.trim() || undefined }),
    onSuccess: () => { setName(""); setPhone(""); setEmail(""); refresh(); toast.success(tr("Courier added")); },
    onError: (e: Error) => toast.error(e.message || tr("Could not add")),
  });
  const toggle = useMutation({
    mutationFn: (c: Courier) => call(`/admin/couriers/${c.id}`, "PATCH", { isActive: !c.is_active }),
    onSuccess: refresh,
  });
  /** Linking an account is what opens /courier for that person. */
  const link = useMutation({
    mutationFn: ({ id, email: e }: { id: string; email: string | null }) => call(`/admin/couriers/${id}`, "PATCH", { email: e }),
    onSuccess: (_d, v) => { refresh(); setLinkFor(null); toast.success(v.email ? tr("Account linked — they can open everysub.net/courier") : tr("Account unlinked")); },
    onError: (e: Error) => toast.error(e.message || tr("Could not link it")),
  });
  if (q.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="max-w-[720px] space-y-3">
      {confirmDialog}
      <AlertDialog open={!!linkFor} onOpenChange={(o) => { if (!o) setLinkFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trx("Link {name}'s account", { name: linkFor?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{tr("The email they sign in to EverySub with. Linking opens everysub.net/courier for them.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input type="email" autoFocus value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="name@example.com" />
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Back")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!linkEmail.trim() || link.isPending}
              onClick={(e) => { e.preventDefault(); if (linkFor) link.mutate({ id: linkFor.id, email: linkEmail.trim() }); }}
            >
              {link.isPending ? tr("Linking…") : tr("Link account")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p className="text-body text-muted-foreground">{tr("A courier with a linked account opens")}{" "}<span className="font-semibold text-foreground">{tr("everysub.net/courier")}</span>{" "}{tr("on their phone: their deliveries, directions, and the buttons that tell the customer it is on the way and delivered.")}</p>
      <div className="flex flex-wrap gap-2 rounded-radius-lg bg-card p-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Name")} className="min-w-[160px] flex-1" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tr("WhatsApp")} className="min-w-[160px] flex-1" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("Their EverySub account email")} className="min-w-[220px] flex-[2]" />
        <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="mr-1.5 h-4 w-4" />{" "}{tr("Add")}</Button>
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
            onClick={async () => {
              if (c.user_id) {
                if (await confirm({ title: tr("Unlink {name}'s account?", { name: c.name }), description: tr("They lose access to the courier screen until linked again."), confirmLabel: tr("Unlink") })) link.mutate({ id: c.id, email: null });
                return;
              }
              setLinkEmail(""); setLinkFor(c);
            }}>
            {c.user_id ? tr("Unlink") : tr("Link account")}
          </Button>
          <Switch checked={c.is_active} onCheckedChange={() => toggle.mutate(c)} aria-label={tr("{name} is working", { name: c.name })} />
        </div>
      ))}
    </div>
  );
}
