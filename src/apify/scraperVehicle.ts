/**
 * §81 — read raidr-api/custom-vehicle-scraper build 0.0.6 and the older
 * extraListingData shape. Pure. Callers decide what to persist.
 */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const asText = String(value);
    return asText.length > 0 ? asText : undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const MESSY_LABEL =
  /[/\\|$]|\b(?:down|pay|oac|cash|financ\w*|miles?|mileage|call|text)\b|\b(?:19|20)\d{2}\b/i;

const BODY_STYLE_ONLY =
  /^(?:sport utility|suv|sedan|coupe|hatchback|convertible|van|wagon|pickup|truck|minivan|crossover|roadster|crew cab|mega cab|double cab|quad cab|regular cab|cargo van|passenger van|supercrew|supercab)(?:\s+\d+d)?(?:\s+\d+(?:\s+\d+\/\d+)?\s*ft\.?)?$/i;

/** A Facebook make/model token that is a name, not a pasted title or a body style. */
export function isCleanVehicleLabel(value: string, kind: "make" | "model"): boolean {
  const text = value.trim();
  const max = kind === "make" ? 32 : 48;
  if (text.length < 2 || text.length > max) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (MESSY_LABEL.test(text)) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9 .&'-]*$/.test(text)) return false;
  if (kind === "make" && /\d/.test(text)) return false;
  if (kind === "model" && isBodyStyleOnly(text)) return false;
  return true;
}

/** "Sport Utility 4D" is not a Cox trim. "S Sport Utility 4D" is not body-only. */
export function isBodyStyleOnly(value: string): boolean {
  return BODY_STYLE_ONLY.test(value.trim());
}

export type ScraperVehicle = {
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  /** Structured odometer object was present, even when the unit was not miles. */
  odometerPresent: boolean;
  vin?: string;
  description?: string;
  condition?: string;
  city?: string;
  state?: string;
  sellerName?: string;
  /** Numeric Marketplace id, or a pfbid token. Only digits become a profile URL. */
  sellerId?: string;
  sellerType?: string;
  dealershipName?: string;
  /** Both scraper make and model are safe to use. Trim is not part of this. */
  cleanYmms: boolean;
  /** Dealership name or a seller type that says dealership. PRIVATE_SELLER is not. */
  dealership: boolean;
};

const EMPTY_VEHICLE: ScraperVehicle = {
  odometerPresent: false,
  cleanYmms: false,
  dealership: false,
};

function isDealership(sellerType: string | undefined, dealershipName: string | undefined): boolean {
  if (dealershipName) return true;
  if (!sellerType) return false;
  const type = sellerType.trim().toUpperCase();
  if (type === "PRIVATE_SELLER" || type === "PRIVATE" || type === "OWNER") return false;
  return type.includes("DEALER");
}

function readMiles(odo: Record<string, unknown> | undefined): { present: boolean; mileage?: number } {
  if (!odo) return { present: false };
  const unit = typeof odo.unit === "string" ? odo.unit.trim().toUpperCase() : "";
  const value = odo.value;
  const miles =
    (unit === "MILES" || unit === "MI") &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
      ? value
      : undefined;
  return { present: true, ...(miles !== undefined && { mileage: miles }) };
}

/**
 * Vehicle and seller fields from `details` (build 0.0.6) or `extraListingData`.
 * Returns an empty result when neither object is present.
 */
export function readScraperVehicle(item: unknown): ScraperVehicle {
  const rec = asRecord(item);
  if (!rec) return EMPTY_VEHICLE;
  const detail = asRecord(rec.details) ?? asRecord(rec.extraListingData);
  if (!detail) return EMPTY_VEHICLE;

  const vehicle = asRecord(detail.vehicle) ?? detail;
  const odo =
    asRecord(vehicle.odometer) ??
    asRecord(vehicle.vehicle_odometer_data) ??
    asRecord(detail.vehicle_odometer_data);
  const miles = readMiles(odo);

  const make =
    readString(vehicle.makeDisplayName) ??
    readString(vehicle.vehicle_make_display_name) ??
    readString(detail.vehicle_make_display_name);
  const model =
    readString(vehicle.modelDisplayName) ??
    readString(vehicle.vehicle_model_display_name) ??
    readString(detail.vehicle_model_display_name);
  const trim =
    readString(vehicle.trimDisplayName) ??
    readString(vehicle.vehicle_trim_display_name) ??
    readString(detail.vehicle_trim_display_name);
  const vin =
    readString(vehicle.identificationNumber) ??
    readString(detail.vehicle_identification_number);

  const seller = asRecord(detail.seller);
  const sellerType = readString(vehicle.sellerType);
  const dealershipName = readString(vehicle.dealershipName);

  const loc = asRecord(detail.location);
  const cleanYmms = Boolean(
    make && model && isCleanVehicleLabel(make, "make") && isCleanVehicleLabel(model, "model"),
  );

  return {
    ...(make && { make }),
    ...(model && { model }),
    ...(trim && { trim }),
    ...(miles.mileage !== undefined && { mileage: miles.mileage }),
    odometerPresent: miles.present,
    ...(vin && { vin }),
    ...(readString(detail.description) && { description: readString(detail.description) }),
    ...(readString(detail.condition) && { condition: readString(detail.condition) }),
    ...(readString(loc?.city) && { city: readString(loc?.city) }),
    ...(readString(loc?.state) && { state: readString(loc?.state) }),
    ...(readString(seller?.name) && { sellerName: readString(seller?.name) }),
    ...(readString(seller?.id) && { sellerId: readString(seller?.id) }),
    ...(sellerType && { sellerType }),
    ...(dealershipName && { dealershipName }),
    cleanYmms,
    dealership: isDealership(sellerType, dealershipName),
  };
}
