import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertCampaignRouteLock, campaignActionLockText,
  campaignRouteLockSchema, campaignRouteValidationSchema,
} from "../packages/leveling/dist/index.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => JSON.stringify(value, null, 2) + "\n";

async function writeImmutable(file, bytes) {
  try {
    await writeFile(file, bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (await readFile(file, "utf8") !== bytes)
      throw new Error(`Refusing to overwrite an existing route lock artifact: ${file}`);
  }
}

/**
 * @param {string} directory
 * @param {{plan: import('../packages/leveling/dist/index.js').CampaignPlan,
 * party: import('../packages/leveling/dist/index.js').CampaignRouteLock['party'],
 * validation: import('../packages/leveling/dist/index.js').CampaignRouteValidation}} input
 * @returns {Promise<import('../packages/leveling/dist/index.js').CampaignRouteLock>}
 */
export async function sealCampaignRoute(directory, input) {
  return writeCampaignRoute(directory, input);
}

async function writeCampaignRoute(directory, input, previous) {
  const validation = campaignRouteValidationSchema.parse(input.validation);
  const bytes = jsonBytes({ schema: "campaign-route-prefix.v1", plan: input.plan });
  const routeSha256 = sha(bytes);
  if (routeSha256 !== validation.routeSha256)
    throw new Error("Validation does not describe this exact route payload.");
  const boundary = input.plan.actions.at(-1);
  if (!boundary || boundary.id !== validation.boundaryActionId)
    throw new Error("Route payload must end at the validated handoff.");
  for (const entry of validation.forecastCases)
    if (JSON.stringify(entry.handoff.progress.members.map(({ raceId, classSlug }) => ({ raceId, classSlug }))) !==
      JSON.stringify(input.party.map(({ raceId, classSlug }) => ({ raceId, classSlug }))))
      throw new Error("Validation party differs from the locked party.");
  const validationBytes = jsonBytes(validation), validationSha256 = sha(validationBytes);
  if (previous && (previous.payload.sha256 !== routeSha256 || previous.targetLevel !== validation.targetLevel ||
    JSON.stringify(previous.party) !== JSON.stringify(input.party)))
    throw new Error("Revalidation must preserve the exact approved payload, target and party.");
  const lock = campaignRouteLockSchema.parse({
    schema: "campaign-route-lock.v1", blockSize: 10, targetLevel: validation.targetLevel,
    race: input.plan.race, leaderClass: input.plan.leaderClass, targetBuild: input.plan.targetBuild,
    sourceArchiveSha256: input.plan.sourceArchiveSha256, party: input.party,
    boundaryActionId: boundary.id,
    actions: input.plan.actions.map((action) => ({ id: action.id, sha256: sha(campaignActionLockText(action)) })),
    payload: { file: `route-${routeSha256}.json`, sha256: routeSha256 },
    validation: { file: `validation-${validationSha256}.json`, sha256: validationSha256,
      engineSha256: validation.engineSha256, referenceSha256: validation.referenceSha256,
      forecastCases: validation.forecastCases.length, nativeCases: validation.nativeCases.length,
      questLogCapacity: 40, kind: validation.kind },
  });
  await mkdir(directory, { recursive: true });
  const lockFile = join(directory, previous
    ? `through-${validation.targetLevel}.validation-${validationSha256}.lock.json`
    : `through-${validation.targetLevel}.lock.json`);
  try {
    const previous = await readFile(lockFile, "utf8");
    if (previous !== jsonBytes(lock)) throw new Error(`Existing level-${validation.targetLevel} lock needs explicit revision; it will not be replaced.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeImmutable(join(directory, lock.payload.file), bytes);
  await writeImmutable(join(directory, lock.validation.file), validationBytes);
  await writeImmutable(lockFile, jsonBytes(lock));
  return lock;
}

/**
 * Issue a new certificate without replacing the approved payload or original certificate.
 * @param {string} directory
 * @param {Parameters<typeof sealCampaignRoute>[1]} input
 * @param {string} previousLockFile
 * @returns {Promise<{lock: import('../packages/leveling/dist/index.js').CampaignRouteLock, file: string}>}
 */
export async function revalidateCampaignRoute(directory, input, previousLockFile) {
  const manifest = campaignRouteLockSchema.parse(JSON.parse(await readFile(previousLockFile, "utf8")));
  // Stored fingerprints establish old artifact integrity, not current model qualification.
  const previous = await verifyCampaignRouteFile(previousLockFile, {
    engineSha256: manifest.validation.engineSha256, referenceSha256: manifest.validation.referenceSha256,
  });
  const lock = await writeCampaignRoute(directory, input, previous);
  return { lock, file: join(directory, `through-${lock.targetLevel}.validation-${lock.validation.sha256}.lock.json`) };
}

/**
 * @param {string} lockFile
 * @param {{engineSha256: string, referenceSha256: string,
 * plan?: import('../packages/leveling/dist/index.js').CampaignPlan}} current
 * @returns {Promise<import('../packages/leveling/dist/index.js').CampaignRouteLock>}
 */
export async function verifyCampaignRouteFile(lockFile, current) {
  const lock = campaignRouteLockSchema.parse(JSON.parse(await readFile(lockFile, "utf8")));
  const directory = resolve(lockFile, "..");
  const payloadBytes = await readFile(join(directory, lock.payload.file));
  const validationBytes = await readFile(join(directory, lock.validation.file));
  if (sha(payloadBytes) !== lock.payload.sha256 || sha(validationBytes) !== lock.validation.sha256)
    throw new Error("Route payload or validation certificate hash mismatch.");
  const payload = JSON.parse(payloadBytes), validation = campaignRouteValidationSchema.parse(JSON.parse(validationBytes));
  if (payload.schema !== "campaign-route-prefix.v1" || validation.routeSha256 !== lock.payload.sha256 ||
    validation.targetLevel !== lock.targetLevel || validation.boundaryActionId !== lock.boundaryActionId ||
    validation.engineSha256 !== lock.validation.engineSha256 || validation.referenceSha256 !== lock.validation.referenceSha256 ||
    validation.forecastCases.length !== lock.validation.forecastCases || validation.nativeCases.length !== lock.validation.nativeCases)
    throw new Error("Route manifest and validation certificate disagree.");
  const context = { lock, party: lock.party, hashText: sha, ...current };
  assertCampaignRouteLock(payload.plan, context);
  if (payload.plan.actions.length !== lock.actions.length)
    throw new Error("Route payload contains actions beyond its locked handoff.");
  if (current.plan) assertCampaignRouteLock(current.plan, context);
  return lock;
}

/**
 * Verify the current compiled engine and reference files before trusting a stored certificate.
 * @param {string} lockFile
 * @param {string} contextFile
 * @param {import('../packages/leveling/dist/index.js').CampaignPlan | undefined} plan
 * @returns {Promise<import('../packages/leveling/dist/index.js').CampaignRouteLock>}
 */
export async function verifyCampaignRouteContext(lockFile, contextFile, plan) {
  const context = JSON.parse(await readFile(contextFile, "utf8"));
  if (context.schema !== "campaign-route-context.v1" || typeof context.engineDirectory !== "string" ||
    !context.enginePins || !context.referenceFiles || !context.references)
    throw new Error("Invalid route validation context.");
  for (const [file, digest] of Object.entries(context.enginePins)) {
    if (!/^[a-zA-Z0-9_.-]+\.js$/.test(file) || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error("Invalid route engine pin.");
    if (sha(await readFile(join(context.engineDirectory, file))) !== digest)
      throw new Error(`Route needs revalidation: compiled engine changed at ${file}.`);
  }
  for (const [file, digest] of Object.entries(context.referenceFiles)) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid route reference pin.");
    if (sha(await readFile(file)) !== digest)
      throw new Error(`Route needs revalidation: reference input changed at ${file}.`);
  }
  return verifyCampaignRouteFile(lockFile, {
    engineSha256: sha(JSON.stringify(context.enginePins)),
    referenceSha256: sha(JSON.stringify(context.references)),
    ...(plan ? { plan } : {}),
  });
}

async function main() {
  const [command, file, engineSha256, referenceSha256, planFile] = process.argv.slice(2);
  if (command === "check" && file && engineSha256) {
    const plan = referenceSha256 ? JSON.parse(await readFile(referenceSha256, "utf8")) : undefined;
    const lock = await verifyCampaignRouteContext(file, engineSha256, plan);
    console.log(JSON.stringify({ verified: true, targetLevel: lock.targetLevel, actions: lock.actions.length, kind: lock.validation.kind }));
    return;
  }
  if (command !== "verify" || !file || !engineSha256 || !referenceSha256)
    throw new Error("Usage: node scripts/leveling-route-lock.mjs check <lock.json> <context.json> [candidate-plan.json]; or verify <lock.json> <current-engine-sha256> <current-reference-sha256> [candidate-plan.json]");
  const plan = planFile ? JSON.parse(await readFile(planFile, "utf8")) : undefined;
  const lock = await verifyCampaignRouteFile(file, { engineSha256, referenceSha256, ...(plan ? { plan } : {}) });
  console.log(JSON.stringify({ verified: true, targetLevel: lock.targetLevel, actions: lock.actions.length, kind: lock.validation.kind }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
