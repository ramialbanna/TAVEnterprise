const PLACEHOLDER_VALUES = new Set([
  "",
  "replace_me",
  "REPLACE_ME",
  "changeme",
  "CHANGE_ME",
]);

export function isConfiguredSecret(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (PLACEHOLDER_VALUES.has(trimmed)) return false;
  if (trimmed.startsWith("REPLACE_WITH_")) return false;
  return true;
}

