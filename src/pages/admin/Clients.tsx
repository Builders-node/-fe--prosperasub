import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2, Plus, Pencil, Archive, ArchiveRestore, Mail, MapPin, User,
} from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { CustomerPhone } from "@/components/patterns/CustomerPhone";
import { StatusPill } from "@/components/patterns/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Clients — the businesses and households the platform bills, as opposed to the
 * individual accounts in Users.
 *
 * There was no way to create or edit one. Every reference to `cleaning_clients`
 * in the app was a read; the two rows in production were created as a
 * side-effect of checkout, and their contact details — email, phone, apartment,
 * invoicing notes — could only be changed in the database. `/admin/clients` was
 * a redirect to `/admin/users`, which is a different thing entirely.
 *
 * The table is still called `cleaning_clients` because renaming it would mean
 * re-pointing 84 live rows and every RLS policy for a cosmetic gain. It is not
 * cleaning-specific in meaning, and the other services will hang off the same
 * rows as their `client_id` columns are added.
 */

const CLIENT_TYPES = [
  { value: "regular_cleaning_client", label: "Regular client" },
  { value: "company", label: "Company" },
  { value: "resident", label: "Resident" },
  { value: "one_off", label: "One-off" },
] as const;

const VISIBILITIES = [
  { value: "admin_only", label: "Admin only" },
  { value: "provider", label: "Visible to provider" },
  { value: "public", label: "Public" },
] as const;

interface ClientRow {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  location: string;
  apartment_unit: string | null;
  client_type: string;
  status: string;
  visibility: string;
  is_private: boolean;
  notes: string | null;
  internal_admin_notes: string | null;
  invoice_preferences: string | null;
  start_date: string | null;
  user_id: string | null;
  deleted_at: string | null;
  created_at: string;
}

/** A blank client, with every NOT NULL column already satisfied. */
const emptyDraft = (): Partial<ClientRow> => ({
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  location: "",
  apartment_unit: "",
  client_type: "regular_cleaning_client",
  status: "active",
  visibility: "admin_only",
  is_private: false,
  notes: "",
  internal_admin_notes: "",
  invoice_preferences: "",
});

