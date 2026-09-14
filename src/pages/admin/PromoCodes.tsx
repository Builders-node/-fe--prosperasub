import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/patterns/StatusPill";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { adminApiMessage, isNotDeployed } from "@/lib/admin/apiError";
import { formatUSD } from "@/lib/pricing";
import { formatDateHN } from "@/lib/timezone";

/**
 * Promo codes.
 *
 * Everything here goes through the API, and that is the feature rather than an
 * inconvenience: the table is service-role only because this panel writes from
 * the browser with the public anon key, and a promo table the browser could
 * write is a hundred percent off for anybody who reads the bundle.
 *
 * The customer-facing half needs none of this. `promo_quote` answers what a
 * code is worth and a database trigger re-checks the answer when the order is
 * written, so a page that lies about its discount is refused by Postgres, not
 * by anything on this screen.
 */

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  kind: "percent" | "fixed";
  percent_off: number | null;
  amount_off_cents: number | null;
  provider_id: string | null;
  min_order_cents: number;
  max_redemptions: number | null;
  per_customer_limit: number;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  created_at: string;
  redemptions: number;
  given_away_cents: number;
}

const valueOf = (p: PromoRow) =>
  p.kind === "percent" ? `${p.percent_off}% off` : `${formatUSD(p.amount_off_cents ?? 0)} off`;

