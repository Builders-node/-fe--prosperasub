/**
 * Canonical delivery address schema used across the entire app.
 * All components must use this type - never inline objects or raw strings.
 */
export interface DeliveryAddress {
  /** Display-friendly address string (e.g. "Beach Club Pristine Bay") */
  address: string;
  /** Optional delivery notes for the driver */
  notes?: string;
  /** GPS latitude (optional) */
  lat?: number;
  /** GPS longitude (optional) */
  lng?: number;
}

/**
 * Supported delivery locations
 * Used in address selection dropdowns
 */
export const SUPPORTED_DELIVERY_LOCATIONS = [
  "Beach Club Pristine Bay",
  "Las Verandas Pristine Bay", 
  "Duna Tower Beta District",
] as const;

export type SupportedDeliveryLocation = typeof SUPPORTED_DELIVERY_LOCATIONS[number];

/**
 * Helper to safely extract address string from any delivery address shape
 */
export function getAddressString(address: DeliveryAddress | string | null | undefined): string {
  if (!address) return "";
  if (typeof address === "string") return address;
  return address.address || "";
}

/**
 * Helper to normalize any address input to canonical DeliveryAddress shape
 */
export function normalizeDeliveryAddress(
  input: unknown
): DeliveryAddress | null {
  if (!input) return null;
  
  // Handle primitive types that can't be addresses
  if (typeof input === "number" || typeof input === "boolean") {
    return null;
  }
  
  // Raw string
  if (typeof input === "string") {
    return input ? { address: input } : null;
  }
  
  // Object shapes
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    
    // Canonical shape with address property
    if (typeof obj.address === "string" && obj.address) {
      return {
        address: obj.address,
        notes: typeof obj.notes === "string" ? obj.notes : undefined,
        lat: typeof obj.lat === "number" ? obj.lat : undefined,
        lng: typeof obj.lng === "number" ? obj.lng : undefined,
      };
    }
    
    // Legacy shapes
    const addressStr = 
      (typeof obj.full === "string" && obj.full) ||
      (typeof obj.street === "string" && obj.street) ||
      "";
    
    if (addressStr) {
      return { address: addressStr };
    }
  }
  
  return null;
}
