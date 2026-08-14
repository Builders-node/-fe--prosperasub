import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MapPin, Clock, Info as InfoIcon, Phone, Mail, Truck, CalendarCheck } from "lucide-react";
import { supabaseDb, adminApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProviderEditDialog, type ProviderEditFields } from "@/components/provider/ProviderEditDialog";
import { WorkingHoursEditor } from "@/components/provider/WorkingHoursEditor";
import { formatWorkingHours, parseWorkingHours, type HoursSchedule } from "@/lib/workingHours";

export interface UniversalProviderRow {
  id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  /** JSONB on `providers`; the legacy tables still hold the same JSON as text. */
  working_hours?: unknown;
  contact_phone?: string | null;
  contact_email?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  status?: string | null;
  category_key?: string;
  /** Which service this provider belongs to — drives its public URL. */
  archetype_key?: string | null;
  capabilities?: string[];
  source_service_key?: string | null;
  source_provider_id?: string | null;
  admin_user_id?: string | null;
  booking_settings?: unknown;
  gallery_urls?: string[] | null;
  /** Shown only to providers that actually deliver — see `capabilities`. */
  delivery_info?: string | null;
  /** Platform-owned Google calendar. Provisioned at approval, never by hand. */
  google_calendar_id?: string | null;
}

/**
 * The one Overview tab — every service, no exceptions.
 *
 * There used to be three of these (RestaurantInfoTab, CleaningInfoTab, this
 * one) rendering the same six fields into three different tables. They have
 * been deleted: the profile lives on `providers` now, so one tab writes it.
 * What was genuinely per-service survives as two slots — `extra` for a whole
 * panel (food's service locations) and the delivery field below, which shows
 * itself only where `capabilities` says the business delivers.
 */
