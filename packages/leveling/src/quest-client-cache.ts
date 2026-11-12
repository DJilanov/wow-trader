import { z } from "zod";

export const CLIENT_QUEST_SOURCE_PATTERN =
  /^https:\/\/raw\.githubusercontent\.com\/JIVESCORP\/eg-link-output-wowf\/([a-f0-9]{40})\/data\/wow_classic_beta\/(1\.60\.1\.([1-9]\d{3,5}))\/quests\.enUS\.json$/;

const snapshotSchema = z.object({
  sourceUrl: z.url().max(1500),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  document: z.object({
    meta: z.object({
      product: z.literal("wow_classic_beta"),
      locale: z.literal("enUS"),
      dataset: z.literal("quests"),
      schemaVersion: z.literal(1),
      license: z.literal("CC BY 4.0"),
      clientBuild: z.string().regex(/^1\.60\.1\.[1-9]\d{3,5}$/),
      collectedOn: z.object({ first: z.iso.date(), last: z.iso.date() }),
      sources: z.number().int().positive(),
    }),
    // Each importer validates only its explicitly selected quest records.
    quests: z.record(z.string().regex(/^[1-9]\d{0,7}$/), z.unknown()),
  }),
});

export type ClientQuestSnapshots = readonly [
  z.infer<typeof snapshotSchema>,
  z.infer<typeof snapshotSchema>,
];

/** Validate a matching client cache and later corroboration from the same pinned revision. */
export function parseClientQuestSnapshots(
  input: readonly unknown[],
  targetBuild: number,
): ClientQuestSnapshots {
  const snapshots = z.tuple([snapshotSchema, snapshotSchema]).parse(input);
  const revisions: string[] = [],
    builds: number[] = [];
  for (const snapshot of snapshots) {
    const url = CLIENT_QUEST_SOURCE_PATTERN.exec(snapshot.sourceUrl);
    if (
      !url ||
      url[2] !== snapshot.document.meta.clientBuild ||
      snapshot.document.meta.collectedOn.first > snapshot.document.meta.collectedOn.last
    )
      throw new Error("Client quest URL, build or collection dates do not match.");
    revisions.push(url[1]!);
    builds.push(Number(url[3]));
  }
  if (
    revisions[0] !== revisions[1] ||
    snapshots[0]!.sourceSha256 === snapshots[1]!.sourceSha256 ||
    builds.filter((build) => build === targetBuild).length !== 1 ||
    builds.some((build) => build < targetBuild)
  )
    throw new Error(
      "Client quests need one matching build and a distinct later corroboration at the same pinned revision.",
    );
  return snapshots;
}