const PromoCodes = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: providers = [] } = useQuery({
    queryKey: ["promo-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("id,name").eq("status", "active").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const providerName = useMemo(() => new Map(providers.map((p) => [p.id, p.name])), [providers]);

  const KEY = ["admin-promo-codes"] as const;
  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error: e } = await adminApi("/admin/promo-codes");
      if (e) throw e;
      return (data ?? []) as PromoRow[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ row, status }: { row: PromoRow; status: string }) => {
      const { error: e } = await adminApi(`/admin/promo-codes/${row.id}`, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      if (e) throw e;
    },
    onSuccess: () => { toast.success("Saved"); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(adminApiMessage(e, "Could not save")),
  });

  const remove = useMutation({
    mutationFn: async (row: PromoRow) => {
      const { error: e } = await adminApi(`/admin/promo-codes/${row.id}`, { method: "DELETE" });
      if (e) throw e;
    },
    onSuccess: () => { toast.success("Deleted"); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(adminApiMessage(e, "Could not delete")),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.code, r.description, providerName.get(r.provider_id ?? "")]
        .some((v) => (v ?? "").toLowerCase().includes(needle)));
  }, [rows, search, providerName]);

  return (
    <SuperAdminLayout title="Promo codes" subtitle="Discounts the platform pays for, not the business">
      <AdminListShell
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search the code or what it is for"
        isLoading={isLoading}
        isError={isError}
        error={isError && isNotDeployed(error)
          ? new Error("Promo codes need the server updating before they can be listed or created.")
          : error}
        onRetry={() => void refetch()}
        isEmpty={rows.length === 0}
        isNoResults={rows.length > 0 && filtered.length === 0}
        onClearFilters={search ? () => setSearch("") : undefined}
        count={filtered.length}
        emptyTitle="No promo codes"
        emptySubtitle="A code takes money off the platform's side, never the business's."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New code
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4 py-3">Code</TableHead>
              <TableHead className="px-4 py-3">Takes off</TableHead>
              <TableHead className="px-4 py-3">Where</TableHead>
              <TableHead className="px-4 py-3">Used</TableHead>
              <TableHead className="px-4 py-3 text-right">Given away</TableHead>
              <TableHead className="px-4 py-3">Until</TableHead>
              <TableHead className="px-4 py-3">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="px-4 py-3">
                  <p className="font-mono font-bold tracking-[0.1em] text-foreground">{p.code}</p>
                  {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {valueOf(p)}
                  {p.min_order_cents > 0 && (
                    <p className="text-xs text-muted-foreground">from {formatUSD(p.min_order_cents)}</p>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {p.provider_id ? providerName.get(p.provider_id) ?? "—" : "Anywhere"}
                </TableCell>
                <TableCell className="px-4 py-3 tabular-nums">
                  {p.redemptions}{p.max_redemptions ? ` / ${p.max_redemptions}` : ""}
                </TableCell>
                <TableCell className="px-4 py-3 text-right tabular-nums">
                  {formatUSD(p.given_away_cents)}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {p.ends_at ? formatDateHN(p.ends_at) : "—"}
                </TableCell>
                <TableCell className="px-4 py-3"><StatusPill status={p.status} /></TableCell>
                <TableCell className="px-4 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Row actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setStatus.mutate({ row: p, status: p.status === "active" ? "inactive" : "active" })}
                      >
                        <Power className="mr-2 h-3.5 w-3.5" />
                        {p.status === "active" ? "Switch off" : "Switch on"}
                      </DropdownMenuItem>
                      {/* A used code explains why an order cost what it cost;
                          only an unused one can be removed. */}
                      {p.redemptions === 0 && (
                        <DropdownMenuItem
                          onSelect={() => remove.mutate(p)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminListShell>

      <NewCodeSheet
        open={creating}
        providers={providers}
        onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); void qc.invalidateQueries({ queryKey: KEY }); }}
      />
    </SuperAdminLayout>
  );
};

function NewCodeSheet({ open, providers, onClose, onCreated }: {
  open: boolean;
  providers: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("10");
  const [providerId, setProviderId] = useState("any");
  const [minOrder, setMinOrder] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perCustomer, setPerCustomer] = useState("1");
  const [endsAt, setEndsAt] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi("/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify({
          code,
          description,
          kind,
          percent_off: kind === "percent" ? Number(value) : undefined,
          amount_off_cents: kind === "fixed" ? Math.round(Number(value) * 100) : undefined,
          provider_id: providerId === "any" ? null : providerId,
          min_order_cents: minOrder ? Math.round(Number(minOrder) * 100) : 0,
          max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
          per_customer_limit: Number(perCustomer),
          ends_at: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${code.toUpperCase()} created`);
      setCode(""); setDescription(""); setValue("10"); setMinOrder("");
      setMaxRedemptions(""); setEndsAt("");
      onCreated();
    },
    onError: (e) => toast.error(adminApiMessage(e, "Could not create the code")),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New promo code</SheetTitle>
          <SheetDescription>
            The platform pays for this out of its commission — the business is
            still paid the full price.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="p-code">Code</Label>
            <Input
              id="p-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="VILLAGE20"
              className="font-mono tracking-[0.12em]"
              maxLength={24}
            />
            <p className="mt-1 text-[12px] text-muted-foreground">
              Letters and digits only — it gets read aloud and typed by hand.
            </p>
          </div>

          <div>
            <Label htmlFor="p-desc">What it is for</Label>
            <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                   placeholder="Opening week" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="p-value">{kind === "percent" ? "Percent off" : "Dollars off"}</Label>
              <Input id="p-value" type="number" min="1" value={value}
                     onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Where it works</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any business</SelectItem>
                {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-min">Minimum order ($)</Label>
              <Input id="p-min" type="number" step="0.01" value={minOrder}
                     onChange={(e) => setMinOrder(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label htmlFor="p-max">Total uses</Label>
              <Input id="p-max" type="number" min="1" value={maxRedemptions}
                     onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="unlimited" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-per">Per customer</Label>
              <Input id="p-per" type="number" min="0" value={perCustomer}
                     onChange={(e) => setPerCustomer(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-ends">Last day</Label>
              <Input id="p-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <p className="rounded-radius-md bg-inset p-3 text-[12px] text-muted-foreground">
            The value and where it works cannot be changed later — somebody may
            already have been given the code. To stop one, switch it off.
          </p>
        </div>

        <SheetFooter className="mt-6">
          <Button
            className="w-full"
            onClick={() => create.mutate()}
            disabled={create.isPending || code.length < 3 || !(Number(value) > 0)}
            loading={create.isPending}
            loadingText="Creating…"
          >
            Create
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default PromoCodes;
