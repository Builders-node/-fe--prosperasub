import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { PlanRail, ShelfHeader, planIndex, useHomePlans } from "@/components/discovery/homePlans";
import { collectionHref, collectionPlans, useCollections } from "@/lib/collections";
import { tr } from "@/lib/tr";

/**
 * The shelves an admin puts together for the home page — "Popular", "For
 * beginners", "For families" (Admin → Marketing → Collections). A shelf is
 * hand-picked plans, a tag (every live plan carrying it), or both.
 *
 * Each shelf shows its first eight and links to the collection's own page for
 * the rest ("See all"). A shelf left with nothing on it is not drawn. Without
 * the table (migration not yet applied) the query errors and the section is
 * just absent.
 */
const ON_SHELF = 8;

export function CollectionsSection() {
  const { data: shelves = [] } = useCollections();
  const { data: plans = [], isLoading } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);

  if (shelves.length === 0) return null;

  return (
    <>
      {shelves.map((s) => {
        const all = collectionPlans(s, plans, index);
        if (!isLoading && all.length === 0) return null;
        return (
          <section key={s.id} className="space-y-3" aria-label={s.title}>
            <ShelfHeader
              title={s.title}
              subtitle={s.subtitle}
              action={
                <Link
                  to={collectionHref(s)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-body font-semibold text-foreground transition-colors hover:bg-inset"
                >
                  {all.length > ON_SHELF ? tr("All {length}", { length: all.length }) : tr("See all")}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <PlanRail plans={all.slice(0, ON_SHELF)} loading={isLoading} />
          </section>
        );
      })}
    </>
  );
}
