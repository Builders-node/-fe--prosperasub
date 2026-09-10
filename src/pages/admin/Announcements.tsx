import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Users2 } from "lucide-react";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { formatDateHN } from "@/lib/timezone";

/**
 * Telling everybody something.
 *
 * The platform has written two hundred and fifty notifications and every one
 * of them was the system talking about one person's order. There was no way to
 * say "the club is closed on Thursday" or "prices change on the first" to
 * anyone at all — the only channel to a customer was somebody's WhatsApp.
 *
 * Audiences are computed from what people actually did, not from a list an
 * admin has to keep: who is subscribed right now, who runs a business, who
 * buys from one business. A segment nobody is in is shown as empty BEFORE the
 * send rather than after, because the count is the only review this gets.
 */

type Audience = "everyone" | "active" | "providers" | "provider";

const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: "Everyone with an account",
  active: "Customers with something active",
  providers: "People who run a business",
  provider: "Customers of one business",
};

const Announcements = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [audience, setAudience] = useState<Audience>("active");
  const [providerId, setProviderId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data: providers = [] } = useQuery({
    queryKey: ["announce-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("id,name").eq("status", "active").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  /** Who this would reach, resolved from behaviour rather than a kept list. */
  const { data: recipients = [], isLoading: resolving } = useQuery({
    queryKey: ["announce-recipients", audience, providerId],
    enabled: audience !== "provider" || !!providerId,
    queryFn: async (): Promise<string[]> => {
      if (audience === "everyone") {
        const rows = await fetchAllRows<{ id: string }>(() =>
          supabaseDb.from("users").select("id").is("deleted_at", null).order("id"));
        return rows.map((r) => r.id);
      }

      if (audience === "providers") {
        const [owners, members] = await Promise.all([
          fetchAllRows<{ admin_user_id: string | null }>(() =>
            supabaseDb.from("providers").select("admin_user_id").order("id")),
          fetchAllRows<{ user_id: string | null }>(() =>
            supabaseDb.from("provider_members").select("user_id").order("provider_id")),
        ]);
        return [...new Set([
          ...owners.map((o) => o.admin_user_id),
          ...members.map((m) => m.user_id),
        ])].filter((id): id is string => !!id);
      }

      // Both remaining audiences are "who is buying", read from the one view
      // that folds every service together.
      const rows = await fetchAllRows<{ user_id: string | null; provider_id: string | null; status: string }>(() => {
        const q = supabaseDb
          .from("subscriptions_unified")
          .select("user_id,provider_id,status")
          .eq("status", "active");
        return (audience === "provider" ? q.eq("provider_id", providerId) : q).order("id");
      });
      return [...new Set(rows.map((r) => r.user_id))]
        .filter((id): id is string => !!id && UUID_RE.test(id));
    },
  });

  const { data: sent = [] } = useQuery({
    queryKey: ["announce-history"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("user_notifications")
        .select("title,body,created_at")
        .eq("category", "announcement")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as Array<{ title: string; body: string; created_at: string }>;
    },
  });

  /** One row per person; the announcement itself is the title + body repeated. */
  const history = useMemo(() => {
    const seen = new Map<string, { title: string; body: string; created_at: string; count: number }>();
    for (const n of sent) {
      const key = `${n.title}::${n.created_at.slice(0, 16)}`;
      const prev = seen.get(key);
      if (prev) prev.count += 1;
      else seen.set(key, { ...n, count: 1 });
    }
    return [...seen.values()];
  }, [sent]);

  const send = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give it a title");
      if (recipients.length === 0) throw new Error("Nobody is in this audience");

      const now = new Date().toISOString();
      const rows = recipients.map((uid) => ({
        recipient_user_id: uid,
        category: "announcement",
        type: "admin_announcement",
        title: title.trim(),
        body: body.trim(),
        action_url: actionUrl.trim() || null,
        is_read: false,
        is_archived: false,
        created_at: now,
        updated_at: now,
      }));

      // In chunks: one insert of several hundred rows is a request that can
      // time out halfway and leave nobody sure who was told.
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabaseDb.from("user_notifications").insert(rows.slice(i, i + 200));
        if (error) throw error;
      }

      if (userData?.id) {
        await logAuditEvent(userData.id, "create", "announcement", null, {
          audience, providerId: audience === "provider" ? providerId : null,
          recipients: recipients.length, title: title.trim(),
        });
      }
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Sent to ${n} ${n === 1 ? "person" : "people"}`);
      setTitle(""); setBody(""); setActionUrl(""); setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["announce-history"] });
    },
    onError: (e: any) => { toast.error(e?.message || "Could not send"); setConfirming(false); },
  });

  const ready = title.trim().length > 0 && recipients.length > 0 && !resolving;

  return (
    <SuperAdminLayout title="Announcements" subtitle="Say something to customers or to the businesses">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4 rounded-radius-md bg-card p-5">
          <div>
            <Label>Who gets it</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                  <SelectItem key={a} value={a}>{AUDIENCE_LABEL[a]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {audience === "provider" && (
            <div>
              <Label>Which business</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger><SelectValue placeholder="Pick a business" /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The beach club is closed on Thursday"
              maxLength={120}
            />
          </div>

          <div>
            <Label htmlFor="a-body">Message</Label>
            <Textarea
              id="a-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Maintenance on the courts. Everything is back on Friday morning."
            />
          </div>

          <div>
            <Label htmlFor="a-url">Where it should take them (optional)</Label>
            <Input
              id="a-url"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="/services/entertainment"
            />
            <p className="mt-1 text-[12px] text-muted-foreground">
              A path on this site, like <code>/discovery</code>. Leave it empty and the
              notification simply reads.
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <p className="text-sm text-muted-foreground">
              {resolving ? (
                <span className="inline-flex items-center gap-2"><Spinner size="sm" /> counting…</span>
              ) : (
                <>
                  <Users2 className="mr-1.5 inline h-4 w-4" />
                  {recipients.length} {recipients.length === 1 ? "person" : "people"}
                </>
              )}
            </p>
            <Button onClick={() => setConfirming(true)} disabled={!ready}>
              <Send className="mr-1.5 h-4 w-4" /> Send
            </Button>
          </div>
        </section>

        <aside className="space-y-3 rounded-radius-md bg-card p-5">
          <h2 className="text-caption font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Already sent
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {history.map((h, i) => (
                <li key={i} className="py-3">
                  <p className="text-[15px] font-semibold text-foreground">{h.title}</p>
                  <p className="line-clamp-2 text-[13px] text-muted-foreground">{h.body}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {formatDateHN(h.created_at)} · {h.count} {h.count === 1 ? "person" : "people"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/*
        The count is the only review an announcement gets, so it is said again
        here — this is the one action in the panel that reaches every customer
        at once and cannot be taken back.
      */}
      <AlertDialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Megaphone className="mr-2 inline h-5 w-5 text-primary" />
              Send to {recipients.length} {recipients.length === 1 ? "person" : "people"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{title || "—"}</strong>
              {body && <span className="mt-1 block">{body}</span>}
              <span className="mt-2 block">
                {AUDIENCE_LABEL[audience]}
                {audience === "provider" && providers.find((p) => p.id === providerId)
                  ? ` — ${providers.find((p) => p.id === providerId)!.name}`
                  : ""}
                . This cannot be unsent.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default Announcements;
