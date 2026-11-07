import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Clock, Phone, Mail, Truck, CalendarCheck } from "lucide-react";
import { supabaseDb, adminApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProviderEditDialog, type ProviderEditFields } from "@/components/provider/ProviderEditDialog";
import { WorkspaceRow } from "@/components/provider/WorkspaceUI";
import { WorkingHoursEditor } from "@/components/provider/WorkingHoursEditor";
import { formatWorkingHours, parseWorkingHours, type HoursSchedule } from "@/lib/workingHours";

export interface UniversalProviderRow {
  id: string;
  name: string;
  /** The code a business hands its own clients; they pay no commission on its orders. */
  client_code?: string | null;
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
  /** Which unit runs this business — 'transport' has no archetype at all. */
  unit?: string | null;
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
 * The business's own details, as rows — shown inside the workspace header card
 * on Overview. The description is not repeated here: the header already says
 * it under the name. (This used to be a separate "Information" card with its
 * own Edit button, a second block saying who the business is right under the
 * first.)
 */
export function ProviderDetailsRows({ provider }: { provider: UniversalProviderRow }) {
  const delivers = (provider.capabilities ?? []).includes("delivery");
  return (
    <div className="space-y-4">
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
  );
}

/**
 * The one profile editor — every service, no exceptions.
 *
 * There used to be three (RestaurantInfoTab, CleaningInfoTab and the universal
 * one) writing the same six fields into three tables. The profile lives on
 * `providers` now, so one editor writes it. It is controlled from outside
 * because its door moved: the title bar's Edit on a phone, the header card's
 * on a desktop — neither of which lives inside a tab.
 */
export function ProviderProfileEditor({ provider, open, onOpenChange }: {
  provider: UniversalProviderRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { userData, isAdmin } = useAuth();
  const [form, setForm] = useState<ProviderEditFields>(() => hydrate(provider));
  /**
   * Hours are edited as a schedule, not as free text — a provider typing
   * "Mon-Fri 9 to 6" gives the booking calendar nothing to work with.
   */
  const [hours, setHours] = useState<HoursSchedule[]>(() => parseWorkingHours(provider.working_hours));
  const [delivery, setDelivery] = useState(provider.delivery_info ?? "");
  const delivers = (provider.capabilities ?? []).includes("delivery");

  // Every opening starts from what is saved, not from a half-typed earlier try.
  useEffect(() => {
    if (!open) return;
    setForm(hydrate(provider));
    setHours(parseWorkingHours(provider.working_hours));
    setDelivery(provider.delivery_info ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        // Status and sort order are the platform's to set. An owner's editor
        // used to show and save them, so a draft business could put itself
        // live from its own workspace.
        ...(isAdmin ? { status: form.status || "draft", sort_order: form.sort_order ?? 0 } : {}),
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
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <ProviderEditDialog
      showAdminFields={isAdmin}
      open={open}
      onOpenChange={onOpenChange}
      title="Edit business"
      values={form}
      onChange={setForm}
      onSave={() => save.mutate()}
      saving={save.isPending}
      extras={
        <>
          <div className="space-y-2">
            <p className="text-body text-muted-foreground">Working hours</p>
            <WorkingHoursEditor value={hours} onChange={setHours} />
          </div>
          {delivers && (
            <div className="space-y-2">
              <p className="text-body text-muted-foreground">Delivery</p>
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
      <Button size="sm" variant="outline" className="px-3"
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
        {/* Always offered: the platform owner is shared on every calendar, so
            there is someone to grant access to even when the provider has not
            given an address. */}
        <Button size="sm" variant="outline" className="px-3"
          onClick={() => share.mutate()} disabled={share.isPending}>
          {share.isPending ? "Sharing…" : contactEmail ? `Share with ${contactEmail}` : "Grant access"}
        </Button>
      </span>
      {!contactEmail && (
        <span className="block text-xs text-muted-foreground">
          Shared with the platform owner. Add an email above to give this
          provider access too.
        </span>
      )}
    </span>
  );
}

/** The shared row — kept as a local alias so the call sites read unchanged. */
const Row = WorkspaceRow;
