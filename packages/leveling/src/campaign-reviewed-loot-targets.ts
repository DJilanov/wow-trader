export interface ReviewedLootTarget {
  readonly chapterId: string;
  readonly stepId: string;
  readonly npcId: number;
  readonly name: string;
  readonly keys: readonly string[];
  readonly maximumEnemyLevel: number;
  readonly previous: string;
  readonly instruction: string;
  readonly sourceSuffix: string;
  readonly qualification?: {
    readonly targetBuild: number;
    readonly sourceArchiveSha256: string;
    readonly sourceVersion: string;
    readonly providerRevision: string;
    readonly providerNpcSha256: string;
    readonly minimumEnemyLevel: number;
    readonly areaId: number;
    readonly zone: string;
    readonly itemId: number;
    readonly quantity: number;
    readonly worldWaypoints: readonly (readonly [number, number])[];
  };
}

export const REVIEWED_LOOT_TARGETS: readonly ReviewedLootTarget[] = [
  {
    chapterId: "chapter-116-6-11-elwynn-forest",
    stepId: "source-step-0054",
    npcId: 475,
    name: "Kobold Tunneler",
    keys: ["60:1", "47:1"],
    maximumEnemyLevel: 6,
    previous:
      "Kill Kobold Tunnelers and Kobold Miners. Loot them for their Kobold Candles and Gold Dust",
    instruction:
      "Kill Kobold Tunnelers in Fargodeep Mine until the listed candle and gold dust objectives are complete.",
    sourceSuffix: "; reviewed Fargodeep Tunneler target",
  },
  {
    chapterId: "chapter-115-1-6-northshire",
    stepId: "source-step-0049",
    npcId: 38,
    name: "Defias Thug",
    keys: ["18:1"],
    maximumEnemyLevel: 4,
    previous: "Kill Defias Thugs. Loot them for their Red Burlap Bandanas",
    instruction:
      "Kill Defias Thugs along this Northshire vineyard loop until every player has 12 Red Burlap Bandanas.",
    sourceSuffix: "; reviewed Northshire bandana camp target",
    // Matching-build map geometry puts all seven source waypoints within four world units
    // of pinned NPC38 spawns. See the Northshire camp reference; the same-name stub is unchanged.
    qualification: {
      targetBuild: 70205,
      sourceArchiveSha256: "af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e",
      sourceVersion: "import-v2-a9efdb7422cc4125",
      providerRevision: "e9a67d1a2753a0e64c4c96bf7864788fac7b765f",
      providerNpcSha256: "9ef0d0c232ccfc58f8caeb28094e3332e8cf01e2c035ea5b2502c55301b81232",
      minimumEnemyLevel: 3,
      areaId: 12,
      zone: "1429",
      itemId: 752,
      quantity: 12,
      worldWaypoints: [
        [-288.51, -9068.87],
        [-388.47, -9001.28],
        [-288.51, -9068.87],
        [-335.02, -9108.91],
        [-376.67, -9073.73],
        [-388.47, -9001.28],
        [-333.97, -9028.59],
      ],
    },
  },
];
