import { useNavigate } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import { StatusPill } from "@/components/patterns/StatusPill";
import { UserLayout } from "@/components/layout/UserLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMyBusinesses, type MyBusiness as Business } from "@/hooks/useMyBusinesses";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";

/**
 * One list, one destination.
 *
 * The businesses used to be grouped by legacy service and each row navigated
 * through that service's own `portalRoute`. There is one workspace now —
 * /my-provider/:id — and one kind of id to reach it with, so the grouping was
 * describing a distinction the app no longer makes.
 */
function BusinessRow({ row, icon: Icon, onClick }: {
  row: Business;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-radius-lg bg-card p-4 text-left tracking-[-0.02em] transition-colors hover:bg-muted/30"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-radius-md bg-inset">
        {row.avatarUrl
          ? <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
          : <Icon className="h-6 w-6 text-muted-foreground" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[16px] font-semibold leading-[22px] text-foreground">{row.name}</p>
          {row.status && row.status !== "active" && <StatusPill status={row.status} />}
          <Badge variant="secondary" className="rounded-full text-[12px] capitalize">{row.role}</Badge>
        </div>
        {row.description && (
          <p className="mt-0.5 truncate text-[14px] leading-[18px] text-muted-foreground">{row.description}</p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

export default function MyBusiness() {
  const navigate = useNavigate();
  const { businesses, isLoading, hasAny } = useMyBusinesses();
  const { archetypes } = useServiceArchetypes(false);

  return (
    <UserLayout title="My Business">
      <div className="app-container space-y-1 py-6">
        <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <h1 className="text-[24px] font-semibold leading-[29px] text-foreground">My Business</h1>
          <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">
            The businesses you own or help run.
          </p>
        </section>

        {isLoading ? (
          <>
            <div className="h-20 animate-pulse rounded-radius-lg bg-card" />
            <div className="h-20 animate-pulse rounded-radius-lg bg-card" />
          </>
        ) : !hasAny ? (
          <div className="flex flex-col items-center justify-center rounded-radius-lg bg-card px-4 py-16 text-center">
            <Store className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="text-[16px] font-semibold text-foreground">No businesses yet</p>
            <p className="mt-1 max-w-sm text-[14px] leading-[18px] text-muted-foreground">
              Want to offer your service on EverySub? Apply to become a provider — once approved,
              your business appears here to manage.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => navigate("/become-a-provider")}>
              Become a provider
            </Button>
          </div>
        ) : (
          businesses.map((row) => (
            <BusinessRow
              key={row.id}
              row={row}
              icon={archetypes.find((a) => a.key === row.archetypeKey)?.Icon ?? Store}
              onClick={() => navigate(`/my-provider/${row.id}`)}
            />
          ))
        )}
      </div>
    </UserLayout>
  );
}
