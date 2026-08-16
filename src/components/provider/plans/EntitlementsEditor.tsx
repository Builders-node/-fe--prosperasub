import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAN_PERIODS, type PlanPeriod } from "@/lib/services/planPeriod";
import { ACCESS_UNIT, type Entitlement } from "@/lib/plans/entitlements";

/**
 * Everything else the plan includes.
 *
 * The row above this one — how many, of what, how often — is the plan's first
 * entitlement, and it is the one every existing reader uses. This edits the
 * rest: a second line is what makes "membership plus 4 court hours" or "4
 * cleanings and 2 deep cleans" describable at all, and it is the same control
 * for every service rather than a bundle feature bolted onto one of them.
 *
 * Leaving the count empty means unlimited, which is what a membership is.
 */
export function EntitlementsEditor({ value, onChange, planPeriod }: {
  /** Lines AFTER the first — the first is the quantity/unit row above. */
  value: Entitlement[];
  onChange: (next: Entitlement[]) => void;
  planPeriod: PlanPeriod;
}) {
  const patch = (i: number, p: Partial<Entitlement>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...p } : e)));

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Also includes</Label>
        <Button
          type="button" size="sm" variant="secondary" className="h-7 gap-1 text-xs"
          onClick={() => onChange([...value, { unit: "", quantity: null, period: null, resourceIds: [] }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="mt-1.5 text-[14px] leading-[18px] text-muted-foreground">
          Nothing beyond what's above. Add a line to bundle something else into
          this plan — court hours, a deep clean, a session.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {value.map((e, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="w-24">
                <span className="text-[14px] text-muted-foreground">How many</span>
                <Input
                  type="number" min={1} inputMode="numeric" placeholder="∞"
                  value={e.quantity ?? ""}
                  onChange={(ev) => {
                    const n = Number.parseInt(ev.target.value, 10);
                    patch(i, { quantity: Number.isFinite(n) && n > 0 ? n : null });
                  }}
                />
              </div>
              <div className="flex-1">
                <span className="text-[14px] text-muted-foreground">Of what</span>
                <Input
                  value={e.unit}
                  onChange={(ev) => patch(i, { unit: ev.target.value })}
                  placeholder="hour, deep clean, session"
                />
              </div>
              <div className="w-32">
                <span className="text-[14px] text-muted-foreground">How often</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={e.period ?? ""}
                  onChange={(ev) => patch(i, { period: (ev.target.value || null) as PlanPeriod | null })}
                >
                  <option value="">Same as plan</option>
                  {PLAN_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <Button
                type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0"
                aria-label="Remove line"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <p className="text-[14px] leading-[18px] text-muted-foreground">
            Empty count = unlimited. Use <code className="font-mono">{ACCESS_UNIT}</code> as
            the unit for plain entry with nothing to count. Lines refresh every{" "}
            {planPeriod.replace("ly", "")} unless you say otherwise.
          </p>
        </div>
      )}
    </div>
  );
}
