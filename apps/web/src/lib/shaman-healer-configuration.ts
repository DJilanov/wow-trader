import { deflateSync, inflateSync } from "fflate";
import {
  shamanHealerConfigurationSchema,
  type ShamanHealerConfiguration,
} from "@wow-trader/forever-data/shaman-healer-workspace";

const maxDecodedBytes = 65_536;
export function encodeShamanConfiguration(config: ShamanHealerConfiguration): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(shamanHealerConfigurationSchema.parse(config)),
  );
  if (bytes.length > maxDecodedBytes) throw new Error("This build is too large to share.");
  const value = btoa(String.fromCharCode(...deflateSync(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (value.length > 12_000) throw new Error("This build is too large to share.");
  return value;
}
export function decodeShamanConfiguration(value: string): ShamanHealerConfiguration {
  if (value.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("The shared build is malformed or too large.");
  const bytes = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );
  const decoded = inflateSync(bytes, { out: new Uint8Array(maxDecodedBytes + 1) });
  if (decoded.length > maxDecodedBytes) throw new Error("The shared build is too large.");
  return shamanHealerConfigurationSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
  );
}
export function shamanConfigurationStorageKey(release: string): string {
  return "kfc-healer-build:healing-shaman:v1:" + release;
}
