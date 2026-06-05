import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Search } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { supabaseDb } from "@/integrations/supabase/client";
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

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("admin_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const adminIds = [
        ...new Set(
          (data || []).map((l: any) => l.admin_user_id).filter(Boolean),
        ),
      ];
      let adminsMap = new Map<string, any>();
      if (adminIds.length > 0) {
        const { data: admins } = await supabaseDb
          .from("users")
          .select("id, name, display_name, email")
          .in("id", adminIds);
        adminsMap = new Map(
          (admins ?? []).map((u: any) => [u.id, u]),
        );
      }

      return (data || []).map((log: any) => ({
        ...log,
        admin: adminsMap.get(log.admin_user_id) || null,
      }));
    },
  });

  const filtered = useMemo(() => {
    let result = logs;
    if (entityFilter !== "all")
      result = result.filter((l: any) => l.entity_type === entityFilter);
    if (actionFilter !== "all")
      result = result.filter((l: any) => l.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l: any) =>
          (l.admin?.email || "").toLowerCase().includes(q) ||
          (l.admin?.name || "").toLowerCase().includes(q) ||
          (l.entity_id || "").toLowerCase().includes(q) ||
          JSON.stringify(l.details || {}).toLowerCase().includes(q),
      );
    }
    return result;
  }, [logs, entityFilter, actionFilter, search]);

  const uniqueActions = useMemo(
    () => [...new Set(logs.map((l: any) => l.action))].sort(),
    [logs],
  );
  const uniqueEntities = useMemo(
    () => [...new Set(logs.map((l: any) => l.entity_type))].sort(),
    [logs],
  );

  const getAdminName = (log: any) =>
    log.admin?.display_name || log.admin?.name || log.admin?.email || log.admin_user_id?.slice(0, 8) || "System";

  return (
    <SuperAdminLayout title="Audit Logs" subtitle="Track all admin actions">
      {/* Toolbar */}
      <div className="mb-space-4 flex flex-wrap items-center gap-3">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
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
        <Select value={actionFilter} onValueChange={setActionFilter}>
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="pl-9"
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} entries
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading...
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
            </div>
          )}
        </CardContent>
      </Card>
    </SuperAdminLayout>
  );
};

export default AuditLogs;
