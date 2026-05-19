import { type ChangeEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  SparklesIcon,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const weekdayOptions = [
  { label: "Monday", value: "MONDAY", short: "Mon" },
  { label: "Tuesday", value: "TUESDAY", short: "Tue" },
  { label: "Wednesday", value: "WEDNESDAY", short: "Wed" },
  { label: "Thursday", value: "THURSDAY", short: "Thu" },
  { label: "Friday", value: "FRIDAY", short: "Fri" },
  { label: "Saturday", value: "SATURDAY", short: "Sat" },
  { label: "Sunday", value: "SUNDAY", short: "Sun" },
];

const dailyChecklist = [
  "Take out trash",
  "Wipe down surfaces",
  "Organize chairs, tables, monitors, cables, and general workspace setup",
  "General visual tidying and upkeep",
  "Refill / set up water jug and cups",
  "Report if anything is missing, broken, damaged, or unusual",
];

const deepChecklist = [
  "Clean microwave",
  "Clean refrigerators",
  "Dust library, monitors, and other surfaces",
  "Sweep and mop floors",
  "Clean bean bags as needed",
  "Wipe down swivel chairs",
  "Clean cowork door and interior windows with glass cleaner",
  "Take out trash and replace bags",
  "Wipe down all surfaces",
  "Organize workspace",
  "Refill water jug and cups",
  "Report missing, broken, damaged, or unusual items",
];

const initialForm = {
  company_name: "Infinita Cowork",
  contact_person: "",
  email: "",
  phone: "",
  location: "Duna Tower Level 1",
  service_type: "Daily cowork cleaning",
  notes: "",
  internal_admin_notes: "",
  start_date: format(new Date(), "yyyy-MM-dd"),
  end_date: "",
  status: "active",
  plan_name: "Infinita Cowork Daily Cleaning",
  custom_price: "10",
  billing_type: "daily",
  monthly_invoice: true,
  payment_timing: "after_service_completed",
  custom_terms: "Monthly invoice after services are completed",
  service_frequency: "6 days per week",
  days_of_week: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
  deep_cleaning_add_on: true,
  estimated_monthly_total: "240",
  preferred_start_time: "08:00",
  preferred_end_time: "10:00",
  assigned_cleaner: "",
  service_duration_minutes: "120",
  repeat_frequency: "weekly",
  daily_checklist: dailyChecklist.join("\n"),
  deep_cleaning_checklist: deepChecklist.join("\n"),
};

const toLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toCents = (value: string) => Math.round(Number(value || 0) * 100);
const formatUSD = (cents?: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;

const statusColor = (status: string) => {
  switch (status) {
    case "booked":
    case "paid":
    case "active":
      return "default";
    case "completed":
    case "paused":
      return "secondary";
    case "cancelled":
    case "archived":
      return "destructive";
    default:
      return "outline";
  }
};

const getUserName = (user: any) => {
  if (!user) return "Unknown";
  return user.display_name || user.name || user.email || "Unknown";
};

const getBookingDate = (booking: any) => booking.cleaning_available_slots?.date ?? "";

const CleaningManagement = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [completionBookingId, setCompletionBookingId] = useState<string>("");
  const [completion, setCompletion] = useState({
    completed_by: "Admin",
    notes: "",
    photo_url: "",
    issue_report: "",
    checklist_completed: dailyChecklist,
  });

  const invalidateCleaning = () => {
    [
      "admin-cleaning-subscriptions",
      "admin-cleaning-bookings",
      "admin-cleaning-slots",
      "admin-cleaning-clients",
      "admin-cleaning-custom-plans",
      "admin-cleaning-schedules",
      "admin-cleaning-checklists",
      "admin-cleaning-reports",
      "cleaning-slots",
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ["admin-cleaning-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .select("*, cleaning_packages(name, cleanings_per_month), users(display_name, email, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-cleaning-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(id, date, start_time, end_time), users(display_name, email, name), cleaning_clients(*), cleaning_custom_plans(*), cleaning_completion_reports(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: slots } = useQuery({
    queryKey: ["admin-cleaning-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_available_slots")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["admin-cleaning-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customPlans } = useQuery({
    queryKey: ["admin-cleaning-custom-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_custom_plans")
        .select("*, cleaning_clients(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ["admin-cleaning-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_recurring_schedules")
        .select("*, cleaning_clients(*), cleaning_custom_plans(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useQuery({
    queryKey: ["admin-cleaning-checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_checklist_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: completionReports } = useQuery({
    queryKey: ["admin-cleaning-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_completion_reports")
        .select("*, cleaning_bookings(*)")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createCustomPlan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_custom_cleaning_plan", {
        ...form,
        custom_price_cents: toCents(form.custom_price),
        estimated_monthly_total_cents: toCents(form.estimated_monthly_total),
        daily_checklist: toLines(form.daily_checklist),
        deep_cleaning_checklist: toLines(form.deep_cleaning_checklist),
        custom_checklist: toLines(form.daily_checklist),
      });
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: (result) => {
      toast.success(`Custom plan created. ${result?.bookings_created ?? 0} recurring slots booked.`);
      if (result?.conflicts?.length) {
        toast.warning(`${result.conflicts.length} dates were already occupied and skipped.`);
      }
      setCreateOpen(false);
      setSelectedClientId(result?.client?.id ?? "");
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to create custom plan"),
  });

  const approveMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase
        .from("cleaning_subscriptions")
        .update({ payment_status: "paid", is_active: true })
        .eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment approved and subscription activated");
      invalidateCleaning();
    },
    onError: () => toast.error("Failed to approve payment"),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("cleaning_recurring_schedules")
        .update({ status, paused_at: status === "paused" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recurring schedule updated");
      invalidateCleaning();
    },
  });

  const archiveClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("cleaning_clients")
        .update({ status: "archived" })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client archived");
      invalidateCleaning();
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.from("cleaning_clients").delete().eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client deleted from admin-only records");
      setSelectedClientId("");
      invalidateCleaning();
    },
  });

  const completeBookingMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("complete_cleaning_booking", {
        p_booking_id: completionBookingId,
        p_checklist_completed: completion.checklist_completed,
        p_notes: completion.notes || null,
        p_photo_url: completion.photo_url || null,
        p_issue_report: completion.issue_report || null,
        p_completed_by: completion.completed_by || "Admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cleaning session marked completed");
      setCompletionBookingId("");
      setCompletion({ completed_by: "Admin", notes: "", photo_url: "", issue_report: "", checklist_completed: dailyChecklist });
      invalidateCleaning();
    },
    onError: (error: Error) => toast.error(error.message || "Could not complete booking"),
  });

  const selectedClient = clients?.find((client: any) => client.id === selectedClientId) ?? clients?.[0] ?? null;
  const selectedClientPlans = customPlans?.filter((plan: any) => plan.client_id === selectedClient?.id) ?? [];
  const selectedClientSchedules = schedules?.filter((schedule: any) => schedule.client_id === selectedClient?.id) ?? [];
  const selectedClientBookings = bookings?.filter((booking: any) => booking.client_id === selectedClient?.id) ?? [];
  const activeSubsCount = subscriptions?.filter((sub: any) => sub.is_active).length ?? 0;
  const totalBookings = bookings?.length ?? 0;
  const upcomingBookings = bookings?.filter((booking: any) => booking.status === "booked").length ?? 0;
  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const bookedDates = useMemo(
    () =>
      bookings
        ?.filter((booking: any) => booking.status === "booked" && booking.cleaning_available_slots?.date)
        .map((booking: any) => new Date(`${booking.cleaning_available_slots.date}T00:00:00`)) ?? [],
    [bookings]
  );
  const slotDates = useMemo(
    () => slots?.map((slot: any) => new Date(`${slot.date}T00:00:00`)) ?? [],
    [slots]
  );
  const bookingsForSelectedDate = useMemo(
    () => bookings?.filter((booking: any) => booking.cleaning_available_slots?.date === selectedDateKey) ?? [],
    [bookings, selectedDateKey]
  );
  const slotsForSelectedDate = useMemo(
    () => slots?.filter((slot: any) => slot.date === selectedDateKey) ?? [],
    [slots, selectedDateKey]
  );

  const previewDates = useMemo(() => {
    const days = new Set(form.days_of_week);
    const start = new Date(`${form.start_date}T00:00:00`);
    return Array.from({ length: 21 }, (_, index) => addDays(start, index))
      .filter((date) => {
        const option = weekdayOptions[date.getDay() === 0 ? 6 : date.getDay() - 1];
        return days.has(option?.value);
      })
      .slice(0, 12);
  }, [form.days_of_week, form.start_date]);

  const setFormValue = (key: keyof typeof initialForm, value: any) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleWeekday = (value: string) => {
    setForm((current) => ({
      ...current,
      days_of_week: current.days_of_week.includes(value)
        ? current.days_of_week.filter((day) => day !== value)
        : [...current.days_of_week, value],
    }));
  };

  const toggleChecklistItem = (item: string) => {
    setCompletion((current) => ({
      ...current,
      checklist_completed: current.checklist_completed.includes(item)
        ? current.checklist_completed.filter((candidate) => candidate !== item)
        : [...current.checklist_completed, item],
    }));
  };

  const handleCompletionPhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCompletion((current) => ({ ...current, photo_url: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <SuperAdminLayout title="Cleaning Service" subtitle="Manage cleaning subscriptions, private clients, bookings, and slots">
      <div className="grid grid-cols-2 gap-space-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Active Subs
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{activeSubsCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <SparklesIcon className="h-4 w-4" />
              Custom Clients
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{clients?.length ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{upcomingBookings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              Total Bookings
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalBookings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Slots
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{slots?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="custom-clients" variant="pills" className="mt-space-8 w-full">
        <TabsList wrap className="h-auto">
          <TabsTrigger value="custom-clients">Custom Clients</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="bookings">All Bookings</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="reports">Completion Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="custom-clients">
          <div className="grid gap-space-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.7fr)]">
            <Card>
              <CardHeader className="flex flex-col gap-space-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Custom Clients</CardTitle>
                  <p className="mt-space-2 text-body text-muted-foreground">
                    Private admin-only cleaning clients. These records never feed the public pricing flow.
                  </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Create Custom Plan
                </Button>
              </CardHeader>
              <CardContent>
                {!clients?.length ? (
                  <EmptyState
                    title="No custom clients yet"
                    description="Create a private cleaning client plan for cowork spaces, offices, or custom agreements."
                    compact
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Visibility</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients.map((client: any) => (
                          <TableRow
                            key={client.id}
                            className={selectedClient?.id === client.id ? "bg-primary/10" : undefined}
                          >
                            <TableCell className="font-bold">
                              <button className="text-left" onClick={() => setSelectedClientId(client.id)}>
                                {client.company_name}
                                <span className="block text-sm font-medium text-muted-foreground">
                                  {client.service_type || "Custom cleaning"}
                                </span>
                              </button>
                            </TableCell>
                            <TableCell>{client.location}</TableCell>
                            <TableCell><Badge variant={statusColor(client.status) as any}>{client.status}</Badge></TableCell>
                            <TableCell>
                              <Badge variant="secondary">{client.visibility || "admin_only"}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-space-2">
                                <Button variant="tertiary" size="iconSm" onClick={() => setSelectedClientId(client.id)} aria-label="View client">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="tertiary" size="iconSm" onClick={() => archiveClientMutation.mutate(client.id)} aria-label="Archive client">
                                  <Archive className="h-4 w-4" />
                                </Button>
                                <Button variant="tertiary" size="iconSm" onClick={() => deleteClientMutation.mutate(client.id)} aria-label="Delete client">
                                  <Trash2 className="h-4 w-4 text-destructive" />
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
                <CardTitle>Client Detail</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedClient ? (
                  <EmptyState title="Select a client" description="Client plan details will appear here." compact />
                ) : (
                  <div className="space-y-space-5">
                    <section className="rounded-radius-lg bg-secondary p-space-4">
                      <div className="flex items-start justify-between gap-space-4">
                        <div>
                          <h3 className="text-panel-title">{selectedClient.company_name}</h3>
                          <p className="mt-space-1 text-body text-muted-foreground">{selectedClient.contact_person || "No contact person"}</p>
                        </div>
                        <Badge variant={statusColor(selectedClient.status) as any}>{selectedClient.status}</Badge>
                      </div>
                      <div className="mt-space-4 grid gap-space-3 text-body text-muted-foreground">
                        <p className="flex items-center gap-space-2"><MapPin className="h-4 w-4" />{selectedClient.location}</p>
                        <p>{selectedClient.email || "No email"} · {selectedClient.phone || "No phone"}</p>
                        <p>{selectedClient.notes || "No client notes"}</p>
                        <p className="rounded-radius-md bg-background p-space-3">
                          <strong className="text-foreground">Internal:</strong> {selectedClient.internal_admin_notes || "No internal notes"}
                        </p>
                      </div>
                    </section>

                    <section>
                      <h4 className="mb-space-3 text-card-title">Private Plans</h4>
                      <div className="space-y-space-3">
                        {selectedClientPlans.map((plan: any) => (
                          <div key={plan.id} className="rounded-radius-lg bg-secondary p-space-4">
                            <div className="flex items-start justify-between gap-space-4">
                              <div>
                                <p className="text-card-title">{plan.plan_name}</p>
                                <p className="mt-space-1 text-body text-muted-foreground">
                                  {formatUSD(plan.custom_price_cents)} / {plan.billing_type}
                                </p>
                              </div>
                              <Badge variant="secondary">{plan.visibility}</Badge>
                            </div>
                            <p className="mt-space-3 text-body text-muted-foreground">
                              {plan.service_frequency} · Estimated monthly {formatUSD(plan.estimated_monthly_total_cents)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h4 className="mb-space-3 text-card-title">Recurring Schedule</h4>
                      <div className="space-y-space-3">
                        {selectedClientSchedules.map((schedule: any) => (
                          <div key={schedule.id} className="rounded-radius-lg bg-secondary p-space-4">
                            <div className="flex items-start justify-between gap-space-3">
                              <div>
                                <p className="font-bold">
                                  {schedule.preferred_start_time} - {schedule.preferred_end_time}
                                </p>
                                <p className="mt-space-1 text-body text-muted-foreground">
                                  {(schedule.days_of_week || []).join(", ")} · {schedule.assigned_cleaner || "Cleaner not assigned"}
                                </p>
                              </div>
                              <Badge variant={statusColor(schedule.status) as any}>{schedule.status}</Badge>
                            </div>
                            <div className="mt-space-4 flex flex-wrap gap-space-2">
                              <Button size="sm" variant="secondary" onClick={() => updateScheduleMutation.mutate({ id: schedule.id, status: "paused" })}>
                                Pause
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => updateScheduleMutation.mutate({ id: schedule.id, status: "active" })}>
                                Resume
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => updateScheduleMutation.mutate({ id: schedule.id, status: "cancelled" })}>
                                Cancel Future
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h4 className="mb-space-3 text-card-title">Generated Bookings</h4>
                      <div className="max-h-[360px] space-y-space-3 overflow-auto pr-space-2">
                        {selectedClientBookings.map((booking: any) => (
                          <div key={booking.id} className="rounded-radius-lg bg-secondary p-space-4">
                            <div className="flex items-start justify-between gap-space-3">
                              <div>
                                <p className="font-bold">
                                  {booking.cleaning_available_slots?.date
                                    ? format(new Date(`${booking.cleaning_available_slots.date}T00:00:00`), "EEE, MMM d")
                                    : "No date"}
                                </p>
                                <p className="text-body text-muted-foreground">
                                  {booking.cleaning_available_slots?.start_time?.slice(0, 5)} - {booking.cleaning_available_slots?.end_time?.slice(0, 5)}
                                </p>
                              </div>
                              <Badge variant={statusColor(booking.status) as any}>{booking.status}</Badge>
                            </div>
                            {booking.status !== "completed" && (
                              <Button
                                className="mt-space-3 w-full"
                                size="sm"
                                variant="secondary"
                                onClick={() => setCompletionBookingId(booking.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Complete session
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid gap-space-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-space-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Slot Blocking Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="w-full rounded-radius-lg bg-card"
                  modifiers={{ booked: bookedDates, slot: slotDates }}
                  modifiersClassNames={{
                    booked: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    slot: "ring-1 ring-primary/50",
                  }}
                />
                <div className="mt-space-5 grid gap-space-3 text-control text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-space-2"><span className="h-3 w-3 rounded-radius-full bg-primary" />Booked cleaning</div>
                  <div className="flex items-center gap-space-2"><span className="h-3 w-3 rounded-radius-full border border-primary" />Available slot</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-space-6">
                <section>
                  <div className="mb-space-3 flex items-center gap-space-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h3 className="text-card-title">Bookings</h3>
                    <Badge variant="secondary">{bookingsForSelectedDate.length}</Badge>
                  </div>
                  {bookingsForSelectedDate.length === 0 ? (
                    <EmptyState title="No bookings for this day" description="Booked cleanings will appear here." />
                  ) : (
                    <div className="space-y-space-3">
                      {bookingsForSelectedDate.map((booking: any) => (
                        <div key={booking.id} className="rounded-radius-lg bg-secondary p-space-4">
                          <div className="flex flex-wrap items-start justify-between gap-space-3">
                            <div>
                              <p className="text-card-title">
                                {booking.cleaning_clients?.company_name || getUserName(booking.users)}
                              </p>
                              <p className="type-body text-muted-foreground">
                                {booking.cleaning_available_slots?.start_time?.slice(0, 5)} - {booking.cleaning_available_slots?.end_time?.slice(0, 5)}
                              </p>
                            </div>
                            <Badge variant={statusColor(booking.status) as any}>{booking.status}</Badge>
                          </div>
                          {booking.custom_plan_id && (
                            <p className="mt-space-3 text-body text-primary">Private custom cleaning client</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-space-3 flex items-center gap-space-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="text-card-title">Slots</h3>
                    <Badge variant="secondary">{slotsForSelectedDate.length}</Badge>
                  </div>
                  <div className="grid gap-space-3 sm:grid-cols-2">
                    {slotsForSelectedDate.map((slot: any) => {
                      const remaining = Math.max(0, slot.max_bookings - slot.current_bookings);
                      return (
                        <div key={slot.id} className="rounded-radius-lg bg-card p-space-4">
                          <p className="text-card-title">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</p>
                          <p className="mt-space-1 type-body text-muted-foreground">{slot.current_bookings} booked of {slot.max_bookings}</p>
                          <Badge className="mt-space-3" variant={remaining > 0 ? "default" : "destructive"}>
                            {remaining > 0 ? "1 spot left" : "Blocked"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bookings">
          <Card>
            <CardHeader>
              <CardTitle>All Cleaning Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <p className="py-space-8 text-center text-muted-foreground">Loading...</p>
              ) : !bookings?.length ? (
                <p className="py-space-8 text-center text-muted-foreground">No bookings yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.map((booking: any) => (
                        <TableRow key={booking.id}>
                          <TableCell className="font-medium">
                            {booking.cleaning_clients?.company_name || getUserName(booking.users)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={booking.custom_plan_id ? "secondary" : "outline"}>
                              {booking.custom_plan_id ? "Private custom" : "Public subscription"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {getBookingDate(booking) ? format(new Date(`${getBookingDate(booking)}T00:00:00`), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            {booking.cleaning_available_slots?.start_time?.slice(0, 5)} - {booking.cleaning_available_slots?.end_time?.slice(0, 5)}
                          </TableCell>
                          <TableCell><Badge variant={statusColor(booking.status) as any}>{booking.status}</Badge></TableCell>
                          <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{booking.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <CardTitle>Public Cleaning Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <p className="py-space-8 text-center text-muted-foreground">Loading...</p>
              ) : !subscriptions?.length ? (
                <p className="py-space-8 text-center text-muted-foreground">No subscriptions yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptions.map((sub: any) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{getUserName(sub.users)}</TableCell>
                          <TableCell>{sub.cleaning_packages?.name || "—"}</TableCell>
                          <TableCell>{sub.cleanings_remaining}</TableCell>
                          <TableCell><Badge variant={statusColor(sub.payment_status) as any}>{sub.payment_status}</Badge></TableCell>
                          <TableCell><Badge variant={sub.is_active ? "default" : "outline"}>{sub.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell>
                            {sub.payment_status === "pending" ? (
                              <Button size="sm" onClick={() => approveMutation.mutate(sub.id)} loading={approveMutation.isPending}>
                                <CheckCircle2 className="h-4 w-4" />
                                Approve
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Completion Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {!completionReports?.length ? (
                <EmptyState title="No completion reports yet" description="Completed sessions will appear here with checklist, notes, and photo links." />
              ) : (
                <div className="grid gap-space-4 lg:grid-cols-2">
                  {completionReports.map((report: any) => (
                    <article key={report.id} className="rounded-radius-lg bg-secondary p-space-5">
                      <div className="flex items-start justify-between gap-space-3">
                        <div>
                          <h3 className="text-card-title">{report.completed_by}</h3>
                          <p className="mt-space-1 text-body text-muted-foreground">
                            {format(new Date(report.completed_at), "MMM d, yyyy HH:mm")}
                          </p>
                        </div>
                        <Badge variant="default">Completed</Badge>
                      </div>
                      <p className="mt-space-4 text-body">{report.notes || "No notes"}</p>
                      {report.issue_report && (
                        <p className="mt-space-3 rounded-radius-md bg-background p-space-3 text-body text-muted-foreground">
                          {report.issue_report}
                        </p>
                      )}
                      {report.photo_url && (
                        <a className="mt-space-3 inline-flex text-control text-primary" href={report.photo_url} target="_blank" rel="noreferrer">
                          View photo
                        </a>
                      )}
                      <p className="mt-space-3 text-caption text-muted-foreground">
                        Checklist items completed: {(report.checklist_completed || []).length}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Custom Cleaning Plan</DialogTitle>
            <DialogDescription>
              Creates an admin-only client, private plan, recurring schedule, checklist templates, and occupied cleaning slots.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-space-6 lg:grid-cols-2">
            <Card className="p-space-4">
              <CardTitle className="mb-space-4">Client details</CardTitle>
              <div className="grid gap-space-4">
                <Input label="Client / company name" value={form.company_name} onChange={(event) => setFormValue("company_name", event.target.value)} required />
                <Input label="Contact person" value={form.contact_person} onChange={(event) => setFormValue("contact_person", event.target.value)} />
                <div className="grid gap-space-4 sm:grid-cols-2">
                  <Input label="Email" type="email" value={form.email} onChange={(event) => setFormValue("email", event.target.value)} />
                  <Input label="Phone / WhatsApp" value={form.phone} onChange={(event) => setFormValue("phone", event.target.value)} />
                </div>
                <Input label="Location" value={form.location} onChange={(event) => setFormValue("location", event.target.value)} required />
                <Input label="Service type" value={form.service_type} onChange={(event) => setFormValue("service_type", event.target.value)} />
                <div className="grid gap-space-4 sm:grid-cols-2">
                  <Input label="Start date" type="date" value={form.start_date} onChange={(event) => setFormValue("start_date", event.target.value)} />
                  <Input label="End date" type="date" value={form.end_date} onChange={(event) => setFormValue("end_date", event.target.value)} helperText="Leave empty for no end date" />
                </div>
                <Textarea label="Client notes" value={form.notes} onChange={(event) => setFormValue("notes", event.target.value)} />
                <Textarea label="Internal admin notes" value={form.internal_admin_notes} onChange={(event) => setFormValue("internal_admin_notes", event.target.value)} />
              </div>
            </Card>

            <Card className="p-space-4">
              <CardTitle className="mb-space-4">Plan and billing</CardTitle>
              <div className="grid gap-space-4">
                <Input label="Plan name" value={form.plan_name} onChange={(event) => setFormValue("plan_name", event.target.value)} required />
                <div className="grid gap-space-4 sm:grid-cols-2">
                  <Input label="Custom price" type="number" value={form.custom_price} onChange={(event) => setFormValue("custom_price", event.target.value)} leftIcon={<span>$</span>} />
                  <Input label="Estimated monthly total" type="number" value={form.estimated_monthly_total} onChange={(event) => setFormValue("estimated_monthly_total", event.target.value)} leftIcon={<span>$</span>} />
                </div>
                <div className="grid gap-space-4 sm:grid-cols-2">
                  <div>
                    <Label>Billing type</Label>
                    <Select value={form.billing_type} onValueChange={(value) => setFormValue("billing_type", value)}>
                      <SelectTrigger className="mt-space-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Payment timing</Label>
                    <Select value={form.payment_timing} onValueChange={(value) => setFormValue("payment_timing", value)}>
                      <SelectTrigger className="mt-space-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prepaid">Prepaid</SelectItem>
                        <SelectItem value="after_service_completed">After service completed</SelectItem>
                        <SelectItem value="custom_terms">Custom terms</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="flex items-center justify-between rounded-radius-md bg-secondary p-space-4">
                  <span className="font-bold">Monthly invoice option</span>
                  <Switch checked={form.monthly_invoice} onCheckedChange={(checked) => setFormValue("monthly_invoice", checked)} />
                </label>
                <label className="flex items-center justify-between rounded-radius-md bg-secondary p-space-4">
                  <span className="font-bold">Deep cleaning add-on</span>
                  <Switch checked={form.deep_cleaning_add_on} onCheckedChange={(checked) => setFormValue("deep_cleaning_add_on", checked)} />
                </label>
                <Textarea label="Payment custom terms" value={form.custom_terms} onChange={(event) => setFormValue("custom_terms", event.target.value)} />
              </div>
            </Card>

            <Card className="p-space-4">
              <CardTitle className="mb-space-4">Recurring booking setup</CardTitle>
              <div className="grid gap-space-4">
                <Input label="Service frequency" value={form.service_frequency} onChange={(event) => setFormValue("service_frequency", event.target.value)} />
                <div>
                  <Label>Days of week</Label>
                  <div className="mt-space-3 grid grid-cols-2 gap-space-2 sm:grid-cols-3">
                    {weekdayOptions.map((day) => (
                      <label key={day.value} className="flex items-center gap-space-2 rounded-radius-md bg-secondary p-space-3">
                        <Checkbox checked={form.days_of_week.includes(day.value)} onCheckedChange={() => toggleWeekday(day.value)} />
                        <span className="text-control">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-space-4 sm:grid-cols-2">
                  <Input label="Preferred start" type="time" value={form.preferred_start_time} onChange={(event) => setFormValue("preferred_start_time", event.target.value)} />
                  <Input label="Preferred end" type="time" value={form.preferred_end_time} onChange={(event) => setFormValue("preferred_end_time", event.target.value)} />
                </div>
                <div className="grid gap-space-4 sm:grid-cols-2">
                  <Input label="Assigned cleaner" value={form.assigned_cleaner} onChange={(event) => setFormValue("assigned_cleaner", event.target.value)} />
                  <Input label="Service duration minutes" type="number" value={form.service_duration_minutes} onChange={(event) => setFormValue("service_duration_minutes", event.target.value)} />
                </div>
                <div className="rounded-radius-lg bg-secondary p-space-4">
                  <p className="text-card-title">Preview</p>
                  <p className="mt-space-1 text-body text-muted-foreground">
                    The first recurring run will create bookings for the current schedule horizon. No-end schedules continue as active admin records.
                  </p>
                  <div className="mt-space-3 flex flex-wrap gap-space-2">
                    {previewDates.map((date) => (
                      <Badge key={date.toISOString()} variant="secondary">
                        {format(date, "MMM d")}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-space-4">
              <CardTitle className="mb-space-4">Checklist templates</CardTitle>
              <div className="grid gap-space-4">
                <Textarea
                  label="Daily upkeep checklist"
                  value={form.daily_checklist}
                  onChange={(event) => setFormValue("daily_checklist", event.target.value)}
                  helperText="One checklist item per line"
                />
                <Textarea
                  label="Deep cleaning checklist"
                  value={form.deep_cleaning_checklist}
                  onChange={(event) => setFormValue("deep_cleaning_checklist", event.target.value)}
                  helperText="One checklist item per line"
                />
              </div>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createCustomPlan.mutate()} loading={createCustomPlan.isPending}>
              <Plus className="h-4 w-4" />
              Create private plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completionBookingId)} onOpenChange={(open) => !open && setCompletionBookingId("")}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complete Cleaning Session</DialogTitle>
            <DialogDescription>Add checklist status, notes, photo URL, and any issue report.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-space-4">
            <Input label="Completed by" value={completion.completed_by} onChange={(event) => setCompletion((current) => ({ ...current, completed_by: event.target.value }))} />
            <div>
              <Label>Checklist completed</Label>
              <div className="mt-space-3 grid gap-space-2">
                {dailyChecklist.map((item) => (
                  <label key={item} className="flex items-start gap-space-2 rounded-radius-md bg-secondary p-space-3">
                    <Checkbox checked={completion.checklist_completed.includes(item)} onCheckedChange={() => toggleChecklistItem(item)} />
                    <span className="text-control">{item}</span>
                  </label>
                ))}
              </div>
            </div>
            <Textarea label="Notes" value={completion.notes} onChange={(event) => setCompletion((current) => ({ ...current, notes: event.target.value }))} />
            <Input
              label="Photo upload after cleaning"
              type="file"
              accept="image/*"
              onChange={handleCompletionPhotoUpload}
              helperText={completion.photo_url?.startsWith("data:") ? "Photo attached to this report" : "Attach a photo from the completed session"}
            />
            <Input label="Photo URL after cleaning" value={completion.photo_url} onChange={(event) => setCompletion((current) => ({ ...current, photo_url: event.target.value }))} />
            <Textarea label="Missing / broken / damaged / unusual report" value={completion.issue_report} onChange={(event) => setCompletion((current) => ({ ...current, issue_report: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCompletionBookingId("")}>Cancel</Button>
            <Button onClick={() => completeBookingMutation.mutate()} loading={completeBookingMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Mark completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
};

export default CleaningManagement;
