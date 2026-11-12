import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/patterns/Skeleton";
import { adminApi } from "@/integrations/supabase/client";
import { tagIcon, useTagDictionary, type TagGroup } from "@/lib/tags";
import { cn } from "@/lib/utils";

/**
 * Tags — the words a plan can be tagged with, in groups (lib/tags.ts,
 * Edge routes/tags.ts).
 *
 * Businesses pick from this list in their offer editor; the service listing
 * turns each group into a filter ("Level", "Good for", "Diet"); a card shows a
 * plan's first two; search matches them; a home collection can be "every plan
 * tagged X". A tag is switched off, never deleted — plans hold its key.
 */

async function call(path: string, method: string, body?: unknown) {
  const { error } = await adminApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (error) throw error;
}

export default function Tags() {
  const qc = useQueryClient();
  const dict = useTagDictionary();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["tag-dictionary"] }); };
  const run = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => call(path, method, body),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });
  const [groupName, setGroupName] = useState("");

  return (
    <SuperAdminLayout title="Tags" subtitle="The words businesses tag their plans with — and customers filter by">
      {!dict.isLoading && !dict.fromDb && (
        <p className="mb-4 rounded-radius-md bg-card p-4 text-body text-muted-foreground">
          This is the built-in list. Apply the database migration (20261120120000_catalog_tags) to edit it here.
        </p>
      )}

      {dict.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="space-y-3">
          {dict.all.map((g) => (
            <GroupCard key={g.key} group={g} editable={dict.fromDb} busy={run.isPending}
              onCall={(path, method, body) => run.mutate({ path, method, body })} />
          ))}
        </div>
      )}

      {dict.fromDb && (
        <form
          className="mt-4 flex items-end gap-2 rounded-radius-lg bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!groupName.trim()) return;
            run.mutate({ path: "/admin/tags/groups", method: "POST", body: { label: groupName.trim() } });
            setGroupName("");
          }}
        >
          <div className="min-w-0 flex-1">
            <Input inputSize="sm" label="New group" placeholder="e.g. Duration, Equipment" value={groupName}
              maxLength={40} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <Button size="sm" type="submit" disabled={!groupName.trim()}><Plus className="h-4 w-4" /> Add group</Button>
        </form>
      )}
    </SuperAdminLayout>
  );
}

function GroupCard({ group, editable, busy, onCall }: {
  group: TagGroup; editable: boolean; busy: boolean;
  onCall: (path: string, method: string, body?: unknown) => void;
}) {
  const [name, setName] = useState("");
  const rename = (path: string, current: string) => {
    const next = window.prompt("New name", current)?.trim();
    if (next && next !== current) onCall(path, "PATCH", { label: next });
  };

  return (
    <section className={cn("space-y-3 rounded-radius-lg bg-card p-4", !group.isActive && "opacity-60")}>
      <div className="flex items-center gap-2">
        <h2 className="text-title font-semibold text-foreground">{group.label}</h2>
        {editable && (
          <button type="button" aria-label={`Rename ${group.label}`} onClick={() => rename(`/admin/tags/groups/${group.key}`, group.label)}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <Pencil className="h-4 w-4" />
          </button>
        )}
        <span className="flex-1" />
        {editable && (
          <label className="flex items-center gap-2 text-meta text-muted-foreground">
            {group.isActive ? "Shown" : "Hidden"}
            <Switch checked={group.isActive} disabled={busy}
              onCheckedChange={(v) => onCall(`/admin/tags/groups/${group.key}`, "PATCH", { isActive: v })} />
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {group.tags.map((t) => {
          const Icon = tagIcon(t.key);
          return (
            <span key={t.key} className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full bg-muted pl-3 pr-1 text-[14px] font-semibold text-foreground",
              !t.isActive && "opacity-50 line-through",
            )}>
              {Icon && <Icon className="h-4 w-4" />}
              {t.label}
              {editable ? (
                <>
                  <button type="button" aria-label={`Rename ${t.label}`} onClick={() => rename(`/admin/tags/${t.key}`, t.label)}
                    className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-background">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <Switch className="mr-1 scale-75" checked={t.isActive} disabled={busy} aria-label={`${t.label} on or off`}
                    onCheckedChange={(v) => onCall(`/admin/tags/${t.key}`, "PATCH", { isActive: v })} />
                </>
              ) : <span className="w-2" />}
            </span>
          );
        })}
        {group.tags.length === 0 && <p className="text-meta text-muted-foreground">No tags in this group yet.</p>}
      </div>

      {editable && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCall("/admin/tags", "POST", { groupKey: group.key, label: name.trim() });
            setName("");
          }}
        >
          <Input inputSize="sm" placeholder={`Add to ${group.label}`} value={name} maxLength={40}
            onChange={(e) => setName(e.target.value)} aria-label={`New tag in ${group.label}`} />
          <Button size="sm" variant="secondary" type="submit" disabled={!name.trim()}>Add</Button>
        </form>
      )}
    </section>
  );
}
