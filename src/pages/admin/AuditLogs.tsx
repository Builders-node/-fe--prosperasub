import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { DialogBlock } from "@/components/ui/dialog-blocks";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { QueryError } from "@/components/patterns/QueryError";
import { adminApi } from "@/integrations/supabase/client";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const actionColor = (action: string) => {
  if (action === "create") return "default";
  if (action === "delete" || action === "block") return "destructive";
  if (action === "edit" || action === "change_price") return "secondary";
  return "outline";
};

const AuditLogs = () => {
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side date range. Without this the page hard-capped at the newest
  // 500 rows and filtered in the browser, so anything older simply wasn't
  // there — and searching for it returned "no results" rather than saying so.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [openLog, setOpenLog] = useState<any | null>(null);
  const PAGE_SIZE = 25;

  const { data: logs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-audit-logs", entityFilter, actionFilter, search, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityFilter !== "all") params.set("entityType", entityFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (search.trim()) params.set("q", search.trim());
      if (from) params.set("from", `${from}T00:00:00`);
      if (to) params.set("to", `${to}T23:59:59`);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const { data: res, error: err } = await adminApi(`/admin/audit-logs?${params.toString()}`);
      if (err) throw err;
      const data = ((res as { rows?: any[] })?.rows ?? []) as any[];

      const adminIds = [
        ...new Set(
          (data || []).map((l: any) => l.admin_user_id).filter(Boolean),
        ),
      ];
      // Through the shared helper, which drops ids `users.id` cannot hold.
      // 31 rows in this table were written by Google-sub actors such as
      // "google-114129439113350538026"; PostgREST rejects the WHOLE id=in.(…)
      // batch with 22P02 the moment one is present, so every log line — not
      // just those 31 — lost its admin name.
      const adminsMap = await fetchUsersByIds(adminIds);

      return (data || []).map((log: any) => ({
        ...log,
        admin: adminsMap.get(log.admin_user_id) || null,
      }));
    },
  });

  // The server already applied entity/action/date/search filters.
  const filtered = logs;

  // Facets come from the whole table, not just the rows currently on screen —
  // previously you could only filter by a value that happened to appear in the
  // last 500 events.
  const { data: facets } = useQuery({
    queryKey: ["admin-audit-log-facets"],
    queryFn: async () => {
      const { data, error: err } = await adminApi("/admin/audit-logs/facets");
      if (err) throw err;
      return (data ?? { entity_types: [], actions: [] }) as {
        entity_types: string[]; actions: string[];
      };
    },
    staleTime: 5 * 60_000,
  });
  const uniqueActions = facets?.actions ?? [];
  const uniqueEntities = facets?.entity_types ?? [];

  const getAdminName = (log: any) =>
    log.admin?.display_name || log.admin?.name || log.admin?.email || log.admin_user_id?.slice(0, 8) || "System";

  return (
    <SuperAdminLayout title="Audit log" subtitle="Who changed what, and when — tap a record to read it">
      {/* The shared scaffold owns the search field, the count and the three
          states; the selects and the date range ride in its `filters` slot.
          Paging stays server-side below — the shell does not own that
          (PAGE_TYPES section 10). */}
      <AdminListShell
        search={search}
        onSearch={(v) => { setSearch(v); setPage(0); }}
        searchPlaceholder="Search entity id, type or action…"
        isLoading={isLoading}
        isError={isError}
        error={error as Error}
        onRetry={() => void refetch()}
        isEmpty={!isLoading && filtered.length === 0 && !search && entityFilter === "all" && actionFilter === "all" && !from && !to}
        isNoResults={!isLoading && filtered.length === 0 && !!(search || entityFilter !== "all" || actionFilter !== "all" || from || to)}
        count={filtered.length}
        emptyTitle="No audit logs"
        emptySubtitle="Admin actions will appear here as they happen."
        onClearFilters={() => { setSearch(""); setEntityFilter("all"); setActionFilter("all"); setFrom(""); setTo(""); setPage(0); }}
        filters={<>
        <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
          <SelectTrigger inputSize="sm" className="w-40">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {uniqueEntities.map((e: string) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger inputSize="sm" className="w-40">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {uniqueActions.map((a: string) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <Input
            type="date"
            inputSize="sm"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(0); }}
            className="w-full min-w-0 sm:w-[150px]"
            aria-label="From date"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <Input
            type="date"
            inputSize="sm"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(0); }}
            className="w-full min-w-0 sm:w-[150px]"
            aria-label="To date"
          />
        </div>
        </>}
      >

      {/* One list at every width: a row says who did what to what, in words,
          and opens the whole record. It used to be a five-column table whose
          Details cell was cut to one line of raw JSON, with nothing to click —
          the only place the change itself lived could not be read. */}
      <section className="rounded-radius-lg bg-card p-1.5">
        <div className="space-y-0.5">
          {filtered.map((log: any) => {
            const subject = subjectOf(log);
            return (
              <button
                key={log.id}
                type="button"
                onClick={() => setOpenLog(log)}
                className="flex w-full items-center gap-3 rounded-radius-md p-3 text-left transition-colors hover:bg-inset"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-body font-semibold text-foreground">
                    {getAdminName(log)} <span className="font-normal text-muted-foreground">{verbOf(log.action)}</span>{" "}
                    {entityLabel(log.entity_type)}{subject ? ` · ${subject}` : ""}
                  </p>
                  <p className="truncate text-meta text-muted-foreground">
                    {log.created_at ? format(new Date(log.created_at), "MMM d, yyyy · h:mm a") : "—"}
                    {changedKeys(log).length > 0 && <> · {changedKeys(log).slice(0, 4).map(humanKey).join(", ")}{changedKeys(log).length > 4 ? "…" : ""}</>}
                  </p>
                </div>
                <Badge variant={actionColor(log.action)} className="hidden shrink-0 text-xs sm:inline-flex">{log.action}</Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
        {/* Server-side paging: no total without an extra count query, so prev/next. */}
        <div className="flex items-center justify-between gap-3 px-3 pb-1.5 pt-3">
          <span className="text-meta text-muted-foreground">
            Showing {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + filtered.length}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={filtered.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </section>

      <ResponsiveDialog
        open={!!openLog}
        onOpenChange={(o) => !o && setOpenLog(null)}
        title={openLog ? `${verbOf(openLog.action).replace(/^./, (c) => c.toUpperCase())} ${entityLabel(openLog.entity_type)}` : ""}
        description={openLog ? `${getAdminName(openLog)} · ${openLog.created_at ? format(new Date(openLog.created_at), "MMM d, yyyy · h:mm:ss a") : ""}` : undefined}
      >
        {openLog && <LogDetails log={openLog} />}
      </ResponsiveDialog>
      </AdminListShell>
    </SuperAdminLayout>
  );
};

// ─── Reading a record ───────────────────────────────────────────────────────

const ENTITY_LABEL: Record<string, string> = {
  provider: "business", user: "customer", booking: "booking", food_subscription: "food subscription",
  cleaning_subscription: "cleaning subscription", subscription: "subscription", plan: "plan",
  provider_plan: "plan", payout: "payout", role: "role",
};
const entityLabel = (t?: string | null) => ENTITY_LABEL[String(t ?? "")] ?? String(t ?? "record").replace(/_/g, " ");

const VERB: Record<string, string> = {
  create: "created", edit: "edited", update: "edited", delete: "deleted", block: "blocked", unblock: "unblocked",
  change_price: "changed the price of", approve: "approved", reject: "rejected", claim_owner: "took over",
};
const verbOf = (a?: string | null) => VERB[String(a ?? "")] ?? String(a ?? "changed").replace(/_/g, " ");

/** The thing's own name, when the record carries one. */
function subjectOf(log: any): string | null {
  const d = log.details ?? {};
  const v = d.name ?? d.plan_name ?? d.title ?? d.customer_name ?? d.email ?? null;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
const changedKeys = (log: any): string[] =>
  log.details && typeof log.details === "object" ? Object.keys(log.details) : [];
const humanKey = (k: string) => k.replace(/_/g, " ").replace(/\b(id|url)\b/g, (m) => m.toUpperCase());

/** Where the record's subject lives in the admin, when it has a page. */
function entityHref(log: any): string | null {
  const id = log.entity_id;
  if (!id) return null;
  if (log.entity_type === "provider") return `/admin/marketplace/providers/${id}`;
  if (log.entity_type === "user") return `/admin/customers/${encodeURIComponent(id)}`;
  return null;
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  if (typeof v === "string" && /^https?:\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(v)) {
    return (
      <a href={v} target="_blank" rel="noreferrer" className="inline-block">
        <img src={v} alt="" className="h-16 w-16 rounded-radius-md bg-muted object-cover" loading="lazy" />
      </a>
    );
  }
  if (typeof v === "string" && /^https?:\/\//.test(v)) {
    return <a href={v} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-2 hover:underline">{v}</a>;
  }
  if (Array.isArray(v) && v.every((x) => typeof x !== "object")) return <>{v.join(", ") || "—"}</>;
  if (typeof v === "object") {
    return <pre className="whitespace-pre-wrap break-all font-mono text-meta text-muted-foreground">{JSON.stringify(v, null, 2)}</pre>;
  }
  return <span className="break-words">{String(v)}</span>;
}

function LogDetails({ log }: { log: any }) {
  const href = entityHref(log);
  const details = log.details && typeof log.details === "object" ? log.details as Record<string, unknown> : {};
  const keys = Object.keys(details);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { /* selectable anyway */ }
  };
  return (
    <>
      <DialogBlock title="Record">
        <dl className="space-y-3">
          <Row label="Action"><Badge variant={actionColor(log.action)} className="text-xs">{log.action}</Badge></Row>
          <Row label="What">{entityLabel(log.entity_type)}{subjectOf(log) ? ` · ${subjectOf(log)}` : ""}</Row>
          {log.entity_id && (
            <Row label="ID">
              <span className="flex items-center gap-2">
                <span className="break-all font-mono text-meta">{log.entity_id}</span>
                <Button size="iconSm" variant="ghost" aria-label="Copy ID" onClick={() => void copy(String(log.entity_id))}><Copy /></Button>
              </span>
            </Row>
          )}
        </dl>
        {href && (
          <Button asChild variant="secondary" className="w-full">
            <Link to={href}>Open {entityLabel(log.entity_type)}</Link>
          </Button>
        )}
      </DialogBlock>
      <DialogBlock title={keys.length ? `Details (${keys.length})` : "Details"}>
        {keys.length === 0 ? (
          <p className="text-body text-muted-foreground">Nothing else was recorded.</p>
        ) : (
          <dl className="space-y-3">
            {keys.map((k) => <Row key={k} label={humanKey(k)}><Value v={details[k]} /></Row>)}
          </dl>
        )}
      </DialogBlock>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(96px,35%)_1fr] gap-3">
      <dt className="text-meta capitalize text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-body text-foreground">{children}</dd>
    </div>
  );
}

export default AuditLogs;
