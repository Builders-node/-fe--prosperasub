import type { AddressDetails } from "@/lib/address";
import { EMPTY_ADDRESS, composeAddress } from "@/lib/address";

export interface UserLocation extends AddressDetails {
  id: string;
  label: string;
  is_default: boolean;
  residence: string;
  line: string;
}

/** Compose a one-line address, prefixed with the residence/community when set. */
function composeLine(residence: string, a: AddressDetails): string {
  const base = composeAddress(a);
  const res = residence.trim();
  if (res && base) return `${res} · ${base}`;
  return res || base;
}

/** Map a `user_locations` DB row to a UserLocation. */
export function locationFromRow(r: Record<string, any>): UserLocation {
  const addr: AddressDetails = {
    street: r.street || "",
    house: r.house || "",
    apartment: r.apartment || "",
    area: r.area || "",
    notes: r.notes || "",
  };
  const residence = r.residence || "";
  return {
    id: r.id,
    label: r.label || "",
    is_default: !!r.is_default,
    residence,
    line: r.line || composeLine(residence, addr),
    ...addr,
  };
}

/** Columns to persist for a location row (address fields + composed line). */
export function locationPayload(label: string, a: AddressDetails, residence = "") {
  return {
    label: label.trim() || null,
    residence: residence.trim() || null,
    street: a.street.trim() || null,
    house: a.house.trim() || null,
    apartment: a.apartment.trim() || null,
    area: a.area.trim() || null,
    notes: a.notes.trim() || null,
    line: composeLine(residence, a) || null,
  };
}

export const EMPTY_LOCATION_ADDRESS = EMPTY_ADDRESS;
