import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AddressDetails } from "@/lib/address";
import { tr } from "@/lib/tr";

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
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{tr("Address (optional)")}</p>
      <Input id="a-street" label={tr("Street")} value={value.street} onChange={set("street")}
        placeholder={tr("Street name")} leftIcon={<MapPin className="h-4 w-4 text-orange-500" />} />
      <div className="grid grid-cols-2 gap-3">
        <Input id="a-house" label={tr("House / building")} value={value.house} onChange={set("house")} placeholder={tr("e.g. 12B")} />
        <Input id="a-apt" label={tr("Apartment / unit")} value={value.apartment} onChange={set("apartment")} placeholder={tr("e.g. 4")} />
      </div>
      <Input id="a-area" label={tr("Area / neighborhood")} value={value.area} onChange={set("area")} placeholder={tr("e.g. West End")} />
      <Input id="a-notes" label={tr("Delivery notes")} value={value.notes} onChange={set("notes")} placeholder={tr("Gate code, landmark…")} />
    </div>
  );
}
