import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Archive, CheckCircle2, Mail, MapPin, Pencil, Phone, Search, Users } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const normalize = (value?: string | null) => String(value || "").trim().toLowerCase();
const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return format(new Date(`${value.slice(0, 10)}T00:00:00`), "MMM d, yyyy");
};

const getClientType = (client: any, hasPublicSubscription: boolean) => {
  const isPrivate = Boolean(client.is_private) || client.client_type === "custom_cleaning_client";
  if (isPrivate && hasPublicSubscription) return "Both";
  if (isPrivate) return "Private";
  return "Regular";
};

const getDisplayName = (user: any) => user?.display_name || user?.name || user?.email || "Regular client";

const emptyEditClient = {
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  location: "",
  notes: "",
  internal_admin_notes: "",
  invoice_preferences: "",
  status: "active",
  client_type: "regular_cleaning_client",
  visibility: "admin_only",
  is_private: false,
};

const toClientPayload = (client: any) => ({
  company_name: client.company_name?.trim() || "",
  contact_person: client.contact_person?.trim() || "",
  email: client.email?.trim() || "",
  phone: client.phone?.trim() || "",
  location: client.location?.trim() || "",
  notes: client.notes || "",
  internal_admin_notes: client.internal_admin_notes || "",
  invoice_preferences: client.invoice_preferences || "",
  status: client.status || "active",
  client_type: client.client_type || "regular_cleaning_client",
  visibility: "admin_only",
  is_private: Boolean(client.is_private),
  user_id: client.user_id || null,
});

