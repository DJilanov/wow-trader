import { companionReleaseSchema } from "@wow-trader/contracts";
import { traderAccountBase } from "./trader-account.js";

export interface CompanionUpdate {
  readonly version: string;
  readonly available: boolean;
  readonly downloadUrl: string | null;
  readonly sha256: string | null;
  readonly signed: boolean;
}
export function compareReleaseVersions(left: string, right: string): number {
  const parse = (version: string): { core: number[]; pre: string[] | null } => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?$/.exec(version);
    if (!match) throw new Error("Invalid release version");
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      pre: match[4]?.split(".") ?? null,
    };
  };
  const a = parse(left),
    b = parse(right);
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i]! > b.core[i]! ? 1 : -1;
  if (a.pre === null || b.pre === null) return a.pre === b.pre ? 0 : a.pre === null ? 1 : -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i],
      y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x),
      ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
export async function checkCompanionRelease(
  endpoint: URL,
  currentVersion: string,
  platform: string,
  architecture: string,
): Promise<CompanionUpdate> {
  const url = traderAccountBase(endpoint);
  url.pathname = "/tools/downloads/companion/latest.json";
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Release check failed (HTTP ${response.status}).`);
  const release = companionReleaseSchema.parse(await response.json());
  const name = platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform;
  const asset = release.assets.find(
    (item) =>
      item.platform === name &&
      (item.architecture === architecture || item.architecture === "universal"),
  );
  return {
    version: release.version,
    available: compareReleaseVersions(release.version, currentVersion) > 0,
    downloadUrl: asset ? new URL(`/tools/downloads/companion/${asset.id}`, url).href : null,
    sha256: asset?.sha256 ?? null,
    signed: asset?.signed ?? false,
  };
}
