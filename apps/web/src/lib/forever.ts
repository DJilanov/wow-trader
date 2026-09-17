import type { ForeverExport, TalentClass } from "@wow-trader/forever-data";
import {
  getPublishedForeverSnapshot,
  type PublishedForeverSnapshot,
} from "@wow-trader/forever-data/server";

import { getDatabase } from "./database";

export interface ForeverClassDirectoryEntry {
  readonly name: string;
  readonly slug: string;
  readonly color: string;
  readonly icon: string;
  readonly treeNames: readonly string[];
  readonly talentCount: number;
  readonly completeTalentCount: number;
}

export interface ForeverClassPageData {
  readonly className: string;
  readonly classSlug: string;
  readonly color: string;
  readonly classData: TalentClass;
  readonly snapshot: PublishedForeverSnapshot;
}

const classOrder = [
  "Warrior",
  "Paladin",
  "Hunter",
  "Rogue",
  "Priest",
  "Shaman",
  "Mage",
  "Warlock",
  "Druid",
] as const;

const classColors: Readonly<Record<string, string>> = {
  Warrior: "#c69b6d",
  Paladin: "#f48cba",
  Hunter: "#aad372",
  Rogue: "#fff468",
  Priest: "#ffffff",
  Shaman: "#0070dd",
  Mage: "#3fc7eb",
  Warlock: "#8788ee",
  Druid: "#ff7c0a",
};

export async function getForeverSnapshot(
  checksum?: string,
): Promise<PublishedForeverSnapshot | null> {
  return getPublishedForeverSnapshot(getDatabase(), checksum);
}

export function getForeverClassDirectory(
  data: ForeverExport,
): readonly ForeverClassDirectoryEntry[] {
  return classOrder.flatMap((name) => {
    const classData = data.talents[name];
    if (!classData) return [];
    return [
      {
        name,
        slug: name.toLowerCase(),
        color: classColors[name] ?? "#d7913a",
        icon: classData.icon,
        treeNames: classData.trees.map(({ name: treeName }) => treeName),
        talentCount: classData.trees.reduce((total, tree) => total + tree.talents.length, 0),
        completeTalentCount: classData.trees.reduce(
          (total, tree) => total + tree.talents.filter(({ complete }) => complete).length,
          0,
        ),
      },
    ];
  });
}

export async function getForeverClassPageData(
  classSlug: string,
  checksum?: string,
): Promise<ForeverClassPageData | null> {
  const snapshot = await getForeverSnapshot(checksum);
  if (!snapshot) return null;
  const directory = getForeverClassDirectory(snapshot.data);
  const entry = directory.find(({ slug }) => slug === classSlug.toLowerCase());
  if (!entry) return null;
  const classData = snapshot.data.talents[entry.name];
  if (!classData) return null;
  return {
    className: entry.name,
    classSlug: entry.slug,
    color: entry.color,
    classData,
    snapshot,
  };
}

export function foreverAssetUrl(
  kind: "background" | "icon",
  key: number | string,
  snapshotChecksum: string,
): string {
  return `/api/forever-assets/${kind}/${encodeURIComponent(String(key))}?v=${snapshotChecksum.slice(0, 12)}`;
}

export function sourceText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export function formatSourceDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