const Clients = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [editClient, setEditClient] = useState<any | null>(null);
  const isEditDrawerOpen = Boolean(editClient);

  const invalidateClients = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    queryClient.invalidateQueries({ queryKey: ["admin-cleaning-custom-plans"] });
    queryClient.invalidateQueries({ queryKey: ["admin-cleaning-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["admin-cleaning-schedules"] });
  };

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cleaning_clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customPlans = [] } = useQuery({
    queryKey: ["admin-cleaning-custom-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cleaning_custom_plans").select("*, cleaning_clients(*)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-cleaning-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(id, date, start_time, end_time), users(display_name, email, name), cleaning_clients(*), cleaning_custom_plans(*)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["admin-cleaning-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cleaning_recurring_schedules").select("*, cleaning_clients(*), cleaning_custom_plans(*)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ["admin-cleaning-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .select("*, cleaning_packages(name), users(display_name, email, name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientRows = useMemo(() => {
    const storedClients = clients.map((client: any) => {
      const matchingPublicSubs = subscriptions.filter((subscription: any) => {
        const email = normalize(subscription.users?.email);
        return email && email === normalize(client.email);
      });
      const clientPlans = customPlans.filter((plan: any) => plan.client_id === client.id);
      const clientBookings = bookings.filter((booking: any) => booking.client_id === client.id);
      const activePlansCount =
        clientPlans.filter((plan: any) => plan.status !== "archived" && plan.status !== "cancelled").length +
        matchingPublicSubs.filter((subscription: any) => subscription.is_active).length;
      const lastBooking = [...clientBookings].sort((a: any, b: any) =>
        String(b.cleaning_available_slots?.date || b.created_at).localeCompare(String(a.cleaning_available_slots?.date || a.created_at))
      )[0];

      return {
        ...client,
        isDerived: false,
        client_type_label: getClientType(client, matchingPublicSubs.length > 0),
        active_plans_count: activePlansCount,
        last_service_date: lastBooking?.cleaning_available_slots?.date || null,
      };
    });

    const storedEmails = new Set(storedClients.map((client: any) => normalize(client.email)).filter(Boolean));
    const publicClients = subscriptions
      .filter((subscription: any) => {
        const email = normalize(subscription.users?.email);
        return email && !storedEmails.has(email);
      })
      .map((subscription: any) => ({
        id: `public-client-${subscription.user_id || subscription.id}`,
        isDerived: true,
        company_name: getDisplayName(subscription.users),
        contact_person: getDisplayName(subscription.users),
        email: subscription.users?.email || "",
        phone: "",
        location: "Prospera Village",
        notes: "",
        internal_admin_notes: "",
        status: subscription.is_active ? "active" : "inactive",
        client_type: "regular_cleaning_client",
        client_type_label: "Regular",
        visibility: "admin_only",
        is_private: false,
        user_id: subscription.user_id,
        active_plans_count: subscription.is_active ? 1 : 0,
        last_service_date: null,
      }));

    return [...storedClients, ...publicClients];
  }, [clients, subscriptions, customPlans, bookings]);

  const filteredRows = useMemo(() => {
    const term = normalize(search);
    if (!term) return clientRows;
    return clientRows.filter((client: any) =>
      [client.company_name, client.contact_person, client.email, client.phone, client.location, client.client_type_label]
        .map(normalize)
        .some((value) => value.includes(term))
    );
  }, [clientRows, search]);

  const selectedClient = clientRows.find((client: any) => client.id === selectedClientId) ?? filteredRows[0] ?? null;
  const selectedPlans = selectedClient ? customPlans.filter((plan: any) => plan.client_id === selectedClient.id) : [];
  const selectedBookings = selectedClient ? bookings.filter((booking: any) => booking.client_id === selectedClient.id) : [];
  const selectedSchedules = selectedClient ? schedules.filter((schedule: any) => schedule.client_id === selectedClient.id) : [];

  const saveClientMutation = useMutation({
    mutationFn: async () => {
      if (!editClient.company_name?.trim()) throw new Error("Client / company name is required");
      if (!editClient.location?.trim()) throw new Error("Location is required");
      if (!editClient.email?.trim() && !editClient.phone?.trim()) throw new Error("Email or phone is required");

      const payload = toClientPayload({ ...emptyEditClient, ...editClient });

      if (editClient.isDerived) {
        const { data, error } = await supabase.from("cleaning_clients").insert(payload);
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.from("cleaning_clients").update(payload).eq("id", editClient.id);
      if (error) throw error;
      return data;
    },
    onSuccess: (client: any) => {
      toast.success("Client saved");
      setEditClient(null);
      if (client?.id) setSelectedClientId(client.id);
      invalidateClients();
    },
    onError: (error: Error) => toast.error(error.message || "Could not save client"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ client, status }: { client: any; status: string }) => {
      if (client.isDerived) {
        const { error } = await supabase.from("cleaning_clients").insert(toClientPayload({ ...client, status }));
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("cleaning_clients").update({ status }).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client status updated");
      invalidateClients();
    },
  });

  const beginEdit = (client: any) => {
    setSelectedClientId(client.id);
    setEditClient({ ...emptyEditClient, ...client });
  };

  return (
    <SuperAdminLayout title="Cleaning Clients" subtitle="Manage regular and private cleaning clients">
      <div className="grid gap-space-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="gap-space-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>All Clients</CardTitle>
              <p className="mt-space-2 text-body text-muted-foreground">
                Regular public clients and private custom-plan clients share one reusable admin list.
              </p>
            </div>
            <Input
              className="w-full md:w-80"
              placeholder="Search clients"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search clients"
            />
          </CardHeader>
          <CardContent>
            {!filteredRows.length ? (
              <EmptyState title="No clients found" description="Create a custom cleaning plan or search another client." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client / company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Active plans</TableHead>
                      <TableHead>Last service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((client: any) => (
                      <TableRow key={client.id} className={selectedClient?.id === client.id ? "bg-primary/10" : undefined}>
                        <TableCell className="font-bold">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setSelectedClientId(client.id)}
                            aria-label={`Open ${client.company_name} client profile`}
                          >
                            {client.company_name}
                            <span className="block text-caption font-medium text-muted-foreground">{client.service_type || "Cleaning client"}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-body text-muted-foreground">
                          <span className="block">{client.contact_person || "—"}</span>
                          <span className="block">{client.email || client.phone || "No contact"}</span>
                        </TableCell>
                        <TableCell>{client.location || "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{client.client_type_label}</Badge></TableCell>
                        <TableCell>{client.active_plans_count}</TableCell>
                        <TableCell>{formatDate(client.last_service_date)}</TableCell>
                        <TableCell>
                          <Badge variant={client.status === "active" ? "default" : "secondary"}>{client.status || "active"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-space-2">
                            <Button variant="tertiary" size="iconSm" onClick={() => beginEdit(client)} aria-label={`Edit ${client.company_name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="tertiary"
                              size="iconSm"
                              onClick={() => statusMutation.mutate({ client, status: client.status === "active" ? "inactive" : "active" })}
                              aria-label={client.status === "active" ? "Deactivate client" : "Reactivate client"}
                            >
                              {client.status === "active" ? <Archive className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client Profile</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedClient ? (
              <EmptyState title="Select a client" description="Contact details, plans, schedules, and notes will appear here." compact />
            ) : (
              <div className="space-y-space-5">
                <div>
                  <h3 className="text-panel-title">{selectedClient.company_name}</h3>
                  <p className="mt-space-1 text-body text-muted-foreground">{selectedClient.contact_person || "No contact person"}</p>
                </div>
                <div className="grid gap-space-3 text-body text-muted-foreground">
                  <p className="flex items-center gap-space-2"><Mail className="h-4 w-4" />{selectedClient.email || "No email"}</p>
                  <p className="flex items-center gap-space-2"><Phone className="h-4 w-4" />{selectedClient.phone || "No phone"}</p>
                  <p className="flex items-center gap-space-2"><MapPin className="h-4 w-4" />{selectedClient.location || "No location"}</p>
                </div>
                <Button className="w-full" variant="secondary" onClick={() => beginEdit(selectedClient)}>
                  <Pencil className="h-4 w-4" />
                  Edit client
                </Button>

                <section>
                  <h4 className="mb-space-3 flex items-center gap-space-2 text-card-title">
                    <Users className="h-4 w-4 text-primary" />
                    Related plans
                  </h4>
                  <div className="space-y-space-2">
                    {selectedPlans.length ? selectedPlans.map((plan: any) => (
                      <div key={plan.id} className="rounded-radius-md bg-secondary p-space-3">
                        <p className="font-bold">{plan.plan_name}</p>
                        <p className="text-caption text-muted-foreground">{plan.billing_type} · {plan.status}</p>
                      </div>
                    )) : <p className="text-body text-muted-foreground">No private plans linked.</p>}
                  </div>
                </section>

                <section>
                  <h4 className="mb-space-3 text-card-title">Linked slots</h4>
                  <p className="text-body text-muted-foreground">
                    {selectedBookings.length} booked slots · {selectedSchedules.length} recurring schedules
                  </p>
                </section>

                <section className="rounded-radius-md bg-secondary p-space-3">
                  <p className="text-caption font-bold uppercase tracking-[0.12em] text-muted-foreground">Admin notes</p>
                  <p className="mt-space-2 text-body text-muted-foreground">
                    {selectedClient.internal_admin_notes || selectedClient.notes || "No notes saved."}
                  </p>
                </section>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={isEditDrawerOpen} onOpenChange={(open) => !open && setEditClient(null)}>
        <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border px-space-6 py-space-5">
            <SheetTitle>Edit client</SheetTitle>
            <SheetDescription>Update reusable client details, contact information, status, and admin notes.</SheetDescription>
          </SheetHeader>

          {editClient && (
            <div className="flex-1 overflow-y-auto px-space-6 py-space-5">
              <div className="grid gap-space-4">
                <Input
                  label="Client / company name"
                  value={editClient.company_name}
                  onChange={(event) => setEditClient({ ...editClient, company_name: event.target.value })}
                  required
                />
                <Input
                  label="Contact person"
                  value={editClient.contact_person || ""}
                  onChange={(event) => setEditClient({ ...editClient, contact_person: event.target.value })}
                />
                <Input
                  label="Email"
                  type="email"
                  value={editClient.email || ""}
                  onChange={(event) => setEditClient({ ...editClient, email: event.target.value })}
                />
                <Input
                  label="Phone / WhatsApp"
                  value={editClient.phone || ""}
                  onChange={(event) => setEditClient({ ...editClient, phone: event.target.value })}
                />
                <Input
                  label="Location"
                  value={editClient.location || ""}
                  onChange={(event) => setEditClient({ ...editClient, location: event.target.value })}
                  required
                />
                <div>
                  <label className="text-control font-bold">Status</label>
                  <Select value={editClient.status || "active"} onValueChange={(value) => setEditClient({ ...editClient, status: value })}>
                    <SelectTrigger className="mt-space-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  label="Notes"
                  value={editClient.notes || ""}
                  onChange={(event) => setEditClient({ ...editClient, notes: event.target.value })}
                />
                <Textarea
                  label="Internal admin notes"
                  value={editClient.internal_admin_notes || ""}
                  onChange={(event) => setEditClient({ ...editClient, internal_admin_notes: event.target.value })}
                />
                <Textarea
                  label="Payment / invoice preferences"
                  value={editClient.invoice_preferences || ""}
                  onChange={(event) => setEditClient({ ...editClient, invoice_preferences: event.target.value })}
                />
              </div>
            </div>
          )}

          <SheetFooter className="border-t border-border bg-background px-space-6 py-space-4">
            <Button variant="secondary" onClick={() => setEditClient(null)}>Cancel</Button>
            <Button onClick={() => saveClientMutation.mutate()} loading={saveClientMutation.isPending}>
              Save client
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </SuperAdminLayout>
  );
};

export default Clients;
