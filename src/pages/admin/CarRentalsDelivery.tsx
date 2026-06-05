import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatUSD } from "@/lib/pricing";
import type { RentalDeliverySettings } from "@/types/carRental";

const CarRentalsDelivery = () => {
  const qc = useQueryClient();
  const [form, setForm] = useState<Omit<RentalDeliverySettings, "id" | "updated_at">>({
    delivery_available: true,
    delivery_areas: "",
    pickup_instructions: "",
    delivery_fee_cents: 0,
    terms_and_conditions: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-rental-delivery-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_delivery_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) return null;
      return data as RentalDeliverySettings;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        delivery_available: settings.delivery_available,
        delivery_areas: settings.delivery_areas ?? "",
        pickup_instructions: settings.pickup_instructions ?? "",
        delivery_fee_cents: settings.delivery_fee_cents,
        terms_and_conditions: settings.terms_and_conditions ?? "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        delivery_available: form.delivery_available,
        delivery_areas: form.delivery_areas.trim() || null,
        pickup_instructions: form.pickup_instructions.trim() || null,
        delivery_fee_cents: form.delivery_fee_cents,
        terms_and_conditions: form.terms_and_conditions.trim() || null,
      };

      if (settings?.id) {
        const { error } = await supabaseDb
          .from("rental_delivery_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb
          .from("rental_delivery_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-delivery-settings"] });
      qc.invalidateQueries({ queryKey: ["rental-delivery-settings"] });
      toast.success("Delivery settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <SuperAdminLayout title="Car Rental — Delivery Settings">
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-space-5">
          <div className="rounded-2xl bg-card p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.delivery_available}
                onCheckedChange={(c) => setForm((f) => ({ ...f, delivery_available: c }))}
              />
              <Label className="text-base font-semibold">Delivery available</Label>
            </div>

            <div className="space-y-1.5">
              <Label>Supported delivery areas</Label>
              <Textarea
                value={form.delivery_areas}
                onChange={(e) => setForm((f) => ({ ...f, delivery_areas: e.target.value }))}
                placeholder="e.g. Prospera Village and surrounding areas within 20km"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Pickup instructions</Label>
              <Textarea
                value={form.pickup_instructions}
                onChange={(e) => setForm((f) => ({ ...f, pickup_instructions: e.target.value }))}
                placeholder="Instructions for customers picking up the vehicle…"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Delivery fee (USD cents)</Label>
              <Input
                type="number"
                min={0}
                value={form.delivery_fee_cents}
                onChange={(e) => setForm((f) => ({ ...f, delivery_fee_cents: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                {form.delivery_fee_cents === 0 ? "Free delivery" : `= ${formatUSD(form.delivery_fee_cents)}`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Terms and conditions</Label>
              <Textarea
                value={form.terms_and_conditions}
                onChange={(e) => setForm((f) => ({ ...f, terms_and_conditions: e.target.value }))}
                placeholder="Rental terms, damage policy, fuel policy…"
                rows={5}
              />
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
};

export default CarRentalsDelivery;
