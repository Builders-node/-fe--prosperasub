import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { UserPicker } from "@/components/patterns/UserPicker";
import { CAPABILITIES, type CapabilityKey } from "@/components/provider/capabilities";
import { OwnerInviteButton } from "@/components/provider/OwnerInviteButton";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";
import { Button } from "@/components/ui/button";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { accountApi, adminApi, supabaseDb } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { cn } from "@/lib/utils";

/**
 * The admin's setup of a business — what it is filed under, who owns it, which
 * calendar it writes to — on the business itself.
 *
 * These lived in an Edit sheet on the Businesses LIST, while the profile and
 * the status lived in the workspace: one business, two edit surfaces, the owner
 * settable in both. The list sheet is gone; name, contacts and photos are the
 * profile editor's, status is GoLivePanel's, and this is the rest.
 */
export function ProviderSetupButton({ provider }: { provider: UniversalProviderRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <Settings2 /> Setup
      </Button>
      {open && <SetupDialog provider={provider} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function SetupDialog({ provider, open, onOpenChange }: {
  provider: UniversalProviderRow; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const { archetypes } = useServiceArchetypes(false);
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-service-categories-active"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("service_categories")
        .select("key, label, archetype_key").eq("is_active", true).order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string; archetype_key: string }>;
    },
    staleTime: 60_000,
  });

  const [archetypeKey, setArchetypeKey] = useState(provider.archetype_key ?? "__none");
  const [categoryKey, setCategoryKey] = useState(provider.category_key ?? "__none");
  const [caps, setCaps] = useState<Set<string>>(new Set(provider.capabilities ?? []));
  const [ownerUserId, setOwnerUserId] = useState<string | null>(provider.admin_user_id ?? null);
  const calendarId = provider.google_calendar_id ?? "";

  const scoped = archetypeKey === "__none" ? [] : categories.filter((c) => c.archetype_key === archetypeKey);
  const categoryValue = scoped.some((c) => c.key === categoryKey) ? categoryKey : (scoped[0]?.key ?? "__none");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
    void qc.invalidateQueries({ queryKey: ["admin-marketplace-providers"] });
    void qc.invalidateQueries({ queryKey: ["marketplace-providers"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const nextArchetype = archetypeKey === "__none" ? null : archetypeKey;
      const nextCategory = categoryValue === "__none" ? null : categoryValue;
      const patch: Record<string, unknown> = { capabilities: Array.from(caps) };
      if (nextArchetype !== (provider.archetype_key ?? null)) patch.archetype_key = nextArchetype;
      if (nextCategory !== (provider.category_key ?? null)) patch.category_key = nextCategory;
      const { error } = await supabaseDb.from("providers").update(patch).eq("id", provider.id);
      if (error) throw error;
      // Ownership decides who may withdraw — only the API writes it.
      if ((ownerUserId ?? null) !== (provider.admin_user_id ?? null)) {
        const { error: ownErr } = await accountApi(`/account/providers/${provider.id}/owner`, {
          method: "PUT", body: JSON.stringify({ userId: ownerUserId ?? null }),
        });
        if (ownErr) throw ownErr;
      }
      if (userData?.id) await logAuditEvent(userData.id, "edit", "provider", provider.id, { ...patch, owner: ownerUserId });
    },
    onSuccess: () => { toast.success("Saved"); refresh(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  const provision = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/providers/${provider.id}/calendar/provision`, { method: "POST" });
      if (error) throw error;
      return data as { calendarId?: string | null; skipped?: string } | null;
    },
    onSuccess: (r) => {
      refresh();
      if (r?.calendarId) toast.success("Calendar provisioned");
      else toast.warning(r?.skipped || "No calendar was created — check the Google credentials.");
    },
    onError: (e: Error) => toast.error(e.message || "Could not provision a calendar"),
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Setup"
      description={`${provider.name} — where it's filed, who owns it, where its bookings go.`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </div>
      }
    >
      <DialogBlock title="Filed under">
        <div className="space-y-1.5">
          <Label>Service</Label>
          <Select value={archetypeKey} onValueChange={setArchetypeKey}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— none —</SelectItem>
              {archetypes.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={categoryValue} onValueChange={setCategoryKey} disabled={scoped.length === 0}>
            <SelectTrigger><SelectValue placeholder={archetypeKey === "__none" ? "Pick a service first" : "—"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— none —</SelectItem>
              {scoped.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {archetypeKey !== "__none" && scoped.length === 0 && (
            <p className="text-meta text-muted-foreground">No categories under this service yet — add one in Settings → Services.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Extras</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CAPABILITIES) as CapabilityKey[]).map((cap) => {
              const on = caps.has(cap);
              const meta = CAPABILITIES[cap];
              const I = meta.icon;
              return (
                <button key={cap} type="button" aria-pressed={on} title={meta.description}
                  onClick={() => setCaps((prev) => { const n = new Set(prev); if (n.has(cap)) n.delete(cap); else n.add(cap); return n; })}
                  className={cn("inline-flex h-10 items-center gap-2 rounded-full px-4 text-body transition-colors",
                    on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
                  <I className="h-4 w-4" /> {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-meta text-muted-foreground">Delivery adds the delivery details block to its public page.</p>
        </div>
      </DialogBlock>

      <DialogBlock title="Owner">
        <UserPicker
          value={ownerUserId ?? ""}
          onSelect={(u) => setOwnerUserId(u?.id ?? null)}
          placeholder="Nobody — platform-run"
          allowClear
          clearLabel="Nobody — platform-run"
        />
        <p className="text-meta text-muted-foreground">
          Pick someone who already has an account, or send a link and let them accept it.
        </p>
        <OwnerInviteButton provider={provider} />
      </DialogBlock>

      <DialogBlock title="Google Calendar">
        <div className="flex items-center gap-2">
          <Input value={calendarId} readOnly placeholder="Not provisioned yet" className="font-mono" inputSize="sm" />
          <Button size="sm" variant="secondary" className="shrink-0" loading={provision.isPending} onClick={() => provision.mutate()}>
            {calendarId ? "Repair" : "Provision"}
          </Button>
        </div>
        <p className="text-meta text-muted-foreground">
          The platform creates the calendar and shares it with the contact email. The button is safe to press again — it is also the repair.
        </p>
      </DialogBlock>
    </ResponsiveDialog>
  );
}
