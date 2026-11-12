import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { dietaryTagMeta, DIETARY_TAGS } from "@/lib/foodDietaryTags";
import type { LucideIcon } from "lucide-react";

/**
 * The tag dictionary — the words a plan can be tagged with, in groups.
 *
 *   Level     Beginner · Advanced · Professional
 *   Good for  Kids · Family · Couples
 *   Format    Course · Certification
 *   Diet      Vegan · Keto · Gluten-free · …
 *
 * Tags used to be free text, so one business's "kids" was the next one's
 * "Kids" and "children", and nothing filtered by them. Now an admin keeps this
 * list (Admin → Settings → Tags, tables catalog_tag_groups + catalog_tags) and
 * a business picks from it. `provider_plans.tags` stores the KEYS.
 *
 * A key that is not in the dictionary (an old free-text tag) is kept on the
 * plan and still found by search — it just isn't a filter or a card chip.
 *
 * Until the migration is applied (20261120120000_catalog_tags) the tables are
 * missing and the built-in list below is used, so everything works the same.
 * The migration seeds exactly this list.
 */

export interface TagDef { key: string; label: string; groupKey: string; sortOrder: number; isActive: boolean }
export interface TagGroup { key: string; label: string; sortOrder: number; isActive: boolean; tags: TagDef[] }

const g = (key: string, label: string, sortOrder: number, tags: Array<[string, string]>): TagGroup => ({
  key, label, sortOrder, isActive: true,
  tags: tags.map(([k, l], i) => ({ key: k, label: l, groupKey: key, sortOrder: i, isActive: true })),
});

export const DEFAULT_TAG_GROUPS: TagGroup[] = [
  g("level", "Level", 0, [["beginner", "Beginner"], ["advanced", "Advanced"], ["professional", "Professional"]]),
  g("audience", "Good for", 1, [["kids", "Kids"], ["family", "Family"], ["couples", "Couples"]]),
  g("format", "Format", 2, [["course", "Course"], ["certification", "Certification"]]),
  g("diet", "Diet", 3, (Object.keys(DIETARY_TAGS) as Array<keyof typeof DIETARY_TAGS>)
    .filter((k) => k !== "kids")
    .map((k) => [k, DIETARY_TAGS[k].label])),
];

/** The diet keys food_meal_plans.dietary_tags accepts (its CHECK constraint). */
export const FOOD_DIET_KEYS = new Set<string>(Object.keys(DIETARY_TAGS));

async function fetchDictionary(): Promise<{ groups: TagGroup[]; fromDb: boolean }> {
  const [groups, tags] = await Promise.all([
    supabaseDb.from("catalog_tag_groups").select("key, label, sort_order, is_active").order("sort_order"),
    supabaseDb.from("catalog_tags").select("key, label, group_key, sort_order, is_active").order("sort_order"),
  ]);
  if (groups.error || tags.error) return { groups: DEFAULT_TAG_GROUPS, fromDb: false };
  const out: TagGroup[] = (groups.data ?? []).map((r: any) => ({
    key: r.key, label: r.label, sortOrder: r.sort_order ?? 0, isActive: r.is_active !== false, tags: [],
  }));
  const byKey = new Map(out.map((x) => [x.key, x]));
  for (const t of (tags.data ?? []) as any[]) {
    byKey.get(t.group_key)?.tags.push({
      key: t.key, label: t.label, groupKey: t.group_key, sortOrder: t.sort_order ?? 0, isActive: t.is_active !== false,
    });
  }
  return { groups: out, fromDb: true };
}

/**
 * The dictionary. `groups` are the ACTIVE groups with their active tags (what
 * customers and businesses see); `all` includes switched-off ones (the admin).
 */
export function useTagDictionary() {
  const q = useQuery({
    queryKey: ["tag-dictionary"],
    staleTime: 10 * 60 * 1000,
    queryFn: fetchDictionary,
    placeholderData: { groups: DEFAULT_TAG_GROUPS, fromDb: false },
  });
  const all = q.data?.groups ?? DEFAULT_TAG_GROUPS;
  return useMemo(() => {
    const groups = all.filter((x) => x.isActive)
      .map((x) => ({ ...x, tags: x.tags.filter((t) => t.isActive) }))
      .filter((x) => x.tags.length > 0);
    const byKey = new Map<string, TagDef>();
    for (const grp of groups) for (const t of grp.tags) byKey.set(t.key, t);
    return {
      groups,
      all,
      fromDb: q.data?.fromDb ?? false,
      isLoading: q.isLoading,
      refetch: q.refetch,
      /** The tag, when the key is a live dictionary word. */
      tag: (key: string) => byKey.get(key) ?? null,
      /** Labels of a plan's dictionary tags, in dictionary order, unknown keys dropped. */
      labelsOf: (keys: unknown, max = Infinity): string[] => {
        if (!Array.isArray(keys)) return [];
        const set = new Set(keys.map(String));
        const out: string[] = [];
        for (const grp of groups) for (const t of grp.tags) if (set.has(t.key)) out.push(t.label);
        return out.slice(0, max);
      },
    };
  }, [all, q.data?.fromDb, q.isLoading, q.refetch]);
}

/** The icon a tag carries, when it has one (the diets do). */
export function tagIcon(key: string): LucideIcon | null {
  return dietaryTagMeta(key)?.icon ?? null;
}
