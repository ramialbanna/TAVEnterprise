/**
 * Drop listings written in Spanish before Claude or MMR.
 * "el" and "la" never count. One Spanish word does not drop the car.
 */

export type SpanishListingMatch = {
  matched: string[];
};

const PHRASES: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "se vende", re: /\bse vende\b/ },
  { id: "en venta", re: /\ben venta\b/ },
  { id: "como nuevo", re: /\bcomo nuev[oa]s?\b/ },
  { id: "titulo limpio", re: /\btitulo limpi[oa]s?\b/ },
  { id: "hablo espanol", re: /\bhablo espanol\b/ },
];

/** Prepositions and fillers. Several of these still do not drop a listing. */
const FUNCTION_WORDS = new Set([
  "que",
  "para",
  "por",
  "con",
  "una",
  "del",
  "como",
  "pero",
  "porque",
  "cuando",
  "donde",
  "muy",
  "mas",
  "tiene",
  "esta",
  "poco",
  "todo",
  "toda",
  "todos",
  "desde",
  "hasta",
  "sobre",
]);

/** Words that do not show up in an English car ad. */
const CONTENT_WORDS = new Set([
  "vendo",
  "vende",
  "venta",
  "titulo",
  "limpio",
  "limpia",
  "millas",
  "dueno",
  "duena",
  "unico",
  "unica",
  "camioneta",
  "enganche",
  "llantas",
  "rines",
  "factura",
  "placas",
  "precio",
  "trato",
  "funciona",
  "preguntas",
  "excelente",
  "condiciones",
  "negociable",
  "automatico",
  "automatica",
  "transmision",
  "kilometraje",
  "efectivo",
  "recibo",
  "recibimos",
  "cambio",
  "bueno",
  "buena",
  "carro",
  "troca",
  "troka",
  "verificado",
  "nunca",
  "siempre",
  "estoy",
  "anos",
  "cuatro",
  "puertas",
  "cilindros",
  "tambien",
  "nuevo",
  "nueva",
  "espanol",
  "hablo",
  "gasolina",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokens(text: string): string[] {
  return text.match(/[a-z]+/g) ?? [];
}

export function matchSpanishListing(input: {
  title?: string | null;
  description?: string | null;
}): SpanishListingMatch | null {
  const text = stripAccents([input.title, input.description].filter(Boolean).join("\n")).toLowerCase();
  if (!text.trim()) return null;

  const content: string[] = [];
  const fillers: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens(text)) {
    if (token === "el" || token === "la" || seen.has(token)) continue;
    seen.add(token);
    if (CONTENT_WORDS.has(token)) content.push(token);
    else if (FUNCTION_WORDS.has(token)) fillers.push(token);
  }

  if (content.length >= 2 || (content.length >= 1 && fillers.length >= 1)) {
    return { matched: [...content, ...fillers].slice(0, 8) };
  }

  for (const phrase of PHRASES) {
    if (phrase.re.test(text)) return { matched: [phrase.id] };
  }
  return null;
}