export function UniversalInfoTab({ provider, extra }: {
  provider: UniversalProviderRow;
  /** Rendered under the info card — service-specific panels go here. */
  extra?: ReactNode;
}) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProviderEditFields>(() => hydrate(provider));
  /**
   * Hours are edited as a schedule, not as free text — a provider typing
   * "Mon-Fri 9 to 6" gives the booking calendar nothing to work with.
   */
  const [hours, setHours] = useState<HoursSchedule[]>(() => parseWorkingHours(provider.working_hours));
  const [delivery, setDelivery] = useState(provider.delivery_info ?? "");
  const delivers = (provider.capabilities ?? []).includes("delivery");

  const openEdit = () => {
    setForm(hydrate(provider));
    setHours(parseWorkingHours(provider.working_hours));
    setDelivery(provider.delivery_info ?? "");
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        avatar_url: form.avatar_url?.trim() || null,
        banner_url: form.banner_url?.trim() || null,
        location: form.location?.trim() || null,
        // The column is JSONB now, so the array goes in as-is; serialising it
        // to a string would store a quoted blob.
        working_hours: hours.filter((h) => h.days.length && h.open && h.close),
        contact_phone: form.contact_phone?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        status: form.status || "active",
        sort_order: form.sort_order ?? 0,
        gallery_urls: form.gallery_urls ?? [],
        ...(delivers ? { delivery_info: delivery.trim() || null } : {}),
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) throw new Error("Name is required");
      const { error } = await supabaseDb.from("providers").update(payload).eq("id", provider.id);
      if (error) throw error;
      if (userData?.id) await logAuditEvent(userData.id, "edit", "provider", provider.id, payload);
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["universal-provider", provider.id] });
      qc.invalidateQueries({ queryKey: ["admin-legacy-provider-row"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">Business details shown to customers</p>
        </div>
        <Button onClick={openEdit} variant="outline" className="gap-2 rounded-full">
          <Edit className="h-4 w-4" /> Edit
        </Button>
      </div>

      <div className="rounded-2xl bg-card p-5 space-y-4">
        <Row icon={<InfoIcon className="h-4 w-4 text-muted-foreground" />} label="Description">
          {provider.description || <em className="text-muted-foreground/70">No description</em>}
        </Row>
        <Row icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="Location">
          {provider.location || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Working hours">
          {formatWorkingHours(provider.working_hours) || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Phone">
          {provider.contact_phone || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email">
          {provider.contact_email || <em className="text-muted-foreground/70">Not set</em>}
        </Row>
        <Row icon={<CalendarCheck className="h-4 w-4 text-muted-foreground" />} label="Booking calendar">
          {provider.google_calendar_id
            ? <CalendarDetails
                providerId={provider.id}
                calendarId={provider.google_calendar_id}
                contactEmail={provider.contact_email ?? null}
              />
            : <ProvisionCalendar providerId={provider.id} />}
        </Row>
        {delivers && (
          <Row icon={<Truck className="h-4 w-4 text-muted-foreground" />} label="Delivery">
            {provider.delivery_info
              ? <span className="whitespace-pre-line">{provider.delivery_info}</span>
              : <em className="text-muted-foreground/70">Not set</em>}
          </Row>
        )}
      </div>

      {extra}

      <ProviderEditDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit provider"
        values={form}
        onChange={setForm}
        onSave={() => save.mutate()}
        saving={save.isPending}
        extras={
          <>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Working hours</p>
              <WorkingHoursEditor value={hours} onChange={setHours} />
            </div>
            {delivers && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delivery</p>
                <Textarea
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                  rows={3}
                  placeholder="Delivery windows, fees, minimum order…"
                />
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

function hydrate(p: UniversalProviderRow): ProviderEditFields {
  return {
    name: p.name,
    description: p.description ?? "",
    avatar_url: p.avatar_url ?? "",
    banner_url: p.banner_url ?? "",
    location: p.location ?? "",
    contact_phone: p.contact_phone ?? "",
    contact_email: p.contact_email ?? "",
    status: p.status ?? "active",
    sort_order: 0,
    gallery_urls: Array.isArray(p.gallery_urls) ? p.gallery_urls : [],
  };
}

/**
 * A provider never types a calendar id here — the platform creates the
 * calendar and shares it with them. This is the repair path for businesses
 * approved before provisioning existed; the endpoint is idempotent, so
 * pressing it twice cannot make a second calendar.
 */
function ProvisionCalendar({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/providers/${providerId}/calendar/provision`, { method: "POST" });
      if (error) throw new Error(String(error));
      if (!data?.calendarId) throw new Error("Google Calendar is not configured on the server yet");
      return data;
    },
    onSuccess: () => {
      toast.success("Calendar created and shared with you");
      qc.invalidateQueries({ queryKey: ["universal-provider", providerId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the calendar"),
  });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <em className="text-muted-foreground/70">Not set up</em>
      <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs"
        onClick={() => run.mutate()} disabled={run.isPending}>
        {run.isPending ? "Creating…" : "Create it"}
      </Button>
    </span>
  );
}

/**
 * The calendar, once it exists — its address, a way in, and the truth about
 * who can actually see it.
 *
 * This row used to say "Connected · managed by EverySub" and stop there, which
 * answers the wrong question: the calendar exists, fine, but where is it? The
 * platform owns it through a service account, so unless it has been shared
 * with someone, "connected" means connected to nobody — a real calendar,
 * filling up with real visits, that no human has a link to.
 */
function CalendarDetails({
  providerId, calendarId, contactEmail,
}: { providerId: string; calendarId: string; contactEmail: string | null }) {
  const qc = useQueryClient();
  // `cid` is Google's own "add this calendar to mine" link. It only opens for
  // an account the calendar has been shared with — hence the note below.
  const href = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;

  const share = useMutation({
    mutationFn: async () => {
      const { data, error } = await adminApi(`/admin/providers/${providerId}/calendar/provision`, { method: "POST" });
      if (error) throw new Error(String(error));
      if (!data?.shared) throw new Error("Google accepted the request but didn't confirm the share");
      return data;
    },
    onSuccess: () => {
      toast.success(`Shared with ${contactEmail}`);
      qc.invalidateQueries({ queryKey: ["universal-provider", providerId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not share the calendar"),
  });

  return (
    <span className="block space-y-1.5">
      <span className="block break-all font-mono text-xs text-muted-foreground">{calendarId}</span>
      <span className="flex flex-wrap items-center gap-2">
        <a href={href} target="_blank" rel="noreferrer"
           className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
          Open in Google Calendar
        </a>
        {contactEmail ? (
          <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs"
            onClick={() => share.mutate()} disabled={share.isPending}>
            {share.isPending ? "Sharing…" : `Share with ${contactEmail}`}
          </Button>
        ) : null}
      </span>
      {!contactEmail && (
        <span className="block text-xs text-muted-foreground">
          Nobody has access yet — the calendar belongs to EverySub. Add an email
          above and share it, or the link opens an empty page.
        </span>
      )}
    </span>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}
