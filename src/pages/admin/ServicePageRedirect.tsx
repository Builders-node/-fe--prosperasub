import { Navigate, useParams, useSearchParams } from "react-router-dom";

/**
 * Where the per-service page used to be.
 *
 * Its Businesses tab was the Businesses list filtered by the service, and its
 * Categories tab was the chips on the Services list. Links still out there
 * (bookmarks, the go-live panel of older builds) land on the same thing:
 *
 *   /admin/marketplace/service/cleaning                    → Services, Cleaning's panel open
 *   /admin/marketplace/service/cleaning?tab=categories&edit=pool → that category's panel
 *   /admin/marketplace/service/unassigned                  → Businesses, "No service"
 */
export default function ServicePageRedirect() {
  const { key = "" } = useParams<{ key: string }>();
  const [params] = useSearchParams();
  if (key === "unassigned") return <Navigate to="/admin/marketplace/providers?service=unassigned" replace />;
  if (params.get("tab") === "providers" || (!params.get("tab") && params.get("view") === "businesses")) {
    return <Navigate to={`/admin/marketplace/providers?service=${encodeURIComponent(key)}`} replace />;
  }
  const edit = params.get("edit");
  return <Navigate to={edit ? `/admin/marketplace?category=${encodeURIComponent(edit)}` : `/admin/marketplace?service=${encodeURIComponent(key)}`} replace />;
}
