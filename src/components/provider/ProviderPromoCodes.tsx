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
import { tr } from "@/lib/tr";

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
    onError: (e: Error) => toast.error(e.message || tr("Could not update the code")),
  });

  // A manager gets 403 here — the section simply isn't theirs.
  if (isError) return null;

  return (
    <div className="space-y-1">
      <WorkspaceSection
        title={tr("Promo codes")}
        subtitle={tr("Discounts on your plans only. The discount comes off what you earn.")}
        action={
          <Button size="sm" variant="secondary" className="gap-2" onClick={() => setCreating(true)}>
            <Plus />{" "}{tr("New code")}</Button>
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
                  {c.kind === "percent" ? tr("{percent_off}% off", { percent_off: c.percent_off }) : `${formatUSD(c.amount_off_cents ?? 0)} off`}
                  {c.max_redemptions ? tr(" · up to {max_redemptions} uses", { max_redemptions: c.max_redemptions }) : ""}
                  {c.ends_at ? tr(" · until {ends_at}", { ends_at: formatDateHN(c.ends_at) }) : ""}
                  {c.description ? ` · ${c.description}` : ""}
                </span>
              </span>
              <Switch checked={c.status === "active"} onCheckedChange={() => toggle.mutate(c)} aria-label={(c.status === "active" ? tr("Turn {code} off", { code: c.code }) : tr("Turn {code} on", { code: c.code }))} />
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
    onSuccess: () => { toast.success(tr("{toUpperCase} is live", { toUpperCase: code.trim().toUpperCase() })); onCreated(); onClose(); },
    onError: (e: Error) => toast.error(e.message || tr("Could not create the code")),
  });
  const valid = /^[A-Za-z0-9_-]{3,24}$/.test(code.trim()) && Number(value) > 0;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr("New promo code")}
      description={tr("Customers type it at checkout. It works on your plans only.")}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>{tr("Cancel")}</Button>
          <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>{tr("Create code")}</Button>
        </div>
      }
    >
      <Input label={tr("Code")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder={tr("SUMMER10")} maxLength={24} />
      <div className="space-y-1.5">
        <p className="text-body font-medium text-foreground">{tr("Discount")}</p>
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
        <Input label={tr("Ends (optional)")} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} inputSize="sm" />
        <Input label={tr("Max uses (optional)")} type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputSize="sm" />
      </div>
      <Input label={tr("Note (optional)")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tr("For Instagram followers")} maxLength={200} />
    </ResponsiveDialog>
  );
}
