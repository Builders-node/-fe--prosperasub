import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { useSeo } from "@/hooks/useSeo";
import { useGoBack } from "@/hooks/useGoBack";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { DetailHeader } from "@/components/patterns/DetailHeader";
import { Breadcrumbs } from "@/components/patterns/Breadcrumbs";
import { Skeleton } from "@/components/patterns/Skeleton";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { CollectionCard } from "@/components/discovery/CollectionCover";
import { planIndex, useHomePlans } from "@/components/discovery/homePlans";
import { collectionHref, collectionPlans, useCollections } from "@/lib/collections";

/**
 * `/collections` — every collection on the site, one cover card each, in the
 * admin's order. A collection with nothing on sale is left out, as on the
 * home page.
 */
export default function Collections() {
  useSeo({ title: "Collections", description: "Hand-picked subscriptions on EverySub, Roatán: popular plans, ideas for families, date nights and more.", path: "/collections" });
  const goBack = useGoBack();
  const { data: collections = [], isLoading: a } = useCollections();
  const { data: plans = [], isLoading: b } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);
  const loading = a || b;
  const rows = collections
    .map((c) => ({ c, items: collectionPlans(c, plans, index) }))
    .filter((x) => x.items.length > 0);

  return (
    <BrowseLayout>
      <DetailHeader title="Collections" centreLabel="Collections" onBack={goBack} />
      <main className="app-container space-y-space-4 pb-10 pt-space-4">
        <Breadcrumbs className="hidden md:block" items={[{ label: "Home", href: "/discovery" }, { label: "Collections" }]} />
        <header className="px-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[36px]">Collections</h1>
          <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">Hand-picked by the EverySub team.</p>
        </header>
        {loading ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/3]" />)}
          </div>
        ) : rows.length === 0 ? (
          <YdEmptyState icon={LayoutGrid} title="No collections yet" subtitle="Soon: hand-picked plans for every occasion." />
        ) : (
          <div className="stagger grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-3 xl:grid-cols-4">
            {rows.map(({ c, items }) => (
              <CollectionCard key={c.id} title={c.title} subtitle={c.subtitle} href={collectionHref(c)} coverUrl={c.coverUrl} plans={items} />
            ))}
          </div>
        )}
      </main>
    </BrowseLayout>
  );
}
