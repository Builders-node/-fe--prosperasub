import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, PackagePlus, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { QueryError } from "@/components/QueryError";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAddons } from "@/hooks/useAddons";
import { formatUSD } from "@/lib/pricing";

/**
 * What a rental business sells besides the car itself: coverage, extras and
 * where it will deliver.
 *
 * These three tables existed and were wired into checkout from the start, but
 * nothing could edit them — they were seeded by hand, straight into the
 * database. That was survivable while the platform owned the only fleet and
 * became a wall the moment a second company could join: it would have had cars
 * it could list and no way to say what renting one actually includes.
 *
 * This replaces the plans editor for a rental business. A plan — a price for a
 * period, sold over and over — is not how a car is sold, and offering that
 * screen here only invited someone to create something nothing would ever read.
 */

type Kind = "insurance" | "extra" | "zone";

const TABLE: Record<Kind, string> = {
  insurance: "rental_insurance_tiers",
  extra: "rental_extras",
  zone: "rental_delivery_zones",
};

interface Draft {
  kind: Kind;
  id?: string;
  name: string;
  description: string;
  /** Insurance: per day. Extra: per day or flat. Zone: the delivery fee. */
  cents: number;
  /** Extras only. */
  priceType: "per_day" | "flat";
  /** Insurance: what the tier covers, one per line. Zone: the areas it covers. */
  lines: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY = (kind: Kind): Draft => ({
  kind, name: "", description: "", cents: 0, priceType: "per_day",
  lines: "", isActive: true, sortOrder: 0,
});

const dollars = (c: number) => (c / 100).toFixed(2);
const cents = (v: string) => Math.round(parseFloat(v || "0") * 100);

export function RentalTermsTab({ providerId, canManage }: {
  providerId: string;
  /** The team can read the terms; only the owner may change them. */
  canManage: boolean;
}) {
  const qc = useQueryClient();
  // Inactive rows included: the editor has to show what it can turn back on.
  const addonsQ = useAddons(providerId, { includeInactive: true });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["rental-addons"] });

  const save = async () => {
    if (!draft?.name.trim()) { toast.error("Name is required."); return; }
    setSaving(true);
    try {
      const row: Record<string, unknown> = {
        provider_id: providerId,
        name: draft.name.trim(),
        sort_order: draft.sortOrder,
        is_active: draft.isActive,
      };
      if (draft.kind === "insurance") {
        row.description = draft.description.trim() || null;
        row.price_per_day_cents = draft.cents;
        row.items = draft.lines.split("\n").map((l) => l.trim()).filter(Boolean);
      } else if (draft.kind === "extra") {
        row.description = draft.description.trim() || null;
        row.price_cents = draft.cents;
        row.price_type = draft.priceType;
      } else {
        row.areas = draft.lines.trim() || null;
        row.fee_cents = draft.cents;
      }

      const table = TABLE[draft.kind];
      const res = draft.id
        ? await supabaseDb.from(table).update(row).eq("id", draft.id)
        : await supabaseDb.from(table).insert(row);
      if (res.error) throw res.error;
      toast.success(draft.id ? "Saved" : "Added");
      refresh();
      setDraft(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (kind: Kind, id: string, next: boolean) => {
    const { error } = await supabaseDb.from(TABLE[kind]).update({ is_active: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Shown at checkout" : "Hidden from checkout");
    refresh();
  };

  if (addonsQ.isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (addonsQ.isError) {
    return (
      <QueryError
        title="Couldn't load the rental terms"
        error={addonsQ.error}
        onRetry={() => void addonsQ.refetch()}
      />
    );
  }

  const { insurance = [], extras = [], zones = [] } = addonsQ.data ?? {};

  return (
    <div className="space-y-5">
      <Section
        icon={ShieldCheck}
        title="Coverage"
        blurb="Charged per day. The first tier is preselected at checkout, so put the one most people should take first."
        canManage={canManage}
        onAdd={() => setDraft(EMPTY("insurance"))}
        rows={insurance.map((t) => ({
          id: t.id,
          isActive: t.is_active !== false,
          title: t.name,
          detail: `${formatUSD(t.price_per_day_cents)} / day`,
          onEdit: () => setDraft({
            kind: "insurance", id: t.id, name: t.name, description: t.description ?? "",
            cents: t.price_per_day_cents, priceType: "per_day",
            lines: (t.items ?? []).join("\n"), isActive: t.is_active !== false, sortOrder: t.sort_order,
          }),
          onToggle: (next: boolean) => void toggleActive("insurance", t.id, next),
        }))}
      />

      <Section
        icon={PackagePlus}
        title="Extras"
        blurb="A child seat, a second driver, a GPS. Priced per day or once per rental."
        canManage={canManage}
        onAdd={() => setDraft(EMPTY("extra"))}
        rows={extras.map((e) => ({
          id: e.id,
          isActive: e.is_active !== false,
          title: e.name,
          detail: `${formatUSD(e.price_cents)}${e.price_type === "per_day" ? " / day" : " once"}`,
          onEdit: () => setDraft({
            kind: "extra", id: e.id, name: e.name, description: e.description ?? "",
            cents: e.price_cents, priceType: e.price_type, lines: "",
            isActive: e.is_active !== false, sortOrder: e.sort_order,
          }),
          onToggle: (next: boolean) => void toggleActive("extra", e.id, next),
        }))}
      />

      <Section
        icon={MapPin}
        title="Delivery"
        blurb="Where you will bring the car, and what that costs. A zone with no fee reads as free delivery."
        canManage={canManage}
        onAdd={() => setDraft(EMPTY("zone"))}
        rows={zones.map((z) => ({
          id: z.id,
          isActive: z.is_active !== false,
          title: z.name,
          detail: z.fee_cents > 0 ? formatUSD(z.fee_cents) : "Free",
          onEdit: () => setDraft({
            kind: "zone", id: z.id, name: z.name, description: "",
            cents: z.fee_cents, priceType: "flat", lines: z.areas ?? "",
            isActive: z.is_active !== false, sortOrder: z.sort_order,
          }),
          onToggle: (next: boolean) => void toggleActive("zone", z.id, next),
        }))}
      />

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Edit" : "Add"}{" "}
              {draft?.kind === "insurance" ? "coverage" : draft?.kind === "extra" ? "extra" : "delivery zone"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    {draft.kind === "insurance" ? "Per day $"
                      : draft.kind === "zone" ? "Delivery fee $" : "Price $"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={dollars(draft.cents)}
                    onChange={(e) => setDraft({ ...draft, cents: cents(e.target.value) })}
                  />
                </div>
                {draft.kind === "extra" && (
                  <div>
                    <Label>Charged</Label>
                    <Select
                      value={draft.priceType}
                      onValueChange={(v) => setDraft({ ...draft, priceType: v as Draft["priceType"] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_day">Per day</SelectItem>
                        <SelectItem value="flat">Once per rental</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {draft.kind !== "extra" && (
                  <div>
                    <Label>Order</Label>
                    <Input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(e) => setDraft({ ...draft, sortOrder: parseInt(e.target.value || "0", 10) })}
                    />
                  </div>
                )}
              </div>

              {draft.kind !== "zone" && (
                <div>
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
              )}

              {draft.kind === "insurance" && (
                <div>
                  <Label>What it covers (one per line)</Label>
                  <Textarea
                    rows={4}
                    value={draft.lines}
                    onChange={(e) => setDraft({ ...draft, lines: e.target.value })}
                    placeholder={"Collision damage\nTheft\n$500 excess"}
                  />
                </div>
              )}

              {draft.kind === "zone" && (
                <div>
                  <Label>Areas covered</Label>
                  <Textarea
                    rows={2}
                    value={draft.lines}
                    onChange={(e) => setDraft({ ...draft, lines: e.target.value })}
                    placeholder="Duna, Pristine Bay, Roatán airport"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                />
                Offer this at checkout
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Spinner size="sm" className="mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface Row {
  id: string;
  isActive: boolean;
  title: string;
  detail: string;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
}

function Section({ icon: Icon, title, blurb, rows, canManage, onAdd }: {
  icon: typeof ShieldCheck;
  title: string;
  blurb: string;
  rows: Row[];
  canManage: boolean;
  onAdd: () => void;
}) {
  return (
    <section className="rounded-radius-md bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-foreground">
            <Icon className="h-4 w-4 text-muted-foreground" /> {title}
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">{blurb}</p>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" className="shrink-0 gap-1.5" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {canManage ? "Nothing set up yet — customers will not be offered this." : "Nothing set up yet."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[15px] font-semibold ${r.isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {r.title}
                </p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
              {canManage && (
                <>
                  <Button
                    size="sm"
                    variant={r.isActive ? "ghost" : "secondary"}
                    className="shrink-0"
                    onClick={() => r.onToggle(!r.isActive)}
                  >
                    {r.isActive ? "Offered" : "Hidden"}
                  </Button>
                  <Button size="sm" variant="secondary" className="shrink-0 gap-1.5" onClick={r.onEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
