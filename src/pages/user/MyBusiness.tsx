import { useNavigate } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";
import type { MyProviderRow } from "@/hooks/useMyProviders";
import type { ServiceConfig, ProviderConfig } from "@/lib/services/registry";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

function BusinessRow({
  row, service, onClick,
}: {
  row: MyProviderRow;
  service: ServiceConfig & { providers: ProviderConfig };
  onClick?: () => void;
}) {
  const Icon = service.icon;
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className="flex w-full items-center gap-4 rounded-3xl bg-card p-4 text-left transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted">
        <Icon className={`h-6 w-6 ${service.chip.replace("bg-", "text-")}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-bold text-foreground">{row.name}</p>
          {row.status && (
            <Badge className={`rounded-full text-xs capitalize ${STATUS_COLORS[row.status] ?? ""}`}>{row.status}</Badge>
          )}
          <Badge variant="secondary" className="rounded-full text-xs capitalize">{row.myRole}</Badge>
          {!clickable && (
            <Badge variant="outline" className="rounded-full text-[10px]">portal soon</Badge>
          )}
        </div>
        {row.description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{row.description}</p>}
      </div>
      {clickable && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />}
    </button>
  );
}

export default function MyBusiness() {
  const navigate = useNavigate();
  const { groups, isLoading, hasAny } = useMyBusinesses();

  return (
    <UserLayout title="My Business">
      <div className="app-container space-y-6 py-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">My Business</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the businesses you own or help run.</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-3xl bg-muted" />
            <div className="h-20 animate-pulse rounded-3xl bg-muted" />
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-card px-4 py-16 text-center">
            <Store className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No businesses yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Want to offer your service on ProsperaSub? Apply to become a provider — once approved,
              your business appears here to manage.
            </p>
            <Button className="mt-4 rounded-full" onClick={() => navigate("/become-a-provider")}>
              Become a provider
            </Button>
          </div>
        ) : (
          groups.map(({ service, rows }) => (
            <section key={service.key} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {service.providers.labels.plural}
              </h2>
              {rows.map((r) => (
                <BusinessRow
                  key={r.id}
                  row={r}
                  service={service}
                  onClick={service.providers.portalRoute ? () => navigate(service.providers.portalRoute!(r.id)) : undefined}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </UserLayout>
  );
}
