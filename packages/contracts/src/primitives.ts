import { z } from "zod";

export const wowIdSchema = z.number().int().positive().max(4_294_967_295);

export const nonNegativeCopperSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Money must be an unsigned integer copper string");

export const positiveCopperSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Price must be a positive integer copper string");

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase SHA-256 hash");

export const localeSchema = z.string().regex(/^[a-z]{2}[A-Z]{2}$/, "Expected a WoW locale");

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode a non-finite number");
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}
