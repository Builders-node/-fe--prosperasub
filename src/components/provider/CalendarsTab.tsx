import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StatusPill } from "@/components/patterns/StatusPill";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabaseDb } from "@/integrations/supabase/client";
import { WorkspaceCard, WorkspaceEmpty, WorkspaceSection } from "@/components/provider/WorkspaceUI";

/**
 * The calendars a business takes bookings on.
 *
 * A court, a treatment room, a table, a desk, a van — one row each in
 * `bookable_resources`, which the booking engine has always read: it generates
 * slots from the resource's type and hours, holds and confirms against its id,
 * and refuses a customer whose plan does not name it. All of that was already
 * general; only the authoring was not. Courts were edited on a beach-shaped
 * admin page, so no other kind of business could create a calendar at all.
 *
 * What a plan opens is set on the plan (Offerings → a plan → the resources it
 * includes), not here. This screen answers "what can be booked", the plan
 * answers "by whom, and how much".
 */

interface ResourceRow {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
  hours: { open_hour?: number; close_hour?: number; slot_minutes?: number } | null;
  metadata: Record<string, unknown> | null;
  status: string;
  sort_order: number;
  source_service_key: string | null;
  source_resource_id: string | null;
}

interface TypeRow { key: string; label: string; booking_model: string }

const DEFAULTS = { open_hour: 8, close_hour: 19, slot_minutes: 60 };

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

const hoursSummary = (r: ResourceRow) => {
  const open = r.hours?.open_hour ?? DEFAULTS.open_hour;
  const close = r.hours?.close_hour ?? DEFAULTS.close_hour;
  const slot = r.hours?.slot_minutes ?? DEFAULTS.slot_minutes;
  return `${hourLabel(open)}–${hourLabel(close)} · ${slot} min`;
};

