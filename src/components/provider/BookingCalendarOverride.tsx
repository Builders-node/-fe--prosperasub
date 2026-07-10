import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { BookingSettingsEditor } from "@/components/provider/BookingSettingsForm";
import {
  DEFAULT_BOOKING_SETTINGS,
  normalizeBookingSettings,
  type BookingSettings,
} from "@/lib/booking/bookingSettings";

interface Props {
  value: unknown | null;
  onChange: (next: BookingSettings | null) => void;
  /**
   * Human-readable label for the parent whose calendar is being overridden:
   * "the provider's calendar" (default), "the rental provider's calendar", …
   */
  parentLabel?: string;
  /** Copy override — e.g. "This plan…" vs "This vehicle…". */
  entityLabel?: string;
}

/**
 * Per-record booking-calendar override toggle. Renders a card with a
 * switch — off = inherit, on = expand into a full BookingSettingsEditor.
 *
 * The parent form stores the value as JSONB on the record (nullable). Turning
 * the switch off sets the field back to NULL so read-time resolvers fall
 * through to the parent's calendar via `resolvePlanBookingSettings`.
 *
 * Reused by CleaningPlans PlanFormSheet and ProviderVehiclesTab so both
 * services get the exact same override UX.
 */
export function BookingCalendarOverride({
  value, onChange,
  parentLabel = "the provider's calendar",
  entityLabel = "This record",
}: Props) {
  const overrideOn = value !== null && value !== undefined;
  // Keep an in-progress edit around so toggling off/on doesn't discard the
  // draft until the caller's form is closed.
  const [draft, setDraft] = useState<BookingSettings>(() => normalizeBookingSettings(value ?? null));

  const handleToggle = (on: boolean) => {
    if (on) {
      const seed = value ? normalizeBookingSettings(value) : { ...DEFAULT_BOOKING_SETTINGS };
      setDraft(seed);
      onChange(seed);
    } else {
      onChange(null);
    }
  };

  const handleEditorChange = (next: BookingSettings) => {
    setDraft(next);
    onChange(next);
  };

  return (
    <section className="rounded-2xl bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-bold text-foreground">Booking calendar</h3>
            <p className="text-sm text-muted-foreground">
              {overrideOn
                ? `${entityLabel} uses its own working hours and session settings.`
                : `${entityLabel} inherits ${parentLabel}.`}
            </p>
          </div>
        </div>
        <Switch checked={overrideOn} onCheckedChange={handleToggle} aria-label="Custom calendar" />
      </div>

      {overrideOn && (
        <div className="mt-4 border-t border-border/50 pt-4">
          <BookingSettingsEditor value={draft} onChange={handleEditorChange} />
        </div>
      )}
    </section>
  );
}
