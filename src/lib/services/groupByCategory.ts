/**
 * Group providers under their service category for a public listing page.
 *
 * This existed as the same ~18-line `useMemo` copy-pasted into CarRental,
 * FoodListing, CleaningPackages and BeachClub — and so did its bug, four times
 * over.
 *
 * The bug: every copy walked the ACTIVE-categories list and emitted only the
 * buckets it found there, while sending providers to the `__other__` bucket
 * only when `category_key` was falsy. A provider pointing at a category that
 * had been deactivated (or deleted) was therefore in neither list — not under
 * its own category, because that category wasn't in `cats`, and not under
 * "Other", because its `category_key` was perfectly truthy. It vanished from
 * the public page entirely, along with all of its plans, with no message.
 *
 * One admin toggle in /admin/services/categories was enough to take a live
 * business offline silently. Now an orphaned category falls through to
 * "Other", which is what that bucket is for.
 */

/** The `__other__` bucket key — providers with no category, or a dead one. */
export const UNCATEGORISED = "__other__";

export interface CategoryRef {
  key: string;
  label: string;
}

export interface CategoryGroup<TProvider> {
  key: string;
  label: string;
  providers: TProvider[];
}

/**
 * @param providers  rows to group
 * @param categories active categories, already in display order
 * @param categoryKeyOf  how to read a provider's category (food resolves it
 *   through a join table rather than a column on the provider row)
 */
export function groupProvidersByCategory<TProvider>(
  providers: TProvider[],
  categories: CategoryRef[],
  categoryKeyOf: (provider: TProvider) => string | null | undefined,
  otherLabel = "Other",
): CategoryGroup<TProvider>[] {
  const known = new Set(categories.map((c) => c.key));
  const byCat = new Map<string, TProvider[]>();

  providers.forEach((p) => {
    const raw = categoryKeyOf(p);
    // An unknown key means the category is inactive or gone. Bucket it as
    // uncategorised rather than dropping the provider on the floor.
    const key = raw && known.has(raw) ? raw : UNCATEGORISED;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(p);
  });

  const ordered: CategoryGroup<TProvider>[] = [];
  categories.forEach((c) => {
    const list = byCat.get(c.key);
    if (list?.length) ordered.push({ key: c.key, label: c.label, providers: list });
  });

  const other = byCat.get(UNCATEGORISED);
  if (other?.length) ordered.push({ key: UNCATEGORISED, label: otherLabel, providers: other });

  return ordered;
}
