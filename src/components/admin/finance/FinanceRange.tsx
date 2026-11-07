import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";

import { TabPills } from "@/components/admin/TabPills";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The one period on Finance (`?range=week|month|last_month|custom&from=&to=`).
 *
 * The Payments tiles were all-time, the breakdown had its own week/month/custom
 * switch and Commission a second one — three answers to "which month is this?"
 * on one page. Finance counts in calendar periods (an accountant's month, not
 * a rolling 30 days like Today), so it keeps its own control, but only one,
 * and it survives a reload or a shared link.
 */
export type FinanceRangeKey = "week" | "month" | "last_month" | "custom";

const LABEL: Record<FinanceRangeKey, string> = {
  week: "This week", month: "This month", last_month: "Last month", custom: "Custom",
};

const isDay = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function useFinanceRange() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("range");
  const range: FinanceRangeKey = raw && raw in LABEL ? (raw as FinanceRangeKey) : "month";
  const from = isDay(params.get("from")) ? params.get("from")! : "";
  const to = isDay(params.get("to")) ? params.get("to")! : "";

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (range === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    if (range === "last_month") { const m = subMonths(now, 1); return { start: startOfMonth(m), end: endOfMonth(m) }; }
    if (range === "custom") {
      return {
        start: from ? new Date(`${from}T00:00:00`) : startOfMonth(now),
        end: to ? new Date(`${to}T23:59:59`) : now,
      };
    }
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [range, from, to]);

  const set = (next: { range?: FinanceRangeKey; from?: string; to?: string }) =>
    setParams((prev) => {
      const q = new URLSearchParams(prev);
      const r = next.range ?? range;
      if (r === "month") q.delete("range"); else q.set("range", r);
      if (r === "custom") {
        const f = next.from ?? from; const t = next.to ?? to;
        if (f) q.set("from", f); else q.delete("from");
        if (t) q.set("to", t); else q.delete("to");
      } else { q.delete("from"); q.delete("to"); }
      return q;
    }, { replace: true });

  const label = range === "custom"
    ? `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`
    : range === "week" ? "this week" : range === "last_month" ? format(start, "MMMM yyyy") : format(start, "MMMM yyyy");

  return { range, from, to, start, end, label, set };
}

export function FinanceRangePicker({ className }: { className?: string }) {
  const { range, from, to, set } = useFinanceRange();
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
          <TabPills
            className="flex-nowrap whitespace-nowrap"
            value={range}
            onChange={(r) => set({ range: r })}
            tabs={(Object.keys(LABEL) as FinanceRangeKey[]).map((k) => ({ value: k, label: LABEL[k] }))}
          />
        </div>
        {range === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-2 font-normal">
                <CalendarIcon className="h-4 w-4" />
                {from || to ? (
                  <span className="tabular-nums">
                    {from ? format(new Date(`${from}T00:00:00`), "MMM d, yyyy") : "Start"} – {to ? format(new Date(`${to}T00:00:00`), "MMM d, yyyy") : "Today"}
                  </span>
                ) : "Pick dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0">
              <Calendar
                mode="range" numberOfMonths={2} weekStartsOn={1}
                defaultMonth={from ? new Date(`${from}T00:00:00`) : undefined}
                selected={{ from: from ? new Date(`${from}T00:00:00`) : undefined, to: to ? new Date(`${to}T00:00:00`) : undefined }}
                onSelect={(r: DateRange | undefined) => set({
                  range: "custom",
                  from: r?.from ? format(r.from, "yyyy-MM-dd") : "",
                  to: r?.to ? format(r.to, "yyyy-MM-dd") : "",
                })}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
