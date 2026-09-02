import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <SuperAdminLayout title="Audit Logs" subtitle="Track all admin actions">
      {/* Toolbar */}
      <div className="mb-space-4 flex flex-wrap items-center gap-3">
        <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
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
          <SelectTrigger className="w-40">
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
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search entity id, type or action…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(0); }}
            className="w-full sm:w-[150px]"
            aria-label="From date"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(0); }}
            className="w-full sm:w-[150px]"
            aria-label="To date"
          />
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFrom(""); setTo(""); setPage(0); }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : isError ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-destructive">Couldn't load audit logs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unexpected error"}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {log.created_at
                          ? format(
                              new Date(log.created_at),
                              "MMM d, yyyy · h:mm a",
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {getAdminName(log)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={actionColor(log.action)}
                          className="text-xs"
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {log.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.entity_id?.slice(0, 8) || "—"}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                        {log.details && Object.keys(log.details).length > 0
                          ? JSON.stringify(log.details)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Server-side paging: we don't know the total without an extra
                  count query, so this is prev/next rather than numbered pages. */}
              <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Showing {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + filtered.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={filtered.length < PAGE_SIZE}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </SuperAdminLayout>
  );
};

export default AuditLogs;
