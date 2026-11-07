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
      className="w-full p-0"
      // Full width: the shared calendar is a 252px popover grid, which left a
      // third of the card empty on a phone. Here a day is a 44px target.
      classNames={{
        months: "w-full",
        month: "w-full space-y-3",
        caption_label: "text-title font-semibold",
        nav_button: "inline-flex h-10 w-10 items-center justify-center rounded-full bg-inset text-foreground hover:bg-muted",
        table: "w-full border-collapse",
        head_row: "flex w-full",
        head_cell: "flex-1 text-center text-meta font-normal text-muted-foreground",
        row: "mt-1 flex w-full",
        cell: "relative h-11 flex-1 p-0 text-center [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-radius-md last:[&:has([aria-selected])]:rounded-r-radius-md [&:has(.day-range-start)]:rounded-l-radius-md [&:has(.day-range-end)]:rounded-r-radius-md",
        day: "h-11 w-full rounded-radius-md p-0 text-body font-normal text-foreground transition-colors hover:bg-inset aria-selected:opacity-100",
        day_range_start: "day-range-start",
        day_selected: "bg-primary font-semibold text-primary-foreground hover:bg-primary",
        day_range_middle: "aria-selected:bg-transparent aria-selected:font-normal aria-selected:text-foreground",
        day_today: "font-semibold underline underline-offset-4",
        day_outside: "text-muted-foreground opacity-40",
        day_disabled: "text-muted-foreground opacity-30",
      }}
    />
  );
}