const AdminClients = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Partial<ClientRow> | null>(null);

  const { data: clients = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_clients")
        .select("*")
        .order("company_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  /**
   * What each client actually has. Counted here rather than on a detail page so
   * an admin can see at a glance who is worth opening — and so archiving a
   * client with live subscriptions is an obviously bad idea rather than a
   * silent one.
   */
  const { data: usage = {} } = useQuery({
    queryKey: ["admin-clients-usage"],
    queryFn: async () => {
      const [subs, bookings, assignments] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions")
          .select("client_id,subscription_status,total_price_cents").not("client_id", "is", null),
        supabaseDb.from("cleaning_bookings").select("client_id,status").not("client_id", "is", null),
        supabaseDb.from("cleaning_plan_client_assignments").select("client_id"),
      ]);
      const map: Record<string, { subs: number; activeSubs: number; bookings: number; plans: number; valueCents: number }> = {};
      const bucket = (id: string) =>
        (map[id] ??= { subs: 0, activeSubs: 0, bookings: 0, plans: 0, valueCents: 0 });
      (subs.data ?? []).forEach((r: any) => {
        const b = bucket(String(r.client_id));
        b.subs += 1;
        if (r.subscription_status === "active") b.activeSubs += 1;
        b.valueCents += Number(r.total_price_cents) || 0;
      });
      (bookings.data ?? []).forEach((r: any) => {
        if (r.status !== "cancelled") bucket(String(r.client_id)).bookings += 1;
      });
      (assignments.data ?? []).forEach((r: any) => bucket(String(r.client_id)).plans += 1);
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async (d: Partial<ClientRow>) => {
      const payload = {
        company_name: (d.company_name ?? "").trim(),
        contact_person: d.contact_person?.trim() || null,
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        location: (d.location ?? "").trim(),
        apartment_unit: d.apartment_unit?.trim() || null,
        client_type: d.client_type ?? "regular_cleaning_client",
        status: d.status ?? "active",
        visibility: d.visibility ?? "admin_only",
        is_private: !!d.is_private,
        notes: d.notes?.trim() || null,
        internal_admin_notes: d.internal_admin_notes?.trim() || null,
        invoice_preferences: d.invoice_preferences?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (!payload.company_name) throw new Error("Name is required");
      // location is NOT NULL in the table, and an insert without it fails with a
      // constraint error the admin can't act on.
      if (!payload.location) throw new Error("Location is required");

      if (d.id) {
        const { error } = await supabaseDb.from("cleaning_clients").update(payload).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb.from("cleaning_clients").insert(payload);
        if (error) throw error;
      }
      if (userData?.id) {
        await logAuditEvent(userData.id, d.id ? "edit" : "create", "cleaning_client", d.id ?? null, payload);
      }
    },
    onSuccess: () => {
      toast.success(draft?.id ? "Client saved" : "Client created");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["admin-clients-usage"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  /**
   * Archive rather than delete: `cleaning_bookings.client_id` is ON DELETE SET
   * NULL, so a real delete would orphan every visit this client ever had.
   */
  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabaseDb
        .from("cleaning_clients")
        .update({ deleted_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      if (userData?.id) {
        await logAuditEvent(userData.id, archived ? "archive" : "restore", "cleaning_client", id, {});
      }
    },
    onSuccess: () => {
      toast.success("Client updated");
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (!showArchived && c.deleted_at) return false;
      if (!q) return true;
      return [c.company_name, c.contact_person, c.email, c.phone, c.location, c.apartment_unit]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [clients, search, showArchived]);

  const pager = usePagination(visible, 25);
  const archivedCount = clients.filter((c) => c.deleted_at).length;

  return (
    <SuperAdminLayout
      title="Clients"
      subtitle="Businesses and households you bill — separate from individual user accounts"
    >
      <AdminListShell
        search={search} onSearch={setSearch}
        searchPlaceholder="Search by name, contact, email, location…"
        filters={archivedCount > 0 ? (
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </Button>
        ) : undefined}
        actions={
          <Button className="gap-2 rounded-full" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" /> New client
          </Button>
        }
        isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
        isEmpty={clients.length === 0}
        isNoResults={clients.length > 0 && visible.length === 0}
        count={visible.length}
        emptyTitle="No clients yet"
        emptySubtitle="Create one to attach plans, subscriptions and visits to it."
        onClearFilters={() => { setSearch(""); setShowArchived(false); }}
      >
        <div className="space-y-2">
          {pager.paged.map((c) => {
            const u = usage[c.id];
            return (
              <div
                key={c.id}
                className={cn("rounded-radius-md bg-card p-4", c.deleted_at && "opacity-60")}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-foreground">{c.company_name}</p>
                      <StatusPill status={c.deleted_at ? "cancelled" : c.status}
                        label={c.deleted_at ? "Archived" : undefined} />
                      <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {CLIENT_TYPES.find((t) => t.value === c.client_type)?.label ?? c.client_type}
                      </span>
                    </div>

                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {c.contact_person && (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />{c.contact_person}
                        </span>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                          <Mail className="h-3 w-3" />{c.email}
                        </a>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {c.location}{c.apartment_unit ? ` · ${c.apartment_unit}` : ""}
                      </span>
                    </p>
                    {c.phone && <CustomerPhone phone={c.phone} className="mt-1" />}

                    {/* What's attached. A client with live subscriptions should
                        never be archived by accident. */}
                    <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span><strong className="text-foreground/80">{u?.activeSubs ?? 0}</strong> active subs</span>
                      <span><strong className="text-foreground/80">{u?.plans ?? 0}</strong> plans assigned</span>
                      <span><strong className="text-foreground/80">{u?.bookings ?? 0}</strong> visits</span>
                      {!!u?.valueCents && (
                        <span><strong className="text-foreground/80">{formatUSD(u.valueCents)}</strong> lifetime</span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDraft(c)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className={cn(!c.deleted_at && "text-destructive hover:text-destructive")}
                      disabled={setArchived.isPending}
                      onClick={() => setArchived.mutate({ id: c.id, archived: !c.deleted_at })}
                    >
                      {c.deleted_at
                        ? <><ArchiveRestore className="h-3.5 w-3.5" /> Restore</>
                        : <><Archive className="h-3.5 w-3.5" /> Archive</>}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <TablePagination {...pager} onPage={pager.setPage} />
      </AdminListShell>

      <Sheet open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{draft?.id ? "Edit client" : "New client"}</SheetTitle>
            <SheetDescription>
              {draft?.id
                ? "Changes apply everywhere this client appears — subscriptions, visits and plan assignments."
                : "Plans, subscriptions and visits can be attached to this client once it exists."}
            </SheetDescription>
          </SheetHeader>

          {draft && (
            <div className="mt-6 space-y-4">
              <div>
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  value={draft.company_name ?? ""}
                  onChange={(e) => setDraft({ ...draft, company_name: e.target.value })}
                  placeholder="Infinita City"
                />
              </div>
              <div>
                <Label>Contact person</Label>
                <Input
                  value={draft.contact_person ?? ""}
                  onChange={(e) => setDraft({ ...draft, contact_person: e.target.value })}
                  placeholder="Kara Isabella"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email" value={draft.email ?? ""}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    type="tel" value={draft.phone ?? ""}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    placeholder="+504 1234 5678"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Location <span className="text-destructive">*</span></Label>
                  <Input
                    value={draft.location ?? ""}
                    onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                    placeholder="Duna Tower"
                  />
                </div>
                <div>
                  <Label>Apartment / unit</Label>
                  <Input
                    value={draft.apartment_unit ?? ""}
                    onChange={(e) => setDraft({ ...draft, apartment_unit: e.target.value })}
                    placeholder="L1 Cowork"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={draft.client_type ?? "regular_cleaning_client"}
                    onValueChange={(v) => setDraft({ ...draft, client_type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={draft.status ?? "active"}
                    onValueChange={(v) => setDraft({ ...draft, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select
                  value={draft.visibility ?? "admin_only"}
                  onValueChange={(v) => setDraft({ ...draft, visibility: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITIES.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoicing notes</Label>
                <Input
                  value={draft.invoice_preferences ?? ""}
                  onChange={(e) => setDraft({ ...draft, invoice_preferences: e.target.value })}
                  placeholder="Monthly invoice, NET 15"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2} value={draft.notes ?? ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Access, contacts, anything the team should know"
                />
              </div>
              <div>
                <Label>Internal admin notes</Label>
                <Textarea
                  rows={2} value={draft.internal_admin_notes ?? ""}
                  onChange={(e) => setDraft({ ...draft, internal_admin_notes: e.target.value })}
                  placeholder="Not shown to providers"
                />
              </div>
            </div>
          )}

          <SheetFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              disabled={save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {draft?.id ? "Save" : "Create client"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </SuperAdminLayout>
  );
};

export default AdminClients;
