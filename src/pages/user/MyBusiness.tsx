import { useNavigate } from "react-router-dom";
import { ChefHat, Car, ChevronRight, Store } from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Badge } from "@/components/ui/badge";
import { useMyBusinesses } from "@/hooks/useMyBusinesses";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  inactive: "bg-muted text-muted-foreground",
};

interface RowProps {
  name: string;
  description?: string | null;
  status?: string;
  role: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function BusinessRow({ name, description, status, role, icon, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-3xl bg-card p-4 text-left transition-colors hover:bg-muted/30"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-bold text-foreground">{name}</p>
          {status && (
            <Badge className={`rounded-full text-xs capitalize ${STATUS_COLORS[status] ?? ""}`}>{status}</Badge>
          )}
          <Badge variant="secondary" className="rounded-full text-xs capitalize">{role}</Badge>
        </div>
        {description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

export default function MyBusiness() {
  const navigate = useNavigate();
  const { restaurants, carRentals, isLoading, hasAny } = useMyBusinesses();

  return (
    <UserLayout title="My Business">
      <div className="app-container space-y-6 py-6">
        <div>
          <p className="type-overline text-primary">Account</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">My Business</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the restaurants and car rentals you own or run.</p>
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
              If you should manage a restaurant or car rental, ask a platform administrator to add you as its owner or a manager.
            </p>
          </div>
        ) : (
          <>
            {restaurants.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Restaurants</h2>
                {restaurants.map((r) => (
                  <BusinessRow
                    key={r.id}
                    name={r.name}
                    description={r.description}
                    status={r.status}
                    role={r.myRole}
                    icon={<ChefHat className="h-6 w-6 text-emerald-500" />}
                    onClick={() => navigate(`/my-restaurant?providerId=${r.id}`)}
                  />
                ))}
              </section>
            )}

            {carRentals.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Car Rentals</h2>
                {carRentals.map((p) => (
                  <BusinessRow
                    key={p.id}
                    name={p.name}
                    description={p.description}
                    status={p.status}
                    role={p.myRole}
                    icon={<Car className="h-6 w-6 text-orange-500" />}
                    onClick={() => navigate(`/my-car-rental?providerId=${p.id}`)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </UserLayout>
  );
}
