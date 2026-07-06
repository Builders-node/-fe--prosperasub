import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, CalendarDays, Users } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { todayHN } from "@/lib/timezone";
import { toast } from "sonner";

interface Provider { id: string; name: string; }
interface Slot {
  id: string; provider_id: string; date: string; start_time: string; end_time: string;
  capacity: number; current_bookings: number; status: string;
}
const fmtTime = (t: string) => t?.slice(0, 5);

const MassageCalendar = () => {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState<string>("");
  const [form, setForm] = useState({ date: todayHN(), start_time: "10:00", end_time: "11:00", capacity: 1 });

  const { data: providers = [] } = useQuery({
    queryKey: ["admin-massage-providers-min"],
    queryFn: async () => {
      const { data } = await supabaseDb.from("massage_providers").select("id, name").order("sort_order");
      const list = (data ?? []) as Provider[];
      if (!providerId && list.length) setProviderId(list[0].id);
      return list;
    },
  });

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["admin-massage-slots", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("massage_slots").select("*")
        .eq("provider_id", providerId).gte("date", todayHN())
        .order("date").order("start_time");
      if (error) throw error;
      return (data ?? []) as Slot[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error("Pick a provider");
      if (form.end_time <= form.start_time) throw new Error("End time must be after start time");
      const { error } = await supabaseDb.from("massage_slots").insert({
        provider_id: providerId, date: form.date, start_time: form.start_time, end_time: form.end_time,
        capacity: form.capacity, current_bookings: 0, status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slot added"); qc.invalidateQueries({ queryKey: ["admin-massage-slots", providerId] }); },
    onError: (e: any) => toast.error(e?.message || "Could not add slot"),
  });

  const del = useMutation({
    mutationFn: async (s: Slot) => {
      if (s.current_bookings > 0) throw new Error("Slot has bookings — cannot delete");
      const { error } = await supabaseDb.from("massage_slots").delete().eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Slot removed"); qc.invalidateQueries({ queryKey: ["admin-massage-slots", providerId] }); },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  // Group slots by date
  const byDate: Record<string, Slot[]> = {};
  slots.forEach((s) => { (byDate[s.date] ??= []).push(s); });

  return (
    <SuperAdminLayout title="Massage — Calendar">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">Available appointment slots clients can book.</p>
          </div>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-9 w-[200px] rounded-full"><SelectValue placeholder="Provider" /></SelectTrigger>
            <SelectContent>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {providers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-14 text-center text-sm text-muted-foreground">Create a provider first.</div>
        ) : (
          <>
            {/* Add slot */}
            <section className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Add slot</p>
              <div className="flex flex-wrap items-end gap-3">
                <div><Label className="text-xs">Date</Label><Input type="date" min={todayHN()} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 w-[160px]" /></div>
                <div><Label className="text-xs">From</Label><Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className="h-9 w-[120px]" /></div>
                <div><Label className="text-xs">To</Label><Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} className="h-9 w-[120px]" /></div>
                <div><Label className="text-xs">Capacity</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: parseInt(e.target.value || "1") }))} className="h-9 w-[90px]" /></div>
                <Button onClick={() => add.mutate()} disabled={add.isPending} className="h-9 gap-2 rounded-full">
                  {add.isPending ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />} Add
                </Button>
              </div>
            </section>

            {/* Upcoming slots grouped by date */}
            {isLoading ? (
              <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>
            ) : slots.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card py-14 text-center">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="font-semibold">No upcoming slots</p>
                <p className="mt-1 text-sm text-muted-foreground">Add availability above so clients can book.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(byDate).map(([date, daySlots]) => (
                  <div key={date} className="rounded-2xl border border-border bg-card p-4">
                    <p className="mb-2 font-bold text-foreground">{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((s) => {
                        const full = s.current_bookings >= s.capacity;
                        return (
                          <div key={s.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${full ? "border-border bg-muted/40 text-muted-foreground" : "border-rose-500/30 bg-rose-500/5"}`}>
                            <span className="font-semibold tabular-nums">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                            <Badge className="rounded-full bg-muted text-[10px]"><Users className="mr-0.5 h-2.5 w-2.5" />{s.current_bookings}/{s.capacity}</Badge>
                            <button type="button" onClick={() => del.mutate(s)} className="text-muted-foreground hover:text-destructive" title="Remove slot"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default MassageCalendar;
