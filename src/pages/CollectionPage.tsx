import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useSeo } from "@/hooks/useSeo";
import { useGoBack } from "@/hooks/useGoBack";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { DetailHeader } from "@/components/patterns/DetailHeader";
import { Breadcrumbs } from "@/components/patterns/Breadcrumbs";
import { ShareButton } from "@/components/patterns/ShareButton";
import { Skeleton } from "@/components/patterns/Skeleton";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { Button } from "@/components/ui/button";
import { CollectionCard, CollectionCover } from "@/components/discovery/CollectionCover";
import { PlanTile, planIndex, planPhotos, useHomePlans } from "@/components/discovery/homePlans";
import { collectionHref, collectionPlans, offersLabel, useCollections } from "@/lib/collections";

/**
 * `/collections/:slug` — one collection as a page: its cover, its title and a
 * few sentences, then every offer on it in the admin's order.
 *
 * Found by its words or by its id (a collection made before it had words, or a
 * link copied from the admin). An id or a stale address is sent on to the
 * current words, so there is one address per collection.
 */
export default function CollectionPage() {
  const { slug = "" } = useParams();
  const goBack = useGoBack();
  const { data: collections = [], isLoading: loadingCollections } = useCollections();
  const { data: plans = [], isLoading: loadingPlans } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);

  const c = collections.find((x) => x.slug === slug) ?? collections.find((x) => x.id === slug) ?? null;
  const items = useMemo(() => (c ? collectionPlans(c, plans, index) : []), [c, plans, index]);

  useSeo({
    title: c?.title ?? (loadingCollections ? null : "Collection"),
    description: c ? (c.description || c.subtitle || `${c.title} on EverySub, Roatán.`) : null,
    path: c ? collectionHref(c) : null,
    image: c ? (c.coverUrl || planPhotos(items[0])[0] || null) : null,
  });

  if (c && c.slug && slug !== c.slug) return <Navigate to={collectionHref(c)} replace />;

  const crumbs = [
    { label: "Home", href: "/discovery" },
    { label: "Collections", href: "/collections" },
    { label: c?.title ?? "Collection" },
  ];

  if (!loadingCollections && !c) {
    return (
      <BrowseLayout>
        <DetailHeader title="Collection" centreLabel="Collection" onBack={goBack} />
        <main className="app-container py-space-6">
          <YdEmptyState
            icon={LayoutGrid}
            title="This collection is not on the site"
            subtitle="It may have been renamed or taken down. Have a look at the others."
            action={<Button asChild size="sm"><Link to="/collections">All collections</Link></Button>}
          />
        </main>
      </BrowseLayout>
    );
  }

  const loading = loadingCollections || loadingPlans;

  return (
    <BrowseLayout>
      <DetailHeader
        title={c?.title ?? "Collection"}
        centreLabel="Collection"
        onBack={goBack}
        overPhoto
        rightAction={c ? <ShareButton title={c.title} text={c.subtitle ?? undefined} className="hover:bg-black/10 md:text-foreground" /> : undefined}
      />

      <div className="hidden md:app-container md:block md:pt-space-4">
        <Breadcrumbs items={crumbs} />
      </div>

      {/* Cover: 220px on a phone under the floating bar, 300 on a laptop. */}
      <div className="md:app-container md:pt-space-3">
        <div data-detail-photo className="relative h-[220px] w-full overflow-hidden rounded-b-radius-lg md:h-[300px] md:rounded-radius-lg">
          {loading || !c ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : (
            <CollectionCover coverUrl={c.coverUrl} plans={items} priority className="absolute inset-0" />
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/50 to-transparent md:hidden" />
        </div>
      </div>

      <main className="app-container space-y-space-5 pb-10 pt-space-4">
        <header className="space-y-2 px-1">
          {c ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[36px]">{c.title}</h1>
                <div className="hidden md:block">
                  <ShareButton title={c.title} text={c.subtitle ?? undefined} />
                </div>
              </div>
              <p className="text-[15px] font-semibold leading-[22px] text-foreground">
                {loading ? " " : offersLabel(items.length)}
                {c.subtitle && <span className="font-normal text-muted-foreground"> · {c.subtitle}</span>}
              </p>
              {c.description && (
                <p className="max-w-[720px] whitespace-pre-line text-[15px] leading-[23px] text-muted-foreground">{c.description}</p>
              )}
            </>
          ) : (
            <>
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-5 w-40" />
            </>
          )}
        </header>

        {loading ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)}
          </div>
        ) : items.length === 0 ? (
          <YdEmptyState
            icon={LayoutGrid}
            title="Nothing here yet"
            subtitle="Offers will appear here as soon as they are added to this collection."
            action={<Button asChild size="sm" variant="secondary"><Link to="/discovery">Browse all plans</Link></Button>}
          />
        ) : (
          <div className="stagger grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4 xl:grid-cols-5">
            {items.map((p) => <PlanTile key={p.id} plan={p} />)}
          </div>
        )}

        <MoreCollections currentId={c?.id ?? null} />
      </main>
    </BrowseLayout>
  );
}

/** The other collections, as small cover cards — the way on to the next shelf. */
function MoreCollections({ currentId }: { currentId: string | null }) {
  const { data: collections = [] } = useCollections();
  const { data: plans = [] } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);
  const others = collections
    .filter((c) => c.id !== currentId)
    .map((c) => ({ c, items: collectionPlans(c, plans, index) }))
    .filter((x) => x.items.length > 0)
    .slice(0, 4);
  if (others.length === 0) return null;
  return (
    <section className="space-y-3 pt-space-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-heading font-semibold text-foreground">More collections</h2>
        <Link to="/collections" className="text-body font-semibold text-foreground hover:underline">All</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {others.map(({ c, items }) => <CollectionCard key={c.id} title={c.title} href={collectionHref(c)} coverUrl={c.coverUrl} plans={items} />)}
      </div>
    </section>
  );
}
