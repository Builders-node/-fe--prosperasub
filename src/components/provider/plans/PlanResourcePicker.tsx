import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Which of the provider's bookable things this plan opens.
 *
 * Membership used to be all-or-nothing: an active subscription opened every
 * court the club has, so a tennis-only plan, a pickleball add-on, or a plan
 * built around one specific court could not be described at all.
 *
 * Selecting nothing means ALL — which is what a single all-access membership
 * means, what every plan written before this existed still means, and what a
 * provider who never touches this control keeps meaning. Naming courts only
 * ever narrows.
 *
 * The picker hides itself when the provider has nothing bookable, so a
 * restaurant's meal plan is never asked which court it includes.
 */
export function PlanResourcePicker({ providerId, value, onChange }: {
  providerId: string | null | undefined;
  /** `bookable_resources.id` values. Empty = every resource. */
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: resources = [] } = useQuery({
    queryKey: ["plan-resource-picker", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("bookable_resources")
        .select("id, name, type")
        .eq("provider_id", providerId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; type: string | null }>;
    },
  });

  if (resources.length === 0) return null;

  const selected = new Set(value);
  const all = selected.size === 0;
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    // Selecting every one of them is the same statement as selecting none, and
    // the shorter one survives a court being added later.
    onChange(next.size === resources.length ? [] : [...next]);
  };

  return (
    <div>
      <span className="text-xs font-semibold text-muted-foreground">Includes</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
            all ? "bg-primary text-primary-foreground" : "bg-inset text-muted-foreground hover:text-foreground",
          )}
        >
          Everything
        </button>
        {resources.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => toggle(r.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
              selected.has(r.id)
                ? "bg-primary text-primary-foreground"
                : "bg-inset text-muted-foreground hover:text-foreground",
            )}
          >
            {r.name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {all
          ? `Members on this plan can book any of the ${resources.length}, including any added later.`
          : `Members on this plan can book only the ${selected.size} selected.`}
      </p>
    </div>
  );
}
