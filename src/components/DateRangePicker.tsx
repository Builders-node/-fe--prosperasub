import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { differenceInCalendarDays, eachDayOfInterval, format, startOfToday } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { supabaseDb } from "@/integrations/supabase/client";

export const toISO = (d: Date) => format(d, "yyyy-MM-dd");

interface BookedRange { start: string; end: string }

/**
 * Range picker that knows what's already booked for a vehicle. Booked days are
 * disabled; a selected range that would straddle a booked day is rejected. Days
 * are inclusive on both ends (a booking Aug 3→Aug 5 blocks the 3rd, 4th and 5th).
 */
export function DateRangePicker({
  vehicleId,
  value,
  onChange,
  maxDays = 90,
}: {
  vehicleId: string;
  value: DateRange | undefined;
  onChange: (r: DateRange | undefined) => void;
  maxDays?: number;
}) {
  const { data: booked = [] } = useQuery({
    queryKey: ["vehicle-booked-ranges", vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("start_date,end_date")
        .eq("vehicle_id", vehicleId)
        .not("status", "in", '("cancelled")')
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []).map((b: { start_date: string; end_date: string }) => ({ start: b.start_date, end: b.end_date })) as BookedRange[];
    },
  });

  const bookedDays = useMemo(
    () =>
      booked.flatMap((b) =>
        eachDayOfInterval({ start: new Date(b.start + "T00:00:00"), end: new Date(b.end + "T00:00:00") }),
      ),
    [booked],
  );

  const overlaps = (from: Date, to: Date) => {
    const s = toISO(from), e = toISO(to);
    return booked.some((b) => s <= b.end && e >= b.start);
  };

  const handleSelect = (r: DateRange | undefined) => {
    if (r?.from && r?.to) {
      if (differenceInCalendarDays(r.to, r.from) + 1 > maxDays) {
        toast.error(`Bookings are limited to ${maxDays} days.`);
        return;
      }
      if (overlaps(r.from, r.to)) {
        toast.error("This car is already booked for part of that period.");
        onChange({ from: r.from, to: undefined });
        return;
      }
    }
    onChange(r);
  };

  return (
    <Calendar
      mode="range"
      selected={value}
      onSelect={handleSelect}
      numberOfMonths={1}
      weekStartsOn={1}
      disabled={[{ before: startOfToday() }, ...bookedDays]}
      className="rounded-radius-md bg-card p-2"
    />
  );
}
