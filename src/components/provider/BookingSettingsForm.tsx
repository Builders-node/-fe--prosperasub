import { fieldClass } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DURATION_PRESETS, WEEKDAY_LABELS,
  computeSlots, normalizeBookingSettings, sameWeekly, to12h, weeklyFromWorkingHours,
  type BookingSettings, type BlockedRange, type DayHours,
} from "@/lib/booking/bookingSettings";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { todayHN } from "@/lib/timezone";
import { formatWorkingHours, parseWorkingHours } from "@/lib/workingHours";

/** The shared field surface, sized to its content inside these rows. */
const inputCls = cn(fieldClass, "w-auto px-3");

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `r-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/**
 * A block, in the dialog's own shape: full width, 16px title, no icon plate.
 * The rare ones fold to their one-line summary so the sheet opens on what is
 * changed most — the hours and the days off.
 */
function Section({ title, subtitle, summary, collapsible = false, defaultOpen = true, children }: {
  title: string; subtitle?: string; summary?: string; collapsible?: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <div className="min-w-0 flex-1">
      <h3 className="text-title font-semibold text-foreground">{title}</h3>
      {(open ? subtitle : summary ?? subtitle) && (
        <p className="mt-0.5 text-meta text-muted-foreground">{open ? subtitle : summary ?? subtitle}</p>
      )}
    </div>
  );
  return (
    <section className="rounded-radius-lg bg-card p-4">
      {collapsible ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="flex w-full items-center gap-3 text-left">
          {head}
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      ) : <div className="flex">{head}</div>}
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** Neutral chip — selected inverts, like every other choice in the app. */
function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label}
      className={cn("h-10 min-w-10 rounded-full px-3.5 text-body font-semibold transition-colors",
        on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function NumberField({ label, suffix, value, min, max, onChange }: {
  label: string; suffix?: string; value: number; min?: number; max?: number; onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-meta font-semibold text-muted-foreground">{label}</span>}
      <span className="relative">
        <input
          type="number" inputMode="numeric" min={min ?? 0} max={max}
          value={value}
          onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
          className={cn(inputCls, "w-full pr-12 text-right tabular-nums")}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-meta text-muted-foreground">{suffix}</span>}
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
  value, onChange, showCapacity = true, workingHours,
}: {
  value: BookingSettings;
  onChange: (next: BookingSettings) => void;
  /**
   * The business's own working hours. When given, the hours block offers
   * "Same as working hours" — the provider form passes them; a per-plan or
   * per-calendar override does not, and edits its own week.
   */
  workingHours?: Array<{ days: string[]; open: string; close: string }>;
  /**
   * Capacity belongs to the provider and nowhere else.
   *
   * A per-plan or per-vehicle override of this config is applied as a FILTER
   * over the pre-seeded slot rows — it can hide an hour, never change how many
   * people fit in one. Offering the field there would show a number that is
   * saved, displayed and completely ignored.
   */
  showCapacity?: boolean;
}) {
  const [previewDate, setPreviewDate] = useState<string>(todayHN());
  const [newBlockDate, setNewBlockDate] = useState<string>("");

  const s = value;
  const patch = (p: Partial<BookingSettings>) => onChange({ ...s, ...p });
  const setDay = (i: number, p: Partial<DayHours>) =>
    onChange({ ...s, weekly: s.weekly.map((w, j) => (j === i ? { ...w, ...p } : w)) });

  const canFollow = !!workingHours;
  const derived = useMemo(() => (workingHours ? weeklyFromWorkingHours(workingHours) : null), [workingHours]);
  const following = canFollow && !!s.followWorkingHours;
  const hasWorkingHours = (workingHours?.length ?? 0) > 0;

  // One window for every open day, unless the days already differ — then the
  // per-day list opens by itself, so nobody's hours are flattened silently.
  const open = s.weekly.filter((d) => d.enabled);
  const uniform = open.every((d) => d.from === open[0]?.from && d.to === open[0]?.to);
  const [perDay, setPerDay] = useState(!uniform);
  const common = open[0] ?? s.weekly[0];
  const setCommon = (p: Partial<DayHours>) =>
    onChange({ ...s, weekly: s.weekly.map((w) => (w.enabled ? { ...w, ...p } : w)) });
  const toggleDay = (i: number) => {
    const on = !s.weekly[i].enabled;
    setDay(i, on && !perDay ? { enabled: true, from: common.from, to: common.to } : { enabled: on });
  };

  const addBlockedDate = () => {
    if (!newBlockDate || s.blockedDates.includes(newBlockDate)) return;
    patch({ blockedDates: [...s.blockedDates, newBlockDate].sort() });
    setNewBlockDate("");
  };
  // Every day by default: a lunch hour, a shift changeover.
  const addBlockedRange = () =>
    patch({ blockedRanges: [...s.blockedRanges, { id: newId(), date: null, from: "12:00", to: "13:00", note: "" }] });
  const setRange = (id: string, p: Partial<BlockedRange>) =>
    patch({ blockedRanges: s.blockedRanges.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  // The engine reads `weekly`; when following, the preview shows what will be saved.
  const effective = following && derived ? { ...s, weekly: derived } : s;
  const previewSlots = useMemo(() => (previewDate ? computeSlots(effective, previewDate) : []), [effective, previewDate]);

  const durationSummary = `${s.sessionDurationMin} min sessions` +
    (s.bufferBeforeMin || s.bufferAfterMin ? ` · ${s.bufferBeforeMin}/${s.bufferAfterMin} min buffers` : "") +
    (showCapacity ? ` · ${s.capacity} at a time` : "");
  const rulesSummary = `${s.minNoticeHours ? `${s.minNoticeHours}h notice` : "Same-day"} · up to ${s.maxAdvanceDays} days ahead`;
  const whoSummary = [
    s.policy.requiresMembership ? "Subscribers only" : "Anyone",
    s.policy.maxActiveBookings ? `${s.policy.maxActiveBookings} upcoming max` : null,
    s.policy.cancelNoticeHours ? `cancel ${s.policy.cancelNoticeHours}h before` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-1">
      {/* Hours — and right under them, what they produce. */}
      <Section title="Bookable hours" subtitle="When customers can book a time.">
        <div className="space-y-4">
          {canFollow && (
            <div className="flex rounded-radius-md bg-inset p-0.5">
              {([["follow", "Same as working hours"], ["custom", "Custom hours"]] as const).map(([k, label]) => (
                <button key={k} type="button"
                  onClick={() => patch(k === "follow"
                    ? { followWorkingHours: true }
                    : { followWorkingHours: false, weekly: derived && following ? derived : s.weekly })}
                  className={cn("flex-1 rounded-radius-md px-3 py-2 text-body font-semibold transition-colors",
                    (k === "follow") === following ? "bg-segment text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {following ? (
            hasWorkingHours ? (
              <p className="text-body text-foreground">
                {formatWorkingHours(workingHours) }
                <span className="mt-1 block text-meta text-muted-foreground">
                  The hours on your page. Change them with Edit, and bookings follow.
                </span>
              </p>
            ) : (
              <p className="text-body text-attention">
                Your page has no working hours yet — add them with Edit, or use custom hours here.
              </p>
            )
          ) : (
            <>
              {canFollow && hasWorkingHours && derived && !sameWeekly(s.weekly, derived) && (
                <p className="rounded-radius-md bg-inset p-3 text-meta text-muted-foreground">
                  Differs from the hours on your page ({formatWorkingHours(workingHours)}). Customers see those; bookings use these.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {SHORT_DAYS.map((d, i) => (
                  <Chip key={d} on={s.weekly[i].enabled} onClick={() => toggleDay(i)} label={WEEKDAY_LABELS[i]}>{d}</Chip>
                ))}
              </div>
              {!perDay ? (
                open.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <input type="time" value={common.from} onChange={(e) => setCommon({ from: e.target.value })} className={inputCls} aria-label="Opens" />
                    <span className="text-muted-foreground">—</span>
                    <input type="time" value={common.to} onChange={(e) => setCommon({ to: e.target.value })} className={inputCls} aria-label="Closes" />
                  </div>
                ) : <p className="text-body text-muted-foreground">Closed every day — pick the days you take bookings.</p>
              ) : (
                <div className="space-y-1">
                  {s.weekly.map((day, i) => day.enabled && (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-radius-md bg-inset px-3 py-2">
                      <span className="w-12 text-body font-semibold text-foreground">{SHORT_DAYS[i]}</span>
                      <input type="time" value={day.from} onChange={(e) => setDay(i, { from: e.target.value })} className={inputCls} aria-label={`${WEEKDAY_LABELS[i]} opens`} />
                      <span className="text-muted-foreground">—</span>
                      <input type="time" value={day.to} onChange={(e) => setDay(i, { to: e.target.value })} className={inputCls} aria-label={`${WEEKDAY_LABELS[i]} closes`} />
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-3">
                <Switch checked={perDay} onCheckedChange={(v) => {
                  setPerDay(v);
                  // Back to one window: every open day takes the first day's hours.
                  if (!v && open[0]) setCommon({ from: open[0].from, to: open[0].to });
                }} />
                <span className="text-body text-foreground">Different hours per day</span>
              </label>
            </>
          )}

          {/* What the settings produce, next to the hours that make it. */}
          <div className="space-y-2 rounded-radius-md bg-inset p-3">
            <div>
              <p className="text-body font-semibold text-foreground">How customers see it</p>
              <p className="text-meta text-muted-foreground">The times a customer can pick on a given day.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-meta font-semibold text-muted-foreground">Slots on</span>
              <input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} className={cn(inputCls, "bg-card")} />
              {previewDate && <span className="text-meta text-muted-foreground">{previewSlots.length} slot{previewSlots.length === 1 ? "" : "s"}</span>}
            </div>
            {previewDate && (previewSlots.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {previewSlots.map((slot) => (
                  <span key={slot.from} className="rounded-full bg-card px-2.5 py-1 text-meta tabular-nums text-foreground">
                    {to12h(slot.from)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-meta text-muted-foreground">Nothing to book — the day is closed, blocked, or shorter than one session.</p>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Days off & breaks" subtitle="Close a whole day, or block a time within open days.">
        <div className="space-y-5">
          <div>
            <span className="text-meta font-semibold text-muted-foreground">Closed days</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input type="date" value={newBlockDate} onChange={(e) => setNewBlockDate(e.target.value)} className={inputCls} />
              <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={addBlockedDate} disabled={!newBlockDate}>
                <Plus /> Close day
              </Button>
            </div>
            {s.blockedDates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.blockedDates.map((d) => (
                  <span key={d} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted pl-3 pr-1.5 text-meta font-semibold text-foreground">
                    {d}
                    <button type="button" onClick={() => patch({ blockedDates: s.blockedDates.filter((x) => x !== d) })}
                      aria-label={`Reopen ${d}`} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-background">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-meta font-semibold text-muted-foreground">Breaks</span>
              <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={addBlockedRange}>
                <Plus /> Add break
              </Button>
            </div>
            {s.blockedRanges.length === 0 ? (
              <p className="mt-1.5 text-body text-muted-foreground">No breaks.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {s.blockedRanges.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-radius-md bg-inset p-2">
                    {/* Every day, or one date. */}
                    <label className="flex items-center gap-2">
                      <Switch checked={r.date === null} onCheckedChange={(on) => setRange(r.id, { date: on ? null : todayHN() })} aria-label="Repeat every day" />
                      <span className="text-meta font-semibold text-muted-foreground">Every day</span>
                    </label>
                    {r.date !== null && (
                      <input type="date" value={r.date} onChange={(e) => setRange(r.id, { date: e.target.value || todayHN() })} className={cn(inputCls, "bg-card")} />
                    )}
                    <input type="time" value={r.from} onChange={(e) => setRange(r.id, { from: e.target.value })} className={cn(inputCls, "bg-card")} aria-label="Break starts" />
                    <span className="text-muted-foreground">—</span>
                    <input type="time" value={r.to} onChange={(e) => setRange(r.id, { to: e.target.value })} className={cn(inputCls, "bg-card")} aria-label="Break ends" />
                    <input type="text" placeholder="Note (optional)" value={r.note ?? ""} onChange={(e) => setRange(r.id, { note: e.target.value })}
                      className={cn(inputCls, "min-w-[120px] flex-1 bg-card")} />
                    <Button type="button" size="iconSm" variant="ghost" className="text-destructive"
                      onClick={() => patch({ blockedRanges: s.blockedRanges.filter((x) => x.id !== r.id) })} aria-label="Remove break">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Set once, rarely touched — folded to a summary. */}
      <Section title="Session length" subtitle="How long each booking is, and the gaps around it." summary={durationSummary} collapsible defaultOpen={false}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_PRESETS.map((d) => (
              <Chip key={d} on={s.sessionDurationMin === d} onClick={() => patch({ sessionDurationMin: d })}>{d} min</Chip>
            ))}
            <NumberField label="" suffix="min" value={s.sessionDurationMin} min={5}
              onChange={(n) => patch({ sessionDurationMin: Math.max(5, n) })} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <NumberField label="Gap before" suffix="min" value={s.bufferBeforeMin} onChange={(n) => patch({ bufferBeforeMin: n })} />
            <NumberField label="Gap after" suffix="min" value={s.bufferAfterMin} onChange={(n) => patch({ bufferAfterMin: n })} />
          </div>
          {showCapacity && (
            <div className="sm:max-w-md">
              <NumberField label="Bookings at the same time" suffix={s.capacity === 1 ? "job" : "jobs"} min={1}
                value={s.capacity} onChange={(n) => patch({ capacity: Math.max(1, n) })} />
              <p className="mt-1.5 text-meta text-muted-foreground">
                {s.capacity === 1
                  ? "One customer per time slot — a second person sees that hour as taken."
                  : `Up to ${s.capacity} customers can book the same hour — how many crews you can send at once.`}
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="How far ahead" subtitle="The earliest and latest a customer can book." summary={rulesSummary} collapsible defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <NumberField label="Minimum notice" suffix="hrs" value={s.minNoticeHours} onChange={(n) => patch({ minNoticeHours: n })} />
          <NumberField label="Book up to" suffix="days" value={s.maxAdvanceDays} min={1} onChange={(n) => patch({ maxAdvanceDays: Math.max(1, n) })} />
        </div>
      </Section>

      <Section title="Who may book" subtitle="0 means no limit." summary={whoSummary} collapsible defaultOpen={false}>
        <label className="flex items-start gap-3">
          <Switch checked={s.policy.requiresMembership}
            onCheckedChange={(v) => patch({ policy: { ...s.policy, requiresMembership: v } })} />
          <span>
            <span className="block text-body font-semibold text-foreground">Subscribers only</span>
            <span className="mt-0.5 block text-meta text-muted-foreground">
              Only customers with a live subscription to you may book — right for courts included in a membership.
            </span>
          </span>
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <NumberField label="Upcoming per customer" value={s.policy.maxActiveBookings}
            onChange={(n) => patch({ policy: { ...s.policy, maxActiveBookings: n } })} />
          <NumberField label="Per day per customer" value={s.policy.maxPerDay}
            onChange={(n) => patch({ policy: { ...s.policy, maxPerDay: n } })} />
          <NumberField label="Cancel up to" suffix="hrs" value={s.policy.cancelNoticeHours}
            onChange={(n) => patch({ policy: { ...s.policy, cancelNoticeHours: n } })} />
        </div>
        <p className="mt-2 text-meta text-muted-foreground">
          {s.policy.cancelNoticeHours > 0
            ? `A customer can cancel until ${s.policy.cancelNoticeHours}h before the start. You can still cancel it for them.`
            : "Customers can cancel at any time, even a minute before the start."}
        </p>
      </Section>
    </div>
  );
}

/**
 * Provider-level wrapper — hooks the editor up to `providers.booking_settings`.
 * Adds a sticky "Save" bar with dirty tracking so an admin can tweak and save
 * from the provider workspace without leaving the tab.
 */
export function BookingSettingsForm({ provider, onDirtyChange }: {
  provider: UniversalProviderRow;
  /** So the sheet can ask before closing on unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const workingHours = useMemo(() => parseWorkingHours(provider.working_hours), [provider.working_hours]);
  const saved = useMemo(() => {
    const n = normalizeBookingSettings(provider.booking_settings);
    // "Following" only when chosen, or when the saved week already IS the
    // page's hours. A business with no rules saved books on the platform
    // defaults today, so it shows as custom with those defaults — the truth —
    // and nobody's bookable hours move because this switch appeared.
    const derived = weeklyFromWorkingHours(workingHours);
    const follow = n.followWorkingHours
      || (provider.booking_settings != null && workingHours.length > 0 && sameWeekly(n.weekly, derived));
    return { ...n, followWorkingHours: follow };
  }, [provider.booking_settings, workingHours]);
  const [s, setS] = useState<BookingSettings>(saved);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async () => {
      const toSave = s.followWorkingHours ? { ...s, weekly: weeklyFromWorkingHours(workingHours) } : s;
      const { error } = await supabaseDb.from("providers").update({ booking_settings: toSave }).eq("id", provider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking rules saved");
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <>
      <BookingSettingsEditor value={s} onChange={setS} workingHours={workingHours} />
      {/* Pinned under the blocks like every dialog's buttons, and only when
          there is something to save — a pale disabled "Save settings" beside
          "All changes saved" read as broken. */}
      {dirty && (
        <div className="sticky bottom-0 z-10 mt-1 flex gap-2 bg-background px-4 pb-4 pt-2">
          <Button type="button" variant="ghost" onClick={() => setS(saved)} disabled={save.isPending}>Undo</Button>
          <Button type="button" className="flex-1" onClick={() => save.mutate()}
            disabled={save.isPending} loading={save.isPending} loadingText="Saving…">
            Save changes
          </Button>
        </div>
      )}
      <div className="h-4" />
    </>
  );
}
