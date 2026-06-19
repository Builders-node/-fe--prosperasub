import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AddressDetails } from "@/lib/address";

/** Shared structured-address inputs used by both the user and admin profile modals. */
export function AddressFields({
  value,
  onChange,
}: {
  value: AddressDetails;
  onChange: (next: AddressDetails) => void;
}) {
  const set = (k: keyof AddressDetails) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Address (optional)</p>
      <Input id="a-street" label="Street" value={value.street} onChange={set("street")}
        placeholder="Street name" leftIcon={<MapPin className="h-4 w-4 text-orange-500" />} />
      <div className="grid grid-cols-2 gap-3">
        <Input id="a-house" label="House / building" value={value.house} onChange={set("house")} placeholder="e.g. 12B" />
        <Input id="a-apt" label="Apartment / unit" value={value.apartment} onChange={set("apartment")} placeholder="e.g. 4" />
      </div>
      <Input id="a-area" label="Area / neighborhood" value={value.area} onChange={set("area")} placeholder="e.g. West End" />
      <Input id="a-notes" label="Delivery notes" value={value.notes} onChange={set("notes")} placeholder="Gate code, landmark…" />
    </div>
  );
}