export function CalendarsTab({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const KEY = ["provider-calendars", providerId] as const;
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, type, capacity, hours, metadata, status, sort_order, source_service_key, source_resource_id")
        .eq("provider_id", providerId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
  });

  const { data: types = [] } = useQuery({
    queryKey: ["resource-types"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("resource_types")
        .select("key, label, booking_model")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TypeRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .insert({
          provider_id: providerId,
          name: "New calendar",
          type: types[0]?.key ?? "appointment",
          hours: DEFAULTS,
          metadata: {},
          // Off until it has been named and its hours checked — a calendar
          // that appears bookable the instant it is created will be booked.
          status: "paused",
          sort_order: rows.length,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ResourceRow;
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: KEY });
      setEditing(row);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't add the calendar"),
  });

  const del = useMutation({
    mutationFn: async (row: ResourceRow) => {
      const { error } = await supabaseDb.from("bookable_resources").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: KEY });
      setDeleteTarget(null);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete"),
  });

  const typeLabel = (key: string) => types.find((t) => t.key === key)?.label ?? key;

  return (
    <>
      <WorkspaceSection
        title="Calendars"
        subtitle="What can be booked here — a court, a room, a table, a chair. Which plan opens which one is set on the plan."
        action={
          <Button className="shrink-0 gap-2 rounded-full" disabled={add.isPending} onClick={() => add.mutate()}>
            <Plus className="h-4 w-4" /> {add.isPending ? "Adding…" : "New"}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-1">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-radius-lg bg-card" />)}
        </div>
      ) : rows.length === 0 ? (
        <WorkspaceCard>
          <WorkspaceEmpty>
            No calendars yet. Add one for each thing a customer can book a time on — they all
            work the same way, whatever the business.
          </WorkspaceEmpty>
        </WorkspaceCard>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <article key={r.id} className="flex items-center gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-semibold leading-[22px] text-foreground">{r.name}</h3>
                  {r.status !== "active" && <StatusPill status={r.status} />}
                </div>
                <p className="mt-0.5 text-[14px] leading-[18px] text-muted-foreground">
                  {typeLabel(r.type)} · {hoursSummary(r)}
                  {r.capacity ? ` · ${r.capacity} at a time` : ""}
                </p>
              </div>
              <Button
                size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-full px-3"
                onClick={() => setEditing(r)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </article>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[92vh] rounded-t-radius-lg p-0" : "w-full max-w-xl p-0 sm:max-w-xl"}
        >
          <SheetHeader className="px-4 py-4">
            <SheetTitle className="text-[20px] font-semibold leading-[26px]">
              {editing?.name || "Calendar"}
            </SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-64px)] overflow-y-auto bg-background px-4 pb-8 pt-1">
            {editing && (
              <CalendarForm
                row={editing}
                types={types}
                onSaved={() => { qc.invalidateQueries({ queryKey: KEY }); setEditing(null); }}
                onDelete={() => setDeleteTarget(editing)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong className="text-foreground">{deleteTarget.name}</strong> disappears from
                  every plan that names it, and bookings already taken on it lose the thing they
                  point at. To stop taking new ones, set it to paused instead.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && del.mutate(deleteTarget)}
            >
              {del.isPending ? <Spinner size="sm" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CalendarForm({ row, types, onSaved, onDelete }: {
  row: ResourceRow;
  types: TypeRow[];
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(() => ({
    name: row.name,
    type: row.type,
    capacity: row.capacity != null ? String(row.capacity) : "",
    open: String(row.hours?.open_hour ?? DEFAULTS.open_hour),
    close: String(row.hours?.close_hour ?? DEFAULTS.close_hour),
    slot: String(row.hours?.slot_minutes ?? DEFAULTS.slot_minutes),
    description: String(row.metadata?.description ?? ""),
    active: row.status === "active",
  }));
  useEffect(() => {
    setForm({
      name: row.name,
      type: row.type,
      capacity: row.capacity != null ? String(row.capacity) : "",
      open: String(row.hours?.open_hour ?? DEFAULTS.open_hour),
      close: String(row.hours?.close_hour ?? DEFAULTS.close_hour),
      slot: String(row.hours?.slot_minutes ?? DEFAULTS.slot_minutes),
      description: String(row.metadata?.description ?? ""),
      active: row.status === "active",
    });
  }, [row]);

  const model = types.find((t) => t.key === form.type)?.booking_model ?? "time_slot";
  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("The calendar needs a name.");
      const open = num(form.open), close = num(form.close), slot = num(form.slot);
      if (!(open >= 0 && close > open && close <= 24)) {
        throw new Error("Opening hours must run forwards, inside one day.");
      }
      if (!(slot > 0)) throw new Error("A slot has to be longer than nothing.");

      const { error } = await supabaseDb
        .from("bookable_resources")
        .update({
          name: form.name.trim(),
          type: form.type,
          capacity: form.capacity.trim() ? Math.max(1, Math.round(num(form.capacity))) : null,
          hours: { open_hour: Math.round(open), close_hour: Math.round(close), slot_minutes: Math.round(slot) },
          // Merge, never replace: the metadata carries the Google calendar id
          // and the iCal token, and writing the object wholesale would drop
          // them the first time somebody edited a description.
          metadata: { ...(row.metadata ?? {}), description: form.description.trim() || null },
          status: form.active ? "active" : "paused",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message || "Couldn't save"),
  });

  return (
    <div className="space-y-1">
      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">What it is</p>
        <div>
          <Label className="text-[14px] font-normal text-muted-foreground">Name</Label>
          <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <Label className="text-[14px] font-normal text-muted-foreground">Kind</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          >
            {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="mt-1 text-[14px] leading-[18px] text-muted-foreground">
            {model === "time_slot" ? "Booked by the hour, in slots."
              : model === "date_range" ? "Booked by whole days, from one date to another."
              : "Booked by the seat — several people share the same hours."}
          </p>
        </div>
        <div>
          <Label className="text-[14px] font-normal text-muted-foreground">Description</Label>
          <Textarea
            className="mt-1" rows={2} value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Clay surface, shaded until noon…"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">When it is open</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-[14px] font-normal text-muted-foreground">Opens</Label>
            <Input className="mt-1" inputMode="numeric" value={form.open}
              onChange={(e) => setForm((f) => ({ ...f, open: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[14px] font-normal text-muted-foreground">Closes</Label>
            <Input className="mt-1" inputMode="numeric" value={form.close}
              onChange={(e) => setForm((f) => ({ ...f, close: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[14px] font-normal text-muted-foreground">Slot, min</Label>
            <Input className="mt-1" inputMode="numeric" value={form.slot}
              onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))} />
          </div>
        </div>
        <p className="text-[14px] leading-[18px] text-muted-foreground">
          Whole hours, the same every day of the week. This is what the booking engine publishes
          for this calendar — it overrides the business's own working hours.
        </p>
        {model === "capacity_seat" && (
          <div>
            <Label className="text-[14px] font-normal text-muted-foreground">How many at a time</Label>
            <Input className="mt-1" inputMode="numeric" value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="1" />
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <p className="text-[20px] font-semibold leading-[26px] text-foreground">Taking bookings</p>
        <label className="flex items-center gap-3">
          <input
            type="checkbox" className="h-5 w-5 rounded"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          <span className="text-[16px] leading-[22px] text-foreground">
            {form.active ? "Open for bookings" : "Paused — nothing new can be booked"}
          </span>
        </label>
        {row.source_service_key === "beach" && (
          <p className="text-[14px] leading-[18px] text-muted-foreground">
            This one is also a beach court. Its day grid, its iCal feed and its Google calendar
            still live on the{" "}
            <a href="/admin/beach-club/courts" className="font-semibold text-primary underline-offset-2 hover:underline">
              courts page <ExternalLink className="inline h-3 w-3" />
            </a>{" "}
            until that screen is general too. What you set here is mirrored to it.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button className="rounded-full" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save calendar"}
        </Button>
        <Button variant="ghost" className="ml-auto rounded-full text-destructive hover:text-destructive"
          onClick={onDelete}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}
