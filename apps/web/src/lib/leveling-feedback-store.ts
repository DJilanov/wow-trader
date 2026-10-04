import { createHmac } from "node:crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { levelingFeedback } from "@wow-trader/db";
import { CHAPTER_REFERENCES, chapterEligibility } from "@wow-trader/leveling";
import { getDatabase } from "./database";
import { getImportedLevelingChapter } from "./leveling-archive";
import { getPublicChapter } from "./leveling-experience";
import { feedbackProfilesMatch, type LevelingFeedback } from "./leveling-feedback";

export async function validateFeedbackPosition(input: LevelingFeedback): Promise<boolean> {
  const chapter = CHAPTER_REFERENCES.find((entry) => entry.id === input.position.chapterId);
  if (!chapter || chapterEligibility(chapter, input.profile) === "exclude") return false;
  if (input.position.version.startsWith("import-")) {
    const guide = await getImportedLevelingChapter(chapter.id);
    return Boolean(
      guide &&
      guide.version === input.position.version &&
      guide.targetBuild === input.position.clientBuild &&
      guide.steps.some((step) => step.id === input.position.stepId),
    );
  }
  const route = getPublicChapter(chapter, input.profile);
  return Boolean(
    route &&
    route.version === input.position.version &&
    route.clientBuild === input.position.clientBuild &&
    route.steps.some((step) => step.id === input.position.stepId),
  );
}

export function feedbackClientHash(request: Request, now: Date = new Date()): string {
  const key = process.env.DATABASE_URL;
  if (!key) throw new Error("Feedback storage is unavailable");
  // The loopback-only app's trusted Nginx proxy overwrites X-Real-IP; never trust client X-Forwarded-For.
  const address = (request.headers.get("x-real-ip") ?? "local").slice(0, 128);
  return createHmac("sha256", key)
    .update(`kfc-leveling-feedback:${now.toISOString().slice(0, 10)}:${address}`)
    .digest("hex");
}

interface StoredFeedbackResult {
  readonly kind: "created" | "duplicate" | "limited" | "conflict";
  readonly id: string | null;
}
export async function storeLevelingFeedback(
  input: LevelingFeedback,
  clientHash: string,
): Promise<StoredFeedbackResult> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${clientHash}))`);
    const existingResult = async (): Promise<StoredFeedbackResult | null> => {
      const [existing] = await transaction
        .select()
        .from(levelingFeedback)
        .where(eq(levelingFeedback.submissionId, input.submissionId))
        .limit(1);
      if (!existing) return null;
      const same =
        existing.chapterId === input.position.chapterId &&
        existing.routeVersion === input.position.version &&
        existing.clientBuild === input.position.clientBuild &&
        existing.stepId === input.position.stepId &&
        existing.category === input.category &&
        existing.message === input.message &&
        feedbackProfilesMatch(existing.profile, input.profile);
      return { kind: same ? "duplicate" : "conflict", id: same ? existing.id : null };
    };
    const existing = await existingResult();
    if (existing) return existing;
    const [recent] = await transaction
      .select({ count: count() })
      .from(levelingFeedback)
      .where(
        and(
          eq(levelingFeedback.clientHash, clientHash),
          gt(levelingFeedback.createdAt, new Date(Date.now() - 30 * 60 * 1000)),
        ),
      );
    if ((recent?.count ?? 0) >= 5) return { kind: "limited", id: null };
    const [created] = await transaction
      .insert(levelingFeedback)
      .values({
        submissionId: input.submissionId,
        chapterId: input.position.chapterId,
        routeVersion: input.position.version,
        clientBuild: input.position.clientBuild,
        stepId: input.position.stepId,
        profile: input.profile,
        category: input.category,
        message: input.message,
        clientHash,
      })
      .onConflictDoNothing({ target: levelingFeedback.submissionId })
      .returning({ id: levelingFeedback.id });
    if (created) return { kind: "created", id: created.id };
    const raced = await existingResult();
    if (!raced) throw new Error("Report insert was not confirmed");
    return raced;
  });
}
