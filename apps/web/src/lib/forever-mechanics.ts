import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const reportSchema = z
  .object({
    schema: z.literal("forever-mechanics-report.v1"),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    file: z.string().regex(/^[a-f0-9]{64}\.json$/),
    clientVersion: z.string(),
    hotfixSha256: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime({ offset: true }),
    items: z.number().int().nonnegative(),
    itemsWithResolvedFields: z.number().int().nonnegative(),
    sets: z.number().int().nonnegative(),
    setEffects: z.number().int().nonnegative(),
    classes: z
      .array(
        z
          .object({
            name: z.string(),
            talents: z.number().int().nonnegative(),
            unresolvedLayouts: z.number().int().nonnegative(),
            unresolvedRankText: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(9),
    sourceIssues: z.array(z.string()).max(100),
    note: z.string(),
  })
  .strict();
export type ForeverMechanicsReport = z.infer<typeof reportSchema>;
export async function getForeverMechanicsReport(): Promise<ForeverMechanicsReport | null> {
  const directory = resolve(
    /* turbopackIgnore: true */ process.env.FOREVER_MECHANICS_ROOT ||
      "../../artifacts/forever-client-data",
  );
  try {
    const path = join(directory, "active.json");
    if ((await stat(path)).size > 1_000_000) throw new Error("Mechanics report too large");
    return reportSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
