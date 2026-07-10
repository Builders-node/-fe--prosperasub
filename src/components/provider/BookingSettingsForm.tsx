import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Clock, CalendarX2, Timer, Plus, Trash2, CalendarDays, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BOOKING_SETTINGS, DURATION_PRESETS, WEEKDAY_LABELS,
  computeSlots, normalizeBookingSettings, to12h,
  type BookingSettings, type BlockedRange, type DayHours,
} from "@/lib/booking/bookingSettings";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";

const inputCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-40";

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `r-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

function Section({ icon: Icon, title, subtitle, children }: {
  icon: typeof Clock; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function NumberField({ label, suffix, value, min, max, onChange }: {
  label: string; suffix?: string; value: number; min?: number; max?: number; onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="relative">
        <input
          type="number" inputMode="numeric" min={min ?? 0} max={max}
          value={value}
          onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
          className={cn(inputCls, "w-full pr-10 text-right tabular-nums")}
        />
        {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

/**
 * Pure controlled editor for a `BookingSettings` value. Renders the whole UI
 * (working hours + session/buffers + rules + blocked days/ranges + live
 * preview) but delegates persistence to the caller — so it can be embedded
 * anywhere a config lives (per-provider, per-plan, per-resource, …).
 */
export function BookingSettingsEditor({
  value, onChange,
}: {
  value: BookingSettings;
  onChange: (next: BookingSettings) => void;
}) {
  const [previewDate, setPreviewDate] = useState<string>("");
  const [newBlockDate, setNewBlockDate] = useState<string>("");

  const s = value;
  const patch = (p: Partial<BookingSettings>) => onChange({ ...s, ...p });
  const setDay = (i: number, p: Partial<DayHours>) =>
    onChange({ ...s, weekly: s.weekly.map((w, j) => (j === i ? { ...w, ...p } : w)) });

  const addBlockedDate = () => {
    if (!newBlockDate || s.blockedDates.includes(newBlockDate)) return;
    patch({ blockedDates: [...s.blockedDates, newBlockDate].sort() });
    setNewBlockDate("");
  };
  const addBlockedRange = () =>
    patch({ blockedRanges: [...s.blockedRanges, { id: newId(), date: previewDate || "", from: "12:00", to: "13:00", note: "" }] });
  const setRange = (id: string, p: Partial<BlockedRange>) =>
    patch({ blockedRanges: s.blockedRanges.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  const previewSlots = useMemo(() => (previewDate ? computeSlots(s, previewDate) : []), [s, previewDate]);

  return (
    <div className="space-y-4">
      {/* Working hours */}
      <Section icon={CalendarClock} title="Working hours" subtitle="Set the days you're open and the From–To window for each.">
        <div className="space-y-2">
          {s.weekly.map((day, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
              <div className="flex w-32 items-center gap-2">
                <Switch checked={day.enabled} onCheckedChange={(v) => setDay(i, { enabled: v })} />
                <span className={cn("text-sm font-semibold", day.enabled ? "text-foreground" : "text-muted-foreground")}>
                  {WEEKDAY_LABELS[i]}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="time" value={day.from} disabled={!day.enabled}
                  onChange={(e) => setDay(i, { from: e.target.value })} className={inputCls} />
                <span>—</span>
                <input type="time" value={day.to} disabled={!day.enabled}
                  onChange={(e) => setDay(i, { to: e.target.value })} className={inputCls} />
              </div>
              {day.enabled ? null : <span className="text-xs text-muted-foreground">Closed</span>}
            </div>
          ))}
        </div>
      </Section>

      {/* Session + buffers */}
      <Section icon={Timer} title="Session & buffers" subtitle="How long each appointment is, and gaps around it.">
        <div className="space-y-4">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Session duration</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {DURATION_PRESETS.map((d) => (
                <button key={d} type="button" onClick={() => patch({ sessionDurationMin: d })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition",
                    s.sessionDurationMin === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}>
                  {d} min
                </button>
              ))}
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                <input type="number" min={5} step={5} value={s.sessionDurationMin}
                  onChange={(e) => patch({ sessionDurationMin: Math.max(5, Number(e.target.value) || 5) })}
                  className="w-14 bg-transparent text-right text-sm tabular-nums outline-none" />
                <span className="text-xs text-muted-foreground">min</span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <NumberField label="Buffer before" suffix="min" value={s.bufferBeforeMin} onChange={(n) => patch({ bufferBeforeMin: n })} />
            <NumberField label="Buffer after" suffix="min" value={s.bufferAfterMin} onChange={(n) => patch({ bufferAfterMin: n })} />
          </div>
        </div>
      </Section>

      {/* Scheduling rules */}
      <Section icon={Clock} title="Scheduling rules" subtitle="How far ahead customers can book.">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <NumberField label="Minimum notice" suffix="hrs" value={s.minNoticeHours} onChange={(n) => patch({ minNoticeHours: n })} />
          <NumberField label="Book up to" suffix="days" value={s.maxAdvanceDays} min={1} onChange={(n) => patch({ maxAdvanceDays: Math.max(1, n) })} />
        </div>
      </Section>

      {/* Blocked days + ranges */}
      <Section icon={CalendarX2} title="Blocked & unavailable" subtitle="Close specific days entirely, or block time ranges within a day.">
        <div className="space-y-5">
          <div>
            <span className="text-xs font-semibold text-muted-foreground">Blocked days (full day off)</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input type="date" value={newBlockDate} onChange={(e) => setNewBlockDate(e.target.value)} className={inputCls} />
              <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={addBlockedDate} disabled={!newBlockDate}>
                <Plus className="h-4 w-4" /> Block day
              </Button>
            </div>
            {s.blockedDates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.blockedDates.map((d) => (
                  <Badge key={d} variant="secondary" className="gap-1 rounded-full">
                    {d}
                    <button type="button" onClick={() => patch({ blockedDates: s.blockedDates.filter((x) => x !== d) })} aria-label={`Unblock ${d}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Blocked time ranges</span>
              <Button type="button" size="sm" variant="tertiary" className="gap-1" onClick={addBlockedRange}>
                <Plus className="h-4 w-4" /> Add range
              </Button>
            </div>
            {s.blockedRanges.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground/70">No blocked ranges.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {s.blockedRanges.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-2">
                    <input type="date" value={r.date} onChange={(e) => setRange(r.id, { date: e.target.value })} className={inputCls} />
                    <input type="time" value={r.from} onChange={(e) => setRange(r.id, { from: e.target.value })} className={inputCls} />
                    <span className="text-muted-foreground">—</span>
                    <input type="time" value={r.to} onChange={(e) => setRange(r.id, { to: e.target.value })} className={inputCls} />
                    <input type="text" placeholder="Note (optional)" value={r.note ?? ""} onChange={(e) => setRange(r.id, { note: e.target.value })}
                      className={cn(inputCls, "min-w-[120px] flex-1")} />
                    <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive"
                      onClick={() => patch({ blockedRanges: s.blockedRanges.filter((x) => x.id !== r.id) })} aria-label="Remove range">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Live preview */}
      <Section icon={CalendarDays} title="Preview" subtitle="Pick a date to see the slots this configuration generates.">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} className={inputCls} />
          {previewDate && <span className="text-sm text-muted-foreground">{previewSlots.length} slot{previewSlots.length === 1 ? "" : "s"}</span>}
        </div>
        {previewDate && (
          previewSlots.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {previewSlots.map((slot) => (
                <span key={slot.from} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs tabular-nums text-foreground">
                  {to12h(slot.from)} – {to12h(slot.to)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No availability — the day is closed, fully blocked, or the window is shorter than one session.</p>
          )
        )}
      </Section>
    </div>
  );
}

/**
 * Provider-level wrapper — hooks the editor up to `providers.booking_settings`.
 * Adds a sticky "Save" bar with dirty tracking so an admin can tweak and save
 * from the provider workspace without leaving the tab.
 */
export function BookingSettingsForm({ provider }: { provider: UniversalProviderRow }) {
  const qc = useQueryClient();
  const saved = useMemo(() => normalizeBookingSettings(provider.booking_settings), [provider.booking_settings]);
  const [s, setS] = useState<BookingSettings>(saved);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseDb.from("providers").update({ booking_settings: s }).eq("id", provider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking settings saved");
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save settings"),
  });

  return (
    <div className="pb-24">
      <BookingSettingsEditor value={s} onChange={setS} />
      <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <span className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <div className="flex gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => setS(saved)} disabled={save.isPending}>Reset</Button>
          )}
          <Button type="button" className="gap-1.5" onClick={() => save.mutate()} disabled={!dirty || save.isPending} loading={save.isPending} loadingText="Saving…">
            <Save className="h-4 w-4" /> Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}
