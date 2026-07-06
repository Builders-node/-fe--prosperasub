import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Archive, RotateCcw, Trash2, Eye, EyeOff, X, ImagePlus, Upload, Link2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatUSD } from "@/lib/pricing";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/auditLog";
import type { RentalVehicle, RentalVehicleImage, RentalProvider } from "@/types/carRental";

type VehicleWithImages = RentalVehicle & { images: RentalVehicleImage[] };

const STATUS_COLORS: Record<string, string> = {
  public: "bg-green-500/15 text-green-400",
  private: "bg-yellow-500/15 text-yellow-400",
  archived: "bg-muted text-muted-foreground",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  seats: 5,
  transmission: "automatic" as const,
  fuel_type: "gasoline" as const,
  air_conditioning: true,
  luggage_capacity: 2,
  daily_price_cents: 0,
  weekly_price_cents: 0,
  biweekly_price_cents: 0,
  monthly_price_cents: 0,
  monthly_discount_pct: 0,
  provider_id: "" as string,
  status: "private" as const,
  sort_order: 0,
};

const CarRentalsVehicles = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const [editVehicle, setEditVehicle] = useState<VehicleWithImages | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<VehicleWithImages | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["admin-rental-vehicles"],
    queryFn: async () => {
      const { data: vData, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!vData || vData.length === 0) return [] as VehicleWithImages[];

      const ids = vData.map((v) => v.id);
      const { data: imgData } = await supabaseDb
        .from("rental_vehicle_images")
        .select("*")
        .in("vehicle_id", ids)
        .order("sort_order", { ascending: true });

      const imgMap: Record<string, RentalVehicleImage[]> = {};
      (imgData ?? []).forEach((img: RentalVehicleImage) => {
        if (!imgMap[img.vehicle_id]) imgMap[img.vehicle_id] = [];
        imgMap[img.vehicle_id].push(img);
      });

      return vData.map((v: RentalVehicle) => ({ ...v, images: imgMap[v.id] ?? [] })) as VehicleWithImages[];
    },
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["admin-rental-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_providers")
        .select("*")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalProvider[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: form.year,
        seats: form.seats,
        transmission: form.transmission,
        fuel_type: form.fuel_type,
        air_conditioning: form.air_conditioning,
        luggage_capacity: form.luggage_capacity,
        daily_price_cents: form.daily_price_cents,
        weekly_price_cents: form.weekly_price_cents,
        biweekly_price_cents: form.biweekly_price_cents,
        monthly_price_cents: form.monthly_price_cents,
        monthly_discount_pct: form.monthly_discount_pct,
        provider_id: form.provider_id || null,
        status: form.status,
        sort_order: form.sort_order,
      };

      let vehicleId = editVehicle?.id ?? "";

      if (isNew) {
        const { data, error } = await supabaseDb
          .from("rental_vehicles")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        vehicleId = data.id;
      } else {
        const { error } = await supabaseDb
          .from("rental_vehicles")
          .update(payload)
          .eq("id", vehicleId);
        if (error) throw error;
        // Delete existing images
        await supabaseDb.from("rental_vehicle_images").delete().eq("vehicle_id", vehicleId);
      }

      // Insert images
      if (imageUrls.length > 0) {
        await supabaseDb.from("rental_vehicle_images").insert(
          imageUrls.map((url, i) => ({ vehicle_id: vehicleId, url, sort_order: i })),
        );
      }

      if (userData?.id) {
        await logAuditEvent(userData.id, isNew ? "create" : "edit", "plan", vehicleId, {
          entity: "rental_vehicle", name: form.name,
        });
      }
      return vehicleId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
      qc.invalidateQueries({ queryKey: ["rental-vehicles-public"] });
      toast.success(isNew ? "Vehicle created" : "Vehicle updated");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabaseDb
        .from("rental_vehicles")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
      qc.invalidateQueries({ queryKey: ["rental-vehicles-public"] });
      toast.success("Status updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabaseDb.from("rental_vehicle_images").delete().eq("vehicle_id", id);
      const { error } = await supabaseDb.from("rental_vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rental-vehicles"] });
      qc.invalidateQueries({ queryKey: ["rental-vehicles-public"] });
      toast.success("Vehicle deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openNew = () => {
    setIsNew(true);
    setEditVehicle(null);
    setForm({ ...EMPTY_FORM });
    setImageUrls([]);
  };

  const openEdit = (v: VehicleWithImages) => {
    setIsNew(false);
    setEditVehicle(v);
    setForm({
      name: v.name,
      description: v.description ?? "",
      brand: v.brand,
      model: v.model,
      year: v.year,
      seats: v.seats,
      transmission: v.transmission as any,
      fuel_type: v.fuel_type as any,
      air_conditioning: v.air_conditioning,
      luggage_capacity: v.luggage_capacity,
      daily_price_cents: v.daily_price_cents,
      weekly_price_cents: v.weekly_price_cents ?? 0,
      biweekly_price_cents: v.biweekly_price_cents ?? 0,
      monthly_price_cents: v.monthly_price_cents ?? 0,
      monthly_discount_pct: Number(v.monthly_discount_pct),
      provider_id: v.provider_id ?? "",
      status: v.status as any,
      sort_order: v.sort_order,
    });
    setImageUrls(v.images.map((i) => i.url));
  };

  const closeDialog = () => {
    setEditVehicle(null);
    setIsNew(false);
    setNewImageUrl("");
    setShowUrlInput(false);
  };

  const addImage = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    setImageUrls((prev) => [...prev, url]);
    setNewImageUrl("");
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10 MB`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `vehicles/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabaseDb.storage
          .from("rental-vehicles")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }
        const { data } = supabaseDb.storage.from("rental-vehicles").getPublicUrl(path);
        if (data?.publicUrl) uploaded.push(data.publicUrl);
      }
      if (uploaded.length > 0) {
        setImageUrls((prev) => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} image${uploaded.length > 1 ? "s" : ""} uploaded`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filtered = vehicles.filter((v) => {
    if (filterStatus !== "all" && v.status !== filterStatus) return false;
    if (filterProvider !== "all") {
      if (filterProvider === "none") return !v.provider_id;
      return v.provider_id === filterProvider;
    }
    return true;
  });

  return (
    <SuperAdminLayout title="Car Rental — Vehicles">
      <div className="space-y-space-5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {["all", "public", "private", "archived"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filterStatus === s
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {providers.length > 0 && (
            <Select value={filterProvider} onValueChange={setFilterProvider}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="none">Unassigned</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex-1" />
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Add Vehicle
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No vehicles found.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((v) => {
              const thumb = v.images[0]?.url;
              return (
                <div key={v.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/30 text-xs">No img</div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground truncate">{v.name}</span>
                      <Badge className={`shrink-0 text-xs ${STATUS_COLORS[v.status]}`}>{v.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {v.brand} {v.model} · {v.year} · {formatUSD(v.daily_price_cents)}/day
                      {v.provider_id && providers.find((p) => p.id === v.provider_id)?.name && ` · ${providers.find((p) => p.id === v.provider_id)!.name}`}
                      {v.weekly_price_cents > 0 && ` · ${formatUSD(v.weekly_price_cents)}/wk`}
                      {v.biweekly_price_cents > 0 && ` · ${formatUSD(v.biweekly_price_cents)}/2wk`}
                      {v.monthly_price_cents > 0 && ` · ${formatUSD(v.monthly_price_cents)}/mo`}
                    </p>
                  </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-1 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
                    {/* Toggle public/private */}
                    {v.status !== "archived" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={v.status === "public" ? "Make private" : "Make public"}
                        onClick={() => changeStatusMutation.mutate({ id: v.id, status: v.status === "public" ? "private" : "public" })}
                      >
                        {v.status === "public" ? <Eye className="h-4 w-4 text-green-400" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    {v.status !== "archived" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Archive"
                        onClick={() => changeStatusMutation.mutate({ id: v.id, status: "archived" })}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Restore"
                        onClick={() => changeStatusMutation.mutate({ id: v.id, status: "private" })}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(v)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={isNew || !!editVehicle} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Vehicle" : "Edit Vehicle"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Toyota Hilux 2023" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>

            <Field label="Brand *" value={form.brand} onChange={(v) => setForm((f) => ({ ...f, brand: v }))} placeholder="Toyota" />
            <Field label="Model *" value={form.model} onChange={(v) => setForm((f) => ({ ...f, model: v }))} placeholder="Hilux" />
            <NumberField label="Year *" value={form.year} onChange={(v) => setForm((f) => ({ ...f, year: v }))} />
            <NumberField label="Seats *" value={form.seats} onChange={(v) => setForm((f) => ({ ...f, seats: v }))} />

            <div className="space-y-1.5">
              <Label>Transmission</Label>
              <Select value={form.transmission} onValueChange={(v) => setForm((f) => ({ ...f, transmission: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fuel type</Label>
              <Select value={form.fuel_type} onValueChange={(v) => setForm((f) => ({ ...f, fuel_type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <NumberField label="Luggage capacity (bags)" value={form.luggage_capacity} onChange={(v) => setForm((f) => ({ ...f, luggage_capacity: v }))} />
            <NumberField label="Sort order" value={form.sort_order} onChange={(v) => setForm((f) => ({ ...f, sort_order: v }))} />

            {/* Pricing section */}
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pricing (USD cents)</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Leave a period price at 0 to auto-calculate from the daily rate. Monthly discount % applies only when no monthly price is set.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <PriceField
                  label="1 Day"
                  cents={form.daily_price_cents}
                  onChange={(v) => setForm((f) => ({ ...f, daily_price_cents: v }))}
                />
                <PriceField
                  label="1 Week"
                  cents={form.weekly_price_cents}
                  onChange={(v) => setForm((f) => ({ ...f, weekly_price_cents: v }))}
                />
                <PriceField
                  label="2 Weeks"
                  cents={form.biweekly_price_cents}
                  onChange={(v) => setForm((f) => ({ ...f, biweekly_price_cents: v }))}
                />
                <PriceField
                  label="1 Month"
                  cents={form.monthly_price_cents}
                  onChange={(v) => setForm((f) => ({ ...f, monthly_price_cents: v }))}
                />
              </div>
              <div className="w-36">
                <NumberField
                  label="Monthly discount % (fallback)"
                  value={form.monthly_discount_pct}
                  onChange={(v) => setForm((f) => ({ ...f, monthly_discount_pct: v }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.air_conditioning} onCheckedChange={(c) => setForm((f) => ({ ...f, air_conditioning: c }))} />
              <Label>Air conditioning</Label>
            </div>

            {providers.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Provider</Label>
                <Select value={form.provider_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, provider_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No provider</SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Images */}
            <div className="space-y-2.5 sm:col-span-2">
              <Label>Vehicle photos</Label>

              {/* Upload dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center transition hover:border-primary/50 hover:bg-muted/30 disabled:opacity-60"
              >
                {uploading ? (
                  <>
                    <Spinner className="text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Uploading…</span>
                  </>
                ) : (
                  <>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                      <Upload className="h-5 w-5 text-primary" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">Click to upload photos</span>
                    <span className="text-xs text-muted-foreground">JPG, PNG, WEBP or GIF · up to 10 MB each · multiple allowed</span>
                  </>
                )}
              </button>

              {/* Thumbnails */}
              {imageUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">
                          Cover
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 hover:bg-destructive"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Optional: add by URL */}
              {showUrlInput ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImage(); } }}
                  />
                  <Button type="button" variant="secondary" onClick={addImage}>
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUrlInput(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  <Link2 className="h-3.5 w-3.5" /> or add by URL
                </button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.brand || !form.model}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and all its images. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={0}
      />
    </div>
  );
}

function PriceField({ label, cents, onChange }: { label: string; cents: number; onChange: (v: number) => void }) {
  const dollars = cents > 0 ? (cents / 100).toFixed(0) : "";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input
          type="number"
          className="pl-6"
          placeholder="0"
          value={dollars}
          onChange={(e) => {
            const val = e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 100);
            onChange(val);
          }}
          min={0}
        />
      </div>
      {cents > 0 && (
        <p className="text-[10px] text-muted-foreground">{cents} cents</p>
      )}
    </div>
  );
}

export default CarRentalsVehicles;
