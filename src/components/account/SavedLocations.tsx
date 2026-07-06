import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Pencil, Trash2, Star, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AddressFields } from "@/components/account/AddressFields";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EMPTY_ADDRESS, type AddressDetails } from "@/lib/address";
import { locationFromRow, locationPayload, type UserLocation } from "@/lib/locations";
import { useResidences } from "@/hooks/useResidences";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Query hook for a user's saved locations (default first, then newest). */
export function useUserLocations(userId?: string | null) {
  return useQuery({
    queryKey: ["user-locations", userId],
    queryFn: async () => {
      if (!userId) return [] as UserLocation[];
      const { data, error } = await supabaseDb
        .from("user_locations")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(locationFromRow);
    },
    enabled: !!userId,
  });
}

/**
 * Full saved-locations manager (list · add · edit · delete · set default).
 * Used inside both profile modals. The default location is also mirrored to
 * `user_profiles.default_delivery_address` so existing delivery consumers stay in sync.
 */
export function SavedLocations({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: locations = [], isLoading } = useUserLocations(userId);

  // null = list view · "new" = adding · UserLocation = editing
  const [editing, setEditing] = useState<UserLocation | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [residence, setResidence] = useState("");
  const [addr, setAddr] = useState<AddressDetails>(EMPTY_ADDRESS);
  const { data: residences = [] } = useResidences();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user-locations", userId] });
    qc.invalidateQueries({ queryKey: ["user-profile"] });
  };

  const openNew = () => { setEditing("new"); setLabel(""); setResidence(""); setAddr(EMPTY_ADDRESS); };
  const openEdit = (loc: UserLocation) => {
    setEditing(loc);
    setLabel(loc.label);
    setResidence(loc.residence || "");
    setAddr({ street: loc.street, house: loc.house, apartment: loc.apartment, area: loc.area, notes: loc.notes });
  };

  // Keep user_profiles.default_delivery_address aligned with the chosen default.
  const mirrorDefaultToProfile = async (line: string | null) => {
    await supabaseDb.from("user_profiles").update({ default_delivery_address: line }).eq("user_id", userId);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = locationPayload(label, addr, residence);
      if (!payload.line) throw new Error("Pick a residence or add a street/area.");
      if (editing === "new") {
        const makeDefault = locations.length === 0; // first location becomes default
        const { error } = await supabaseDb.from("user_locations")
          .insert({ user_id: userId, ...payload, is_default: makeDefault });
        if (error) throw error;
        if (makeDefault) await mirrorDefaultToProfile(payload.line);
      } else if (editing && editing !== "new") {
        const { error } = await supabaseDb.from("user_locations")
          .update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (error) throw error;
        if (editing.is_default) await mirrorDefaultToProfile(payload.line);
      }
    },
    onSuccess: () => { toast.success("Location saved"); setEditing(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (loc: UserLocation) => {
      const { error } = await supabaseDb.from("user_locations").delete().eq("id", loc.id);
      if (error) throw error;
      // If we removed the default, promote the next one (if any).
      if (loc.is_default) {
        const next = locations.find((l) => l.id !== loc.id);
        if (next) {
          await supabaseDb.from("user_locations").update({ is_default: true }).eq("id", next.id);
          await mirrorDefaultToProfile(next.line);
        } else {
          await mirrorDefaultToProfile(null);
        }
      }
    },
    onSuccess: () => { toast.success("Location removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (loc: UserLocation) => {
      await supabaseDb.from("user_locations").update({ is_default: false }).eq("user_id", userId);
      const { error } = await supabaseDb.from("user_locations").update({ is_default: true }).eq("id", loc.id);
      if (error) throw error;
      await mirrorDefaultToProfile(loc.line);
    },
    onSuccess: () => { toast.success("Default location set"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Add / edit form ─────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="space-y-3">
        <Input
          id="loc-label"
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Home, Office"
        />
        {residences.length > 0 && (
          <div>
            <Label className="mb-1.5">Residence</Label>
            <Select value={residence || "_none"} onValueChange={(v) => setResidence(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select residence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Other / not listed</SelectItem>
                {residences.map((r) => (
                  <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <AddressFields value={addr} onChange={setAddr} />
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)} disabled={saveMutation.isPending}>Cancel</Button>
          <Button className="flex-1" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <><Spinner size="sm" /> Saving…</> : "Save Location"}
          </Button>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="py-6 text-center"><Spinner size="sm" /></div>
      ) : locations.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
            <MapPin className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-[13px] font-semibold text-foreground">No saved locations</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Add one to reuse at checkout.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((loc) => (
            <div key={loc.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <MapPin className="h-4 w-4 text-orange-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-bold text-foreground">{loc.label || "Location"}</p>
                    {loc.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                        <Star className="h-2.5 w-2.5 fill-primary" /> Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{loc.line}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-1">
                {!loc.is_default && (
                  <button type="button" onClick={() => setDefaultMutation.mutate(loc)} disabled={setDefaultMutation.isPending}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <Check className="h-3 w-3" /> Set default
                  </button>
                )}
                <button type="button" onClick={() => openEdit(loc)} aria-label="Edit location"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => deleteMutation.mutate(loc)} disabled={deleteMutation.isPending} aria-label="Delete location"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="secondary" className="w-full gap-2" onClick={openNew}>
        <Plus className="h-4 w-4" /> Add location
      </Button>
    </div>
  );
}

/**
 * Compact picker for checkout: lists saved locations as chips and calls
 * onPick with the composed line. Renders nothing when there are no locations.
 */
export function LocationPicker({ userId, onPick }: { userId?: string | null; onPick: (line: string) => void }) {
  const { data: locations = [] } = useUserLocations(userId);
  if (!locations.length) return null;
  return (
    <div className="mb-2">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Use a saved location</p>
      <div className="flex flex-wrap gap-2">
        {locations.map((loc) => (
          <button
            key={loc.id}
            type="button"
            onClick={() => onPick(loc.line)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5",
            )}
            title={loc.line}
          >
            <MapPin className="h-3.5 w-3.5 text-orange-500" />
            {loc.label || "Location"}
            {loc.is_default && <Star className="h-3 w-3 fill-primary text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
