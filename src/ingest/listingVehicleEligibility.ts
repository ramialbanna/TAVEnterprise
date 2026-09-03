/**
 * Item 72 action 6 — ineligible inventory. Make-level filters miss these;
 * they are model-level (Honda cars vs SCL500, Ford F-150 vs F-550).
 */

export type IneligibleVehicleMatch = {
  kind: "motorcycle" | "scooter" | "commercial_chassis";
  matched: string;
};

type ListingIdentity = {
  make?: string | null;
  model?: string | null;
  title?: string | null;
  description?: string | null;
};

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function haystack(input: ListingIdentity): string {
  return [input.make, input.model, input.title, input.description].filter(Boolean).join(" ");
}

const MOTORCYCLE_SQUASHED: readonly string[] = [
  "k1600",
  "k1600gt",
  "k1600gtl",
  "f750gs",
  "f850gs",
  "r1250gs",
  "r1250rt",
  "s1000rr",
  "s1000r",
  "g310r",
  "g310gs",
  "nc750",
  "nc750x",
  "nc750s",
  "scl500",
  "cbr300",
  "cbr600",
  "cbr1000",
  "goldwing",
  "grom",
  "gsxr",
  "hayabusa",
  "ninja400",
  "ninja650",
  "mt07",
  "mt09",
];

const MOTORCYCLE_PHRASE =
  /\b(?:k\s*1600(?:\s*gtl?|\s*b)?|f\s*750\s*gs|f\s*850\s*gs|r\s*1250\s*(?:gs|rt)|s\s*1000\s*rr|nc\s*750(?:x|s)?|scl\s*500|cbr\s*\d{3,4}|africa\s*twin|gold\s*wing|dirt\s*bike|motorcycle|motorbike)\b/i;

const SCOOTER_PHRASE = /\b(?:pcx\s*\d{0,3}|vespa|scooter)\b/i;

const FORD_COMMERCIAL_SQUASHED: readonly string[] = ["f550", "f650", "f750", "e350", "e450", "e550"];

function firstSquashedHit(text: string, needles: readonly string[]): string | null {
  const squashed = squash(text);
  for (const needle of needles) {
    if (squashed.includes(needle)) return needle;
  }
  return null;
}

function commercialChassis(input: ListingIdentity): IneligibleVehicleMatch | null {
  const model = squash(input.model ?? "");
  const make = squash(input.make ?? "");

  if (make === "ford") {
    for (const token of FORD_COMMERCIAL_SQUASHED) {
      if (model === token || model.startsWith(token)) {
        return { kind: "commercial_chassis", matched: token };
      }
    }
    const titleHit = firstSquashedHit(input.title ?? "", FORD_COMMERCIAL_SQUASHED);
    if (titleHit) return { kind: "commercial_chassis", matched: titleHit };
  }

  if ((make === "ram" || make === "dodge") && (model === "4500" || model === "5500")) {
    return { kind: "commercial_chassis", matched: `${input.make} ${input.model}` };
  }

  const ramChassis = /\b(?:ram|dodge)\s+5500\b/i.exec(`${input.title ?? ""} ${input.model ?? ""}`);
  if (ramChassis) {
    return { kind: "commercial_chassis", matched: ramChassis[0] };
  }

  return null;
}

export function matchIneligibleVehicle(input: ListingIdentity): IneligibleVehicleMatch | null {
  const text = haystack(input);
  if (!text.trim()) return null;

  const squashedHit = firstSquashedHit(`${input.model ?? ""} ${input.title ?? ""}`, MOTORCYCLE_SQUASHED);
  if (squashedHit) {
    return { kind: "motorcycle", matched: squashedHit };
  }

  const moto = text.match(MOTORCYCLE_PHRASE);
  if (moto?.[0]) {
    return { kind: "motorcycle", matched: moto[0].trim() };
  }

  const scooter = text.match(SCOOTER_PHRASE);
  if (scooter?.[0]) {
    return { kind: "scooter", matched: scooter[0].trim() };
  }

  return commercialChassis(input);
}

export function listingIsIneligibleVehicle(input: ListingIdentity): IneligibleVehicleMatch | null {
  return matchIneligibleVehicle(input);
}
