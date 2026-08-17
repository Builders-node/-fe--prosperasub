import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseDb } from "@/integrations/supabase/client";
import { PROVIDER_ITEMS_KEY, useProviderItems, type ProviderItem } from "@/lib/services/providerItems";

/**
 * What this business delivers within a day, in its own words.
 *
 * Breakfast, lunch and dinner used to be written into the platform — a TS
 * union, three label maps, a picker's key list and a literal array inside the
 * SQL that generates deliveries. A restaurant selling brunch could not sell it,
 * and a kitchen that says "almuerzo" read English on its own manifest. This is
 * the screen that ends that: rows here are what the customer picks, what the
 * day's list is titled with, and what the generator schedules.
 *
 * The KEY is the stable part — it is what `service_occurrences.item_key`
 * already holds — so renaming Lunch to Almuerzo changes every screen and
 * nothing in the data. Which is why the key is only editable while the row is
 * new.
 */

interface Draft {
  key: string;
  label: string;
  time: string;
  isNew: boolean;
}

const toTime = (minutes: number | null): string => {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const toMinutes = (time: string): number | null => {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
};

/** A label a person typed, as a key a machine can keep. */
const keyFrom = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function ProviderItemsPanel({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { items, isLoading } = useProviderItems(providerId);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    setDrafts(items.map((i: ProviderItem) => ({
      key: i.key, label: i.label, time: toTime(i.defaultMinutes), isNew: false,
    })));
  }, [items]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = drafts
        .map((d, index) => ({
          key: (d.isNew ? keyFrom(d.label) : d.key).trim(),
          label: d.label.trim(),
          // Ten apart, so a row can be dropped between two later without
          // renumbering the day.
          sort_order: (index + 1) * 10,
          default_minutes: toMinutes(d.time),
        }))
        .filter((r) => r.key && r.label);

      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.key)) throw new Error(`Two of these come out as "${r.key}" — give one a different name.`);
        seen.add(r.key);
      }

      const { error } = await supabaseDb.from("provider_items").upsert(
        rows.map((r) => ({ ...r, provider_id: providerId, is_active: true, updated_at: new Date().toISOString() })),
        { onConflict: "provider_id,key" },
      );
      if (error) throw error;

      // Whatever is no longer on screen goes inactive rather than away: an
      // occurrence written last week still points at its key and should keep
      // reading as a word.
      const keep = rows.map((r) => r.key);
      const gone = items.filter((i) => !keep.includes(i.key)).map((i) => i.key);
      if (gone.length) {
        const { error: offErr } = await supabaseDb
          .from("provider_items")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("provider_id", providerId)
          .in("key", gone);
        if (offErr) throw offErr;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: PROVIDER_ITEMS_KEY(providerId) });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  const patch = (i: number, next: Partial<Draft>) =>
    setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, ...next } : row)));

  return (
    <section className="space-y-4 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <div>
        <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">The day</h2>
        <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">
          What you deliver within a day, in order. Customers pick from this list, your day's work is
          titled with it, and deliveries are scheduled for it.
        </p>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-radius-md bg-inset" />
      ) : (
        <div className="space-y-2">
          {drafts.map((d, i) => (
            <div key={d.isNew ? `new-${i}` : d.key} className="flex flex-wrap items-end gap-2 rounded-radius-md bg-inset p-3">
              <div className="min-w-[10rem] flex-1">
                <span className="text-[14px] text-muted-foreground">Name</span>
                <Input
                  className="mt-1 h-9"
                  value={d.label}
                  placeholder="Brunch"
                  onChange={(e) => patch(i, { label: e.target.value })}
                />
              </div>
              <div className="w-32">
                <span className="text-[14px] text-muted-foreground">Usually at</span>
                <Input
                  type="time"
                  className="mt-1 h-9"
                  value={d.time}
                  onChange={(e) => patch(i, { time: e.target.value })}
                />
              </div>
              <div className="w-28">
                <span className="text-[14px] text-muted-foreground">Key</span>
                <p className="mt-1 flex h-9 items-center truncate text-[14px] text-muted-foreground">
                  {d.isNew ? keyFrom(d.label) || "—" : d.key}
                </p>
              </div>
              <Button
                variant="ghost" size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${d.label || "item"}`}
                onClick={() => setDrafts((rows) => rows.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {drafts.length === 0 && (
            <p className="rounded-radius-md bg-inset p-4 text-[16px] leading-[22px] text-muted-foreground">
              Nothing yet — this business falls back to Breakfast, Lunch and Dinner. Add a row to say
              what your day actually looks like.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary" size="sm" className="gap-1.5 rounded-full"
          onClick={() => setDrafts((d) => [...d, { key: "", label: "", time: "", isNew: true }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
        <Button
          size="sm" className="rounded-full"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save the day"}
        </Button>
      </div>
    </section>
  );
}
