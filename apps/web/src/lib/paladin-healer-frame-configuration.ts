import { deflateSync, inflateSync } from "fflate";
import type { PaladinHealerFramePayload } from "@wow-trader/forever-data/paladin-healer-frame";
import type { PaladinHealingWorkload } from "@wow-trader/forever-data/paladin-healing-simulator";
import {
  configurationForPaladinHealerFrame,
  paladinHealerFrameWorkspaceConfigurationSchema,
  type PaladinHealerFrameWorkspaceConfiguration,
} from "@wow-trader/forever-data/paladin-healer-workspace";

interface EquippedResource {
  readonly owner: number;
  readonly utility: boolean;
  readonly activation: PaladinHealingWorkload["cooldowns"][number];
}
const equippedResources: readonly EquippedResource[] = [
  {
    owner: 18371,
    utility: false,
    activation: { spellId: 1302205, minimumMissingMana: 1250, requireHealingDemand: true },
  },
  {
    owner: 11819,
    utility: false,
    activation: { spellId: 15604, minimumMissingMana: 630, requireHealingDemand: true },
  },
  {
    owner: 13143,
    utility: false,
    activation: { spellId: 17252, minimumMissingMana: 1, requireHealingDemand: true },
  },
  {
    owner: 20512,
    utility: false,
    activation: { itemId: 20512, minimumMissingMana: 1500, requireHealingDemand: true },
  },
  { owner: 272439, utility: false, activation: { itemId: 272439, requireHealingDemand: true } },
  { owner: 272438, utility: false, activation: { itemId: 272438, requireHealingDemand: true } },
  {
    owner: 4381,
    utility: true,
    activation: {
      itemId: 4381,
      targetRaidIndex: 0,
      minimumMissingMana: 1500,
      requireHealingDemand: true,
    },
  },
  {
    owner: 18637,
    utility: true,
    activation: {
      itemId: 18637,
      targetRaidIndex: 0,
      minimumMissingMana: 1500,
      requireHealingDemand: true,
    },
  },
  { owner: 4262, utility: true, activation: { itemId: 4262, requireHealingDemand: true } },
  { owner: 8346, utility: true, activation: { itemId: 8346, requireHealingDemand: true } },
  {
    owner: 11808,
    utility: true,
    activation: { itemId: 11808, minimumMissingMana: 1000, requireHealingDemand: true },
  },
];

/** Update owned activations on an equipment edit without changing the saved model policies. */
export function paladinFrameEquipmentChange(
  config: PaladinHealerFrameWorkspaceConfiguration,
  gear: PaladinHealerFrameWorkspaceConfiguration["gear"],
  useUtilities: boolean,
  resourceOrder: "as-declared" | "rune-last",
): PaladinHealerFrameWorkspaceConfiguration {
  if (JSON.stringify(config.gear) === JSON.stringify(gear))
    return { ...config, gear: structuredClone(gear) };
  const old = new Set(config.gear.map((item) => item.id));
  const next = new Set(gear.map((item) => item.id));
  const key = (entry: PaladinHealingWorkload["cooldowns"][number]): number =>
    entry.itemId ?? entry.spellId ?? 0;
  const owners = new Map(
    equippedResources.map((resource) => [key(resource.activation), resource.owner]),
  );
  let cooldowns = config.workload.cooldowns.filter((entry): boolean => {
    const owner = owners.get(key(entry));
    return owner === undefined || next.has(owner);
  });
  for (const resource of equippedResources)
    if (
      !old.has(resource.owner) &&
      next.has(resource.owner) &&
      (!resource.utility || useUtilities) &&
      !cooldowns.some((entry): boolean => key(entry) === key(resource.activation))
    )
      cooldowns.push({ ...resource.activation });
  if (resourceOrder === "rune-last")
    cooldowns = [
      ...cooldowns.filter((entry) => entry.itemId !== 12662),
      ...cooldowns.filter((entry) => entry.itemId === 12662),
    ];
  return { ...config, gear: structuredClone(gear), workload: { ...config.workload, cooldowns } };
}

export function isOriginalPaladinFrameConfiguration(
  payload: PaladinHealerFramePayload,
  config: PaladinHealerFrameWorkspaceConfiguration,
): boolean {
  const source = configurationForPaladinHealerFrame(payload, config.release, config.scenarioId);
  return (["gear", "fields", "talentsString", "context", "consumes", "workload"] as const).every(
    (key): boolean => JSON.stringify(source[key]) === JSON.stringify(config[key]),
  );
}

const maxDecodedBytes = 65_536;
export function encodePaladinFrameConfiguration(
  config: PaladinHealerFrameWorkspaceConfiguration,
): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(paladinHealerFrameWorkspaceConfigurationSchema.parse(config)),
  );
  if (bytes.length > maxDecodedBytes) throw new Error("This build is too large to share.");
  const value = btoa(String.fromCharCode(...deflateSync(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (value.length > 12_000) throw new Error("This build is too large to share.");
  return value;
}

export function decodePaladinFrameConfiguration(
  value: string,
): PaladinHealerFrameWorkspaceConfiguration {
  if (value.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("The shared build is malformed or too large.");
  const bytes = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character): number => character.charCodeAt(0),
  );
  const decoded = inflateSync(bytes, { out: new Uint8Array(maxDecodedBytes + 1) });
  if (decoded.length > maxDecodedBytes) throw new Error("The shared build is too large.");
  return paladinHealerFrameWorkspaceConfigurationSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
  );
}

export function paladinFrameConfigurationStorageKey(release: string): string {
  return "kfc-healer-build:healing-paladin:v4:" + release;
}
