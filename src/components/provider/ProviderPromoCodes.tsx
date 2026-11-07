import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, TicketPercent } from "lucide-react";
import { toast } from "sonner";

import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { accountApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * The business's own promo codes (Edge routes/provider-growth.ts).
 *
 * They were admin-only although every code can carry a `provider_id`. A code
 * made here is pinned to this business by the server, so it only ever
 * discounts its own plans — and the discount comes off what the business
 * earns, which the form says. Owner only.
 */
interface Code {
  id: string; code: string; description: string | null; kind: "percent" | "fixed";
  percent_off: number | null; amount_off_cents: number | null;
  max_redemptions: number | null; ends_at: string | null; status: "active" | "inactive";
}

export function ProviderPromoCodes({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const KEY = ["provider-promo-codes", providerId];
  const [creating, setCreating] = useState(false);

  const { data: codes = [], isError } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/promo-codes`);
      if (error) throw error;
      return (data ?? []) as Code[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (c: Code) => {
      const { error } = await accountApi(`/account/providers/${providerId}/promo-codes/${c.id}`, {
        method: "PATCH", body: JSON.stringify({ status: c.status === "active" ? "inactive" : "active" }),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.error(e.message || "Could not update the code"),
  });

  // A manager gets 403 here — the section simply isn't theirs.
  if (isError) return null;

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title="Promo codes"
        subtitle="Discounts on your plans only. The discount comes off what you earn."
        action={
          <Button size="sm" variant="secondary" className="gap-2" onClick={() => setCreating(true)}>
            <Plus /> New code
          </Button>
        }
      />
      {codes.length > 0 && (
        <div className="space-y-0.5 rounded-radius-lg bg-card p-1.5">
          {codes.map((c) => (
            <div key={c.id} className={cn("flex items-center gap-3 rounded-radius-md p-3", c.status !== "active" && "opacity-60")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-inset">
                <TicketPercent className="h-5 w-5 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-title font-semibold text-foreground">{c.code}</span>
                <span className="block truncate text-meta text-muted-foreground">
                  {c.kind === "percent" ? `${c.percent_off}% off` : `${formatUSD(c.amount_off_cents ?? 0)} off`}
                  {c.max_redemptions ? ` · up to ${c.max_redemptions} uses` : ""}
                  {c.ends_at ? ` · until ${formatDateHN(c.ends_at)}` : ""}
                  {c.description ? ` · ${c.description}` : ""}
                </span>
              </span>
              <Switch checked={c.status === "active"} onCheckedChange={() => toggle.mutate(c)} aria-label={`Turn ${c.code} ${c.status === "active" ? "off" : "on"}`} />
            </div>
          ))}
        </div>
      )}
      {creating && <CreateCodeDialog providerId={providerId} onClose={() => setCreating(false)} onCreated={() => void qc.invalidateQueries({ queryKey: KEY })} />}
    </div>
  );
}

function CreateCodeDialog({ providerId, onClose, onCreated }: { providerId: string; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [endsAt, setEndsAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi(`/account/providers/${providerId}/promo-codes`, {
        method: "POST",
        body: JSON.stringify({
          code: code.trim(), kind, value: Number(value), endsAt: endsAt || null,
          maxRedemptions: maxUses ? Number(maxUses) : null, description: description.trim() || null,
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${code.trim().toUpperCase()} is live`); onCreated(); onClose(); },
    onError: (e: Error) => toast.error(e.message || "Could not create the code"),
  });
  const valid = /^[A-Za-z0-9_-]{3,24}$/.test(code.trim()) && Number(value) > 0;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New promo code"
      description="Customers type it at checkout. It works on your plans only."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Create code</Button>
        </div>
      }
    >
      <Input label="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="SUMMER10" maxLength={24} />
      <div className="space-y-1.5">
        <p className="text-body font-medium text-foreground">Discount</p>
        <div className="flex items-end gap-2">
          <div className="flex shrink-0 rounded-full bg-inset p-1">
            {(["percent", "fixed"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn("h-8 rounded-full px-3 text-body font-semibold", kind === k ? "bg-foreground text-background" : "text-muted-foreground")}>
                {k === "percent" ? "%" : "$"}
              </button>
            ))}
          </div>
          <Input type="number" inputMode="decimal" min={1} value={value} onChange={(e) => setValue(e.target.value)} wrapperClassName="min-w-0 flex-1" inputSize="sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Ends (optional)" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} inputSize="sm" />
        <Input label="Max uses (optional)" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputSize="sm" />
      </div>
      <Input label="Note (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="For Instagram followers" maxLength={200} />
    </ResponsiveDialog>
  );
}
