import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MapPin, Clock, Truck } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import { ImageField } from "@/components/food/ImageField";
import { WorkingHoursEditor } from "@/components/food/WorkingHoursEditor";
import {
  parseWorkingHours, serializeWorkingHours, formatWorkingHours,
  type HoursSchedule,
} from "@/lib/workingHours";
import type { FoodProvider } from "@/types/food";

interface Props {
  restaurant: FoodProvider;
}

export function RestaurantInfoTab({ restaurant }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: restaurant.name,
    description: restaurant.description ?? "",
    avatar_url: restaurant.avatar_url ?? "",
    banner_url: restaurant.banner_url ?? "",
    working_hours: parseWorkingHours(restaurant.working_hours),
    delivery_info: restaurant.delivery_info ?? "",
    location: restaurant.location ?? "",
    status: restaurant.status,
    sort_order: restaurant.sort_order,
  });

  const openEdit = () => {
    setForm({
      name: restaurant.name,
      description: restaurant.description ?? "",
      avatar_url: restaurant.avatar_url ?? "",
      banner_url: restaurant.banner_url ?? "",
      working_hours: parseWorkingHours(restaurant.working_hours),
      delivery_info: restaurant.delivery_info ?? "",
      location: restaurant.location ?? "",
      status: restaurant.status,
      sort_order: restaurant.sort_order,
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        banner_url: form.banner_url.trim() || null,
        working_hours: serializeWorkingHours(form.working_hours) || null,
        delivery_info: form.delivery_info.trim() || null,
        location: form.location.trim() || null,
        status: form.status,
        sort_order: form.sort_order,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseDb
        .from("food_providers").update(payload).eq("id", restaurant.id);
      if (error) throw error;
      await logAuditEvent(userData!.id, "edit", "food_provider", restaurant.id, payload);
    },
    onSuccess: () => {
      toast.success("Restaurant updated");
      qc.invalidateQueries({ queryKey: ["admin-food-restaurant", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin-food-providers"] });
      setOpen(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-6">
      {/* Header card with edit button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">Restaurant Information</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Basic details, hours, and delivery settings
          </p>
        </div>
        <Button onClick={openEdit} variant="outline" className="gap-2 rounded-full">
          <Edit className="h-4 w-4" /> Edit
        </Button>
      </div>

      {/* Banner (when set) */}
      {restaurant.banner_url && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-32 w-full overflow-hidden">
            <img src={restaurant.banner_url} alt="" className="h-full w-full object-cover" />
          </div>
        </section>
      )}

      {/* Operating Hours */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-400" />
          <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground">
            Operating Hours
          </h3>
        </div>
        {restaurant.working_hours ? (
          <p className="text-sm text-foreground">{formatWorkingHours(restaurant.working_hours)}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No hours set</p>
        )}
      </section>

      {/* Delivery Settings */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4 text-orange-400" />
          <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground">
            Delivery Settings
          </h3>
        </div>
        {restaurant.delivery_info ? (
          <p className="text-sm text-foreground whitespace-pre-line">{restaurant.delivery_info}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No delivery info set</p>
        )}
      </section>

      {/* Location */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-orange-400" />
          <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground">
            Location
          </h3>
        </div>
        {restaurant.location ? (
          <p className="text-sm text-foreground">{restaurant.location}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No location set</p>
        )}
      </section>

      {/* ─── Edit dialog ──────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Restaurant</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Basic Info</p>
              <div>
                <Label>Name *</Label>
                <Input value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Images</p>
              <ImageField label="Avatar" value={form.avatar_url}
                onChange={(url) => setForm((f) => ({ ...f, avatar_url: url }))}
                pathPrefix="food-providers/avatars" variant="square" />
              <ImageField label="Banner" value={form.banner_url}
                onChange={(url) => setForm((f) => ({ ...f, banner_url: url }))}
                pathPrefix="food-providers/banners" variant="card" />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Operations</p>
              <div>
                <Label>Operating Hours</Label>
                <div className="mt-1">
                  <WorkingHoursEditor value={form.working_hours}
                    onChange={(v) => setForm((f) => ({ ...f, working_hours: v }))} />
                </div>
              </div>
              <div>
                <Label>Delivery Info</Label>
                <Textarea value={form.delivery_info}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_info: e.target.value }))}
                  rows={2} />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
                  }>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value || "0") }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
