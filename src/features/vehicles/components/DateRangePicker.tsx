import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { differenceInCalendarDays, eachDayOfInterval, format, startOfToday } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { fetchHeldRanges, overlapsHeld, type HeldRange } from "../lib/availability";

export const toISO = (d: Date) => format(d, "yyyy-MM-dd");

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
  const { data: booked = [] } = useQuery<HeldRange[]>({
    queryKey: ["vehicle-booked-ranges", vehicleId],
    enabled: !!vehicleId,
    // Short staleTime: the calendar is the one screen where showing a car as
    // free after someone else took it turns into a double booking.
    staleTime: 30 * 1000,
    queryFn: () => fetchHeldRanges(vehicleId),
  });

  const bookedDays = useMemo(
    () =>
      booked.flatMap((b) =>
        eachDayOfInterval({ start: new Date(b.start + "T00:00:00"), end: new Date(b.end + "T00:00:00") }),
      ),
    [booked],
  );

  const overlaps = (from: Date, to: Date) => overlapsHeld(toISO(from), toISO(to), booked);

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
