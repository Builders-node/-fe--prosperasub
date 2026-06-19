// Structured user address — stored as discrete columns on `user_profiles`, plus a
// composed single-line `default_delivery_address` kept for delivery consumers.

export interface AddressDetails {
  street: string;
  house: string;
  apartment: string;
  area: string;
  notes: string;
}

export const EMPTY_ADDRESS: AddressDetails = {
  street: "", house: "", apartment: "", area: "", notes: "",
};

/** Build a human-readable one-line address from the structured fields. */
export function composeAddress(a: AddressDetails): string {
  const parts = [
    a.street.trim(),
    a.house.trim() && `House ${a.house.trim()}`,
    a.apartment.trim() && `Apt ${a.apartment.trim()}`,
    a.area.trim(),
  ].filter(Boolean) as string[];
  let line = parts.join(", ");
  const notes = a.notes.trim();
  if (notes) line = line ? `${line} — ${notes}` : notes;
  return line;
}

/** Map a `user_profiles` row to structured fields (falls back to the legacy single line). */
export function addressFromProfile(p: Record<string, any> | null | undefined): AddressDetails {
  if (!p) return { ...EMPTY_ADDRESS };
  const hasStructured =
    p.address_street || p.address_house || p.address_apartment || p.address_area || p.address_notes;
  if (hasStructured) {
    return {
      street: p.address_street || "",
      house: p.address_house || "",
      apartment: p.address_apartment || "",
      area: p.address_area || "",
      notes: p.address_notes || "",
    };
  }
  // Legacy: a single free-text address → seed the street field.
  return { ...EMPTY_ADDRESS, street: p.default_delivery_address || "" };
}

/** Columns to write on save (structured fields + composed line for back-compat). */
export function addressPayload(a: AddressDetails) {
  return {
    address_street: a.street.trim() || null,
    address_house: a.house.trim() || null,
    address_apartment: a.apartment.trim() || null,
    address_area: a.area.trim() || null,
    address_notes: a.notes.trim() || null,
    default_delivery_address: composeAddress(a) || null,
  };
}

export function addressIsEqual(a: AddressDetails, b: AddressDetails): boolean {
  return (["street", "house", "apartment", "area", "notes"] as const)
    .every((k) => a[k].trim() === b[k].trim());
}
