import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DAY_CODES, DAY_LABELS, EMPTY_SCHEDULE,
  type DayCode, type HoursSchedule,
} from "@/lib/workingHours";

interface Props {
  value: HoursSchedule[];
  onChange: (schedules: HoursSchedule[]) => void;
}

export function WorkingHoursEditor({ value, onChange }: Props) {
  const update = (idx: number, patch: Partial<HoursSchedule>) => {
    const next = value.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  };

  const toggleDay = (idx: number, day: DayCode) => {
    const days = value[idx].days;
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    update(idx, { days: next });
  };

  const addRow = () => onChange([...value, EMPTY_SCHEDULE()]);
  const removeRow = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">No schedule set.</p>
      )}

      {value.map((schedule, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border bg-muted/30 p-3 space-y-3"
        >
          {/* Day chips */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Days</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_CODES.map((day) => {
                const active = schedule.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(idx, day)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-orange-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time range */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Opens</Label>
              <input
                type="time"
                value={schedule.open}
                onChange={(e) => update(idx, { open: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <span className="mt-5 text-muted-foreground">–</span>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Closes</Label>
              <input
                type="time"
                value={schedule.close}
                onChange={(e) => update(idx, { close: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-5 h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(idx)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 rounded-full"
        onClick={addRow}
      >
        <Plus className="h-3.5 w-3.5" />
        Add schedule
      </Button>
    </div>
  );
}
