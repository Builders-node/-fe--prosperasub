import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Eye, MoreVertical, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * What customers said, and the one lever the platform has over it.
 *
 * There was no admin surface for reviews at all: a fake or abusive one could
 * only be dealt with in SQL. In a village of twenty-five buyers a single
 * malicious review is a business, so this needed to exist before it was
 * needed in a hurry.
 *
 * Hiding, not deleting, is the default. A business that complains deserves a
 * record of what was said and who took it down, and a customer who wrote a
 * fair one deserves it not to disappear without trace. Delete stays, behind a
 * confirmation, for the genuinely fake.
 *
 * Moderation is deliberately NOT in the provider's own workspace — a business
 * removing its own bad reviews is the thing this guards against.
 */

interface ReviewRow {
  id: string;
  provider_id: string;
  customer_name: string | null;
  rating: number | null;
  comment: string | null;
  service: string | null;
  created_at: string;
  hidden_at: string | null;
  hidden_reason: string | null;
}

export interface MarketplaceReviewsProps {
  /** Mounted as a tab — skip the page chrome. */
  embedded?: boolean;
  /** Locks the list to one business. */
  providerId?: string;
}

const MarketplaceReviews = ({ embedded = false, providerId: scopedProvider }: MarketplaceReviewsProps = {}) => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("all");
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [hideTarget, setHideTarget] = useState<ReviewRow | null>(null);
  const [hideReason, setHideReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ReviewRow | null>(null);

  const { data: providers = [] } = useQuery({
    queryKey: ["review-providers-slim"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const providerName = useMemo(
    () => new Map(providers.map((p) => [p.id, p.name])),
    [providers],
  );

  const KEY = ["admin-reviews", scopedProvider ?? "all"] as const;
  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => fetchAllRows<ReviewRow>(() => {
      const q = supabaseDb
        .from("provider_reviews")
        .select("id,provider_id,customer_name,rating,comment,service,created_at,hidden_at,hidden_reason");
      return (scopedProvider ? q.eq("provider_id", scopedProvider) : q).order("id");
    }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    // The storefront average and every review list read the same rows.
    void qc.invalidateQueries({ queryKey: ["provider-ratings"] });
    void qc.invalidateQueries({ queryKey: ["provider-reviews"] });
  };

  const setHidden = useMutation({
    mutationFn: async ({ row, hide, reason }: { row: ReviewRow; hide: boolean; reason?: string }) => {
      const patch = hide
        ? {
            hidden_at: new Date().toISOString(),
            hidden_by: userData?.id ?? null,
            hidden_reason: (reason ?? "").trim() || null,
          }
        : { hidden_at: null, hidden_by: null, hidden_reason: null };
      const { error: e } = await supabaseDb.from("provider_reviews").update(patch).eq("id", row.id);
      if (e) throw e;
      if (userData?.id) {
        await logAuditEvent(userData.id, hide ? "hide" : "unhide", "provider_review", row.id, patch);
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.hide ? "Review hidden" : "Review restored");
      invalidate();
      setHideTarget(null);
      setHideReason("");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (row: ReviewRow) => {
      const { error: e } = await supabaseDb.from("provider_reviews").delete().eq("id", row.id);
      if (e) throw e;
      if (userData?.id) await logAuditEvent(userData.id, "delete", "provider_review", row.id, {});
    },
    onSuccess: () => { toast.success("Review deleted"); invalidate(); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (providerFilter !== "all" && r.provider_id !== providerFilter) return false;
        if (rating !== "all" && String(r.rating ?? "") !== rating) return false;
        if (visibility === "visible" && r.hidden_at) return false;
        if (visibility === "hidden" && !r.hidden_at) return false;
        if (!needle) return true;
        return [r.comment, r.customer_name, providerName.get(r.provider_id)]
          .some((v) => (v ?? "").toLowerCase().includes(needle));
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [rows, search, rating, visibility, providerFilter, providerName]);

  const pager = usePagination(filtered, 25);

  const hasFilters = search !== "" || rating !== "all" || visibility !== "all" || providerFilter !== "all";
  const clearFilters = () => {
    setSearch(""); setRating("all"); setVisibility("all"); setProviderFilter("all");
  };

  const body = (
    <>
      <AdminListShell
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search the text, the customer or the business"
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={rows.length === 0}
        isNoResults={rows.length > 0 && filtered.length === 0}
        onClearFilters={hasFilters ? clearFilters : undefined}
        count={filtered.length}
        emptyTitle="No reviews yet"
        emptySubtitle="Customers are asked for one after a finished job."
        filters={
          <>
            {!scopedProvider && (
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Business" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All businesses</SelectItem>
                  {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any rating</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="visible">On the storefront</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4 py-3">Rating</TableHead>
              <TableHead className="px-4 py-3">Review</TableHead>
              <TableHead className="px-4 py-3">Business</TableHead>
              <TableHead className="px-4 py-3">When</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.paged.map((r) => (
              <TableRow key={r.id} className={cn(r.hidden_at && "opacity-55")}>
                <TableCell className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {r.rating ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="max-w-[420px] px-4 py-3">
                  <p className="truncate text-foreground">{r.comment || <span className="text-muted-foreground">— no text —</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.customer_name || "Anonymous"}
                    {r.hidden_at && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        hidden{r.hidden_reason ? ` · ${r.hidden_reason}` : ""}
                      </span>
                    )}
                  </p>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Link
                    to={`/admin/marketplace/providers/${r.provider_id}`}
                    className="text-primary hover:underline"
                  >
                    {providerName.get(r.provider_id) ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{formatDateHN(r.created_at)}</TableCell>
                <TableCell className="px-4 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Row actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {r.hidden_at ? (
                        <DropdownMenuItem onSelect={() => setHidden.mutate({ row: r, hide: false })}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> Put back on the storefront
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => { setHideTarget(r); setHideReason(""); }}>
                          <EyeOff className="mr-2 h-3.5 w-3.5" /> Hide from the storefront
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => setDeleteTarget(r)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          page={pager.page}
          totalPages={pager.totalPages}
          from={pager.from}
          to={pager.to}
          total={pager.total}
          onPage={pager.setPage}
        />
      </AdminListShell>

      {/* Hiding asks why — the reason is what makes the record worth keeping. */}
      <AlertDialog open={!!hideTarget} onOpenChange={(o) => !o && setHideTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide this review?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off the business's page and stops counting towards their rating.
              The review itself is kept, and you can put it back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="hide-reason">Why (optional)</Label>
            <Input
              id="hide-reason"
              value={hideReason}
              onChange={(e) => setHideReason(e.target.value)}
              placeholder="Abusive language, not a real customer…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => hideTarget && setHidden.mutate({ row: hideTarget, hide: true, reason: hideReason })}
            >
              Hide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it permanently, with no record of what it said. If you only
              want it off the storefront, <strong>hide</strong> it instead — that keeps
              the text and who took it down.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Reviews" subtitle="What customers said, across every business">
      {body}
    </SuperAdminLayout>
  );
};

export default MarketplaceReviews;
