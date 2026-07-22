import { type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shared edit-provider modal — one visual grammar for cleaning / food / cars /
 * beach. Each service used to ship its own dialog: cleaning had 4 fields, cars
 * had 7 with a different layout, beach had 6 with rows, food had section
 * headers + image uploaders. Providers were reporting "why does my modal look
 * different from the other place I edited?" — hence this shell.
 *
 * The parent owns the mutation and state; this component just renders the
 * common fields in a fixed order + a slot for service-specific extras (e.g.
 * delivery_info for food, structured hours picker, sort_order tweaks).
 *
 * All the common columns exist on all four provider tables — see the
 * `unify_provider_contact_columns` migration. If a service doesn't want to
 * expose a field it just omits it from its own state (the dialog still
 * renders — that's the point — but the empty input can be ignored).
 */

/** Discriminant for which fields the dialog surfaces. */
export interface ProviderEditFields {
  name: string;
  description?: string;
  avatar_url?: string;
  banner_url?: string;
  location?: string;
  working_hours?: string;
  contact_phone?: string;
  contact_email?: string;
  status?: string;
  sort_order?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  values: ProviderEditFields;
  onChange: (values: ProviderEditFields) => void;
  onSave: () => void;
  saving?: boolean;
  /** Optional custom body between "Basic info" and "Contact" — used by food's
   *  service-locations picker + structured hours editor. */
  extras?: ReactNode;
  /** Set false to hide the Status/Sort-order admin row (owner view). */
  showAdminFields?: boolean;
}

export function ProviderEditDialog({
  open, onOpenChange, title = "Edit provider",
  values, onChange, onSave, saving, extras, showAdminFields = true,
}: Props) {
  const patch = (partial: Partial<ProviderEditFields>) => onChange({ ...values, ...partial });
  const nameValid = values.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Basic info */}
          <section className="space-y-3">
            <SectionTitle>Basic info</SectionTitle>
            <div>
              <Label>Name *</Label>
              <Input
                value={values.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Business name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={values.description ?? ""}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What customers see on the public page."
              />
            </div>
          </section>

          {/* Images */}
          <section className="space-y-3">
            <SectionTitle>Images</SectionTitle>
            <div>
              <Label>Avatar URL</Label>
              <Input
                value={values.avatar_url ?? ""}
                onChange={(e) => patch({ avatar_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label>Banner URL</Label>
              <Input
                value={values.banner_url ?? ""}
                onChange={(e) => patch({ banner_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </section>

          {/* Location & hours */}
          <section className="space-y-3">
            <SectionTitle>Location &amp; hours</SectionTitle>
            <div>
              <Label>Location</Label>
              <Input
                value={values.location ?? ""}
                onChange={(e) => patch({ location: e.target.value })}
                placeholder="Prospera Village…"
              />
            </div>
            <div>
              <Label>Working hours</Label>
              <Input
                value={values.working_hours ?? ""}
                onChange={(e) => patch({ working_hours: e.target.value })}
                placeholder="Mon–Sat 08:00–18:00"
              />
            </div>
          </section>

          {/* Contact */}
          <section className="space-y-3">
            <SectionTitle>Contact</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={values.contact_phone ?? ""}
                  onChange={(e) => patch({ contact_phone: e.target.value })}
                  placeholder="+504 …"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={values.contact_email ?? ""}
                  onChange={(e) => patch({ contact_email: e.target.value })}
                  placeholder="hello@business.com"
                />
              </div>
            </div>
          </section>

          {/* Service-specific extras (food service-locations, structured hours…). */}
          {extras}

          {/* Admin — hidden for owner-facing views. */}
          {showAdminFields && (
            <section className="space-y-3">
              <SectionTitle>Admin</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={values.status ?? "active"}
                    onChange={(e) => patch({ status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    value={values.sort_order ?? 0}
                    onChange={(e) => patch({ sort_order: parseInt(e.target.value || "0", 10) })}
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!nameValid || !!saving}>
            {saving && <Spinner size="sm" className="mr-2" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</p>
  );
}
