import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Waves } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface BeachPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_per_person_cents: number;
  provider_price_per_person_cents: number;
  extra_per_person_cents: number;
  amenities: string[];
  featured: boolean;
  is_active: boolean;
  sort_order: number;
}

const blankForm = {
  name: "",
  tagline: "",
  providerPriceDollars: 0,
  extraDollars: 0,
  amenities: "",   // newline-separated in the form
  featured: false,
  is_active: true,
  sort_order: 0,
};

export default function BeachClubPlans({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BeachPlan | null>(null);
  const [form, setForm] = useState(blankForm);
  const [deleteTarget, setDeleteTarget] = useState<BeachPlan | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-beach-club-plans"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BeachPlan[];
    },
  });

  const plansPager = usePagination(plans, 20);

  const openCreate = () => { setEditing(null); setForm(blankForm); setOpen(true); };
  const openEdit = (p: BeachPlan) => {
    setEditing(p);
    setForm({
      name: p.name,
      tagline: p.tagline ?? "",
      providerPriceDollars: (p.provider_price_per_person_cents ?? 0) / 100,
      extraDollars: (p.extra_per_person_cents ?? 0) / 100,
      amenities: (p.amenities ?? []).join("\n"),
      featured: p.featured,
      is_active: p.is_active,
      sort_order: p.sort_order,
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const providerCents = Math.round((form.providerPriceDollars || 0) * 100);
      const extraCents = Math.round((form.extraDollars || 0) * 100);
      const payload = {
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        provider_price_per_person_cents: providerCents,
        extra_per_person_cents: extraCents,
        price_per_person_cents: providerCents + extraCents,
        amenities: form.amenities.split("\n").map((l) => l.trim()).filter(Boolean),
        featured: form.featured,
        is_active: form.is_active,
        sort_order: form.sort_order,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabaseDb.from("beach_club_plans").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from("beach_club_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Plan updated" : "Plan created");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-plans"] });
      qc.invalidateQueries({ queryKey: ["beach-club-plans-public"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("beach_club_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-plans"] });
      qc.invalidateQueries({ queryKey: ["beach-club-plans-public"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    if (embedded) return <PageLoader />;
    return <SuperAdminLayout title="Beach Club Plans"><PageLoader /></SuperAdminLayout>;
  }

  const body = (
    <>
      <div className="mb-space-4 flex justify-end">
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> New Plan</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--app-divider))]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price / person</TableHead>
              <TableHead>Amenities</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Waves className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No plans yet — create one.
                </TableCell>
              </TableRow>
            ) : plansPager.paged.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <p className="font-bold text-foreground">{p.name}</p>
                  {p.tagline && <p className="text-xs text-muted-foreground">{p.tagline}</p>}
                </TableCell>
                <TableCell className="font-mono">
                  {formatUSD(p.price_per_person_cents)} / mo
                  <span className="mt-0.5 block text-xs font-sans text-muted-foreground">
                    {formatUSD(p.provider_price_per_person_cents ?? 0)} provider + {formatUSD(p.extra_per_person_cents ?? 0)} extra
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{(p.amenities ?? []).length} items</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.featured && <Badge className="bg-cyan-500/15 text-cyan-400">Featured</Badge>}
                    <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Hidden"}</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="iconSm" variant="ghost" className="rounded-full" title="Edit" onClick={() => openEdit(p)}>
                      <Pencil />
                    </Button>
                    <Button size="iconSm" variant="ghost" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete" onClick={() => setDeleteTarget(p)}>
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination {...plansPager} onPage={plansPager.setPage} />
      </div>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Plan" : "New Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Beach Club Membership" />
            </div>
            <div>
              <Label>Tagline</Label>
              <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="Full access to Beach Club amenities…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider price / person (USD, monthly)</Label>
                <Input type="number" min={0} step={1} value={form.providerPriceDollars}
                  onChange={(e) => setForm((f) => ({ ...f, providerPriceDollars: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Our extra / person (USD, monthly)</Label>
                <Input type="number" min={0} step={1} value={form.extraDollars}
                  onChange={(e) => setForm((f) => ({ ...f, extraDollars: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--app-divider))] bg-muted/30 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Customer price / person (auto)</span>
              <span className="font-mono text-base font-bold text-foreground">
                {formatUSD(Math.round(((form.providerPriceDollars || 0) + (form.extraDollars || 0)) * 100))} / mo
              </span>
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
            </div>
            <div>
              <Label>Amenities (one per line)</Label>
              <Textarea rows={4} value={form.amenities}
                onChange={(e) => setForm((f) => ({ ...f, amenities: e.target.value }))}
                placeholder={"Gym access\nPools\nWater park\nSports courts"} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--app-divider))] px-4 py-3">
              <Label className="cursor-pointer">Featured (Most Popular)</Label>
              <Switch checked={form.featured} onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--app-divider))] px-4 py-3">
              <Label className="cursor-pointer">Active (visible to users)</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete plan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{deleteTarget?.name}" will be permanently removed from the public page.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return body;
  return (
    <SuperAdminLayout title="Beach Club Plans" subtitle="Membership tiers shown on the public Beach Club page">
      {body}
    </SuperAdminLayout>
  );
}
