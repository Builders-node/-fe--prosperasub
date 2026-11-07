import { TabPills } from "@/components/admin/TabPills";
import { ROLLUP_PERIODS, type RollupPeriod } from "@/lib/analytics/platformRollup";
import { cn } from "@/lib/utils";

/** The one period control on Today and Analytics — same five choices, same place. */
export function PeriodPicker({ value, onChange, className }: {
  value: RollupPeriod;
  onChange: (p: RollupPeriod) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 overflow-x-auto px-1 [scrollbar-width:none]", className)}>
      <TabPills
        className="flex-nowrap whitespace-nowrap"
        tabs={ROLLUP_PERIODS.map((p) => ({ value: p.key, label: p.label }))}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
