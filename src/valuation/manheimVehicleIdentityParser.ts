/**
 * Extract Year / Make / Model / Trim from Cox/Manheim MMR payload items.
 *
 * Legacy Manheim uses `description.{year,make,model,trim}` on items[0].
 * Cox Storefront may mirror that shape or expose flat fields on the item.
 */

export interface ManheimVehicleIdentity {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}

const EMPTY: ManheimVehicleIdentity = {
  year: null,
  make: null,
  model: null,
  trim: null,
};

export function extractManheimVehicleIdentity(payload: unknown): ManheimVehicleIdentity {
  const item = firstPayloadItem(payload);
  if (item === null) return EMPTY;

  const description =
    item.description && typeof item.description === "object" && !Array.isArray(item.description)
      ? (item.description as Record<string, unknown>)
      : null;

  const year =
    readYear(description?.year ?? item.year ?? item.modelYear) ??
    readYear(item.vehicleYear);
  const make =
    readString(description?.make ?? item.make ?? item.makeName) ??
    readString(item.manufacturer);
  const model =
    readString(description?.model ?? item.model ?? item.modelName) ??
    readString(item.series);
  const trim =
    readString(description?.trim ?? item.trim ?? item.bodyName ?? item.style) ??
    readString(description?.subSeries ?? item.subSeries);

  if (year === null && make === null && model === null && trim === null) {
    return EMPTY;
  }

  return { year, make, model, trim };
}

function firstPayloadItem(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidate = Array.isArray(record.items) && record.items.length > 0 ? record.items[0] : record;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100) return parsed;
  }
  return null;
}
