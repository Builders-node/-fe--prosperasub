import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Check, LifeBuoy, Mail, MessageCircle, ExternalLink, UserRound } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { TabPills } from "@/components/admin/TabPills";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/integrations/supabase/client";
import { formatTimestampHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * Support inbox.
 *
 * Replies go out over email or WhatsApp, not from here — so this screen's job
 * is to make sure nothing sits unread, not to host a conversation. Hence the
 * two-state marker (new → handled) rather than a ticket lifecycle nobody would
 * keep accurate.
 */

const QUERY_KEY = ["admin-support-messages"] as const;

interface SupportMessage {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  page_url: string | null;
  status: string;
  created_at: string;
  handled_at: string | null;
}

export default function AdminSupport() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"new" | "handled" | "all">("new");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // Through the backend, not PostgREST: the table is service-role only
      // because every row carries a name, an email and free text. With the anon
      // key this list would come back empty and read as "no messages" rather
      // than "no access".
      const { data, error } = await adminApi("/admin/support/messages");
      if (error) throw new Error(error.message || "Could not load support messages");
      return (data ?? []) as SupportMessage[];
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return [r.name, r.email, r.subject, r.message].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, status, search]);

  const newCount = rows.filter((r) => r.status === "new").length;

  const setHandled = useMutation({
    mutationFn: async ({ id, handled }: { id: string; handled: boolean }) => {
      const { error } = await adminApi(`/admin/support/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ handled }),
      });
      if (error) throw new Error(error.message || "Could not update the message");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // The queue length sits at the top of the page, not inside a dropdown — it
  // is the one number this screen exists to drive to zero.
  const filters = (
    <TabPills<"new" | "handled" | "all">
      tabs={[
        { value: "new", label: "New", badge: newCount },
        { value: "handled", label: "Handled" },
        { value: "all", label: "All" },
      ] as const}
      value={status}
      onChange={setStatus}
    />
  );

  return (
    <SuperAdminLayout
      title="Support"
      subtitle="Messages from customers — reply by email or WhatsApp, then mark as handled"
    >
      {!isLoading && !isError && (
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          {newCount === 0
            ? "Nothing waiting — every message has been handled."
            : <><span className="font-semibold tabular-nums text-foreground">{newCount} new</span> {newCount === 1 ? "message is" : "messages are"} waiting for a reply.</>}
        </p>
      )}
      <AdminListShell
        search={search} onSearch={setSearch} searchPlaceholder="Search by name, email or text…"
        filters={filters}
        isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
        isEmpty={rows.length === 0}
        isNoResults={rows.length > 0 && visible.length === 0} count={visible.length}
        emptyTitle="No messages yet"
        emptySubtitle="Customer messages from the Support page land here."
        onClearFilters={() => { setSearch(""); setStatus("all"); }}
      >
        <div className="space-y-2">
          {visible.map((m) => {
            const open = expanded === m.id;
            const handled = m.status === "handled";
            return (
              <div key={m.id} className={cn("overflow-hidden rounded-radius-md bg-card", handled && "opacity-70")}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : m.id)}
                  className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-primary/10">
                    <LifeBuoy className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-foreground">{m.subject}</p>
                      <StatusPill status={handled ? "completed" : "pending"} label={handled ? "Handled" : "New"} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {m.name} · {m.email}
                      {m.user_id ? "" : " · not signed in"}
                    </p>
                    {!open && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground/80">{m.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                    {formatTimestampHN(m.created_at)}
                  </span>
                </button>

                {open && (
                  <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.message}</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Reply by email
                        </a>
                      </Button>
                      {m.phone && (
                        <Button asChild size="sm" variant="secondary">
                          <a
                            href={`https://wa.me/${m.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                          </a>
                        </Button>
                      )}
                      {m.user_id && (
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`/admin/users?userId=${encodeURIComponent(m.user_id)}`}>
                            <UserRound className="mr-1.5 h-3.5 w-3.5" /> Open customer
                          </Link>
                        </Button>
                      )}
                      {m.page_url && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={m.page_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Where they were
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={handled ? "ghost" : "primary"}
                        className="ml-auto"
                        disabled={setHandled.isPending}
                        onClick={() => setHandled.mutate({ id: m.id, handled: !handled })}
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        {handled ? "Mark as new" : "Mark as handled"}
                      </Button>
                    </div>

                    {handled && m.handled_at && (
                      <p className="text-caption text-muted-foreground">
                        Handled {formatTimestampHN(m.handled_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AdminListShell>
    </SuperAdminLayout>
  );
}
