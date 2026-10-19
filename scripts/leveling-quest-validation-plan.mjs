import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const MAXIMUM_INPUT_BYTES = 32_000_000;
const CONFIGURATION = {
  "named-target-unverified": {
    alias: "named-target",
    context: "Run on every one of the five grouped characters before the named target dies.",
    success:
      "Stable five-player roster, numeric target NPC, and a matching objective or required-loot transition.",
  },
  "personal-eligibility-unverified": {
    alias: "personal-eligibility",
    context:
      "Run on each affected race/class character immediately before accepting the quest normally.",
    success: "A matching QUEST_ACCEPTED and not-held to held transition on that exact character.",
  },
  "quest-lifecycle-unverified": {
    alias: "lifecycle",
    context:
      "Record separate acceptance, objective-completion, and turn-in sessions when one uninterrupted session is impractical.",
    success:
      "Observed acceptance/held, objective progress/completion, and turn-in/reward transitions across reviewed sessions.",
  },
  "pickup-level-conflict": {
    alias: "pickup-level",
    context:
      "Use a fresh eligible character at the lowest disputed level; an already over-level character cannot resolve the lower gate.",
    success: "A matching acceptance transition with exact character level and package build.",
  },
  "source-gate-conflict": {
    alias: "source-gate",
    context:
      "Use a character that intentionally has not satisfied the disputed older prerequisite, then accept normally if offered.",
    success: "A matching acceptance transition with the exact character and quest context.",
  },
};

async function boundedJson(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > MAXIMUM_INPUT_BYTES)
    throw new Error(`Input is not a bounded regular file: ${path}`);
  const raw = await readFile(path, "utf8");
  return { raw, value: JSON.parse(raw) };
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} is invalid.`);
  return value;
}

export function compileQuestValidationPlan(backlog, questEvidence, input) {
  const runtimeBuild = positiveInteger(input.runtimeBuild, "Runtime build");
  if (
    !backlog ||
    backlog.schema !== "campaign-evidence-backlog.v1" ||
    !Array.isArray(backlog.tasks)
  )
    throw new Error("Expected a campaign-evidence-backlog.v1 artifact.");
  if (
    !questEvidence ||
    questEvidence.schema !== "campaign-quest-source-evidence.v1" ||
    !Array.isArray(questEvidence.quests)
  )
    throw new Error("Expected a campaign-quest-source-evidence.v1 artifact.");
  const quests = new Map();
  for (const quest of questEvidence.quests) {
    const questId = positiveInteger(quest?.questId, "Quest evidence ID");
    if (quests.has(questId)) throw new Error(`Duplicate quest evidence ${questId}.`);
    quests.set(questId, quest);
  }
  const tasks = [];
  const keys = new Set();
  for (const task of backlog.tasks) {
    const configuration = CONFIGURATION[task?.code];
    if (!configuration) continue;
    const questId = positiveInteger(task.questId, "Quest validation ID");
    const key = `${task.code}:${questId}`;
    if (keys.has(key)) throw new Error(`Duplicate quest validation task ${key}.`);
    keys.add(key);
    const quest = quests.get(questId);
    const claims = Array.isArray(quest?.minimumClaims)
      ? quest.minimumClaims
          .filter(
            (claim) =>
              Number.isSafeInteger(claim?.value) &&
              claim.value > 0 &&
              typeof claim.source === "string" &&
              claim.source,
          )
          .map((claim) => ({ value: claim.value, source: claim.source }))
      : [];
    tasks.push({
      key,
      code: task.code,
      questId,
      title: typeof quest?.title === "string" ? quest.title : null,
      sourceUrl: typeof quest?.sourceUrl === "string" ? quest.sourceUrl : null,
      actionId: typeof task.actionId === "string" ? task.actionId : null,
      minimumLevel: Number.isSafeInteger(quest?.minimumLevel) ? quest.minimumLevel : null,
      questLevel: Number.isSafeInteger(quest?.questLevel) ? quest.questLevel : null,
      minimumClaims: claims,
      affectedEditions: Array.isArray(task.editions) ? [...task.editions].sort() : [],
      affectedPlayers: Array.isArray(task.players)
        ? [...task.players].sort((left, right) => left - right)
        : [],
      command: `/kfcguide validate ${questId} ${configuration.alias}`,
      context: configuration.context,
      successEvidence: configuration.success,
      steps: [
        "Enter the exact context described above without changing party membership.",
        `Run /kfcguide validate ${questId} ${configuration.alias} before the tested action.`,
        "Perform the quest action normally; the addon never performs it for you.",
        "Use /kfcguide validate capture after opening relevant gossip or selecting the named target when useful.",
        "Run /kfcguide validate stop after the observable transition, or discard if the session was contaminated.",
        "Run /reload before copying the private SavedVariables file for offline review.",
      ],
    });
  }
  tasks.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.questId - right.questId ||
      left.key.localeCompare(right.key),
  );
  if (!tasks.length) throw new Error("No quest-validation tasks were found.");
  return {
    schema: "campaign-quest-validation-plan.v1",
    sourceBuild: Number.isSafeInteger(backlog.targetBuild) ? backlog.targetBuild : null,
    runtimeBuild,
    backlogSha256: input.backlogSha256,
    questEvidenceSha256: input.questEvidenceSha256,
    summary: {
      tasks: tasks.length,
      quests: new Set(tasks.map((task) => task.questId)).size,
      byCode: Object.fromEntries(
        Object.keys(CONFIGURATION).map((code) => [
          code,
          tasks.filter((task) => task.code === code).length,
        ]),
      ),
      fivePlayerNamedTargetTasks: tasks.filter((task) => task.code === "named-target-unverified")
        .length,
      tasksMissingQuestMetadata: tasks.filter((task) => task.title === null).length,
    },
    tasks,
  };
}

async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, path);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (
    args.some((argument) => !/^--(?:backlog|quest-evidence|output|runtime-build)=.+/.test(argument))
  )
    throw new Error(
      "Use --backlog=file --quest-evidence=file --output=file --runtime-build=number.",
    );
  const value = (name) =>
    args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const backlogPath = value("backlog");
  const questEvidencePath = value("quest-evidence");
  const outputPath = value("output");
  const runtimeBuild = Number(value("runtime-build"));
  if (!backlogPath || !questEvidencePath || !outputPath)
    throw new Error("Backlog, quest evidence, output, and runtime build are required.");
  const [backlogInput, questEvidenceInput] = await Promise.all([
    boundedJson(resolve(backlogPath)),
    boundedJson(resolve(questEvidencePath)),
  ]);
  const sha256 = (raw) => createHash("sha256").update(raw).digest("hex");
  const plan = compileQuestValidationPlan(backlogInput.value, questEvidenceInput.value, {
    runtimeBuild,
    backlogSha256: sha256(backlogInput.raw),
    questEvidenceSha256: sha256(questEvidenceInput.raw),
  });
  const raw = `${JSON.stringify(plan, null, 2)}\n`;
  const output = resolve(outputPath);
  await writeAtomic(output, raw);
  process.stdout.write(`${JSON.stringify({ output, sha256: sha256(raw), ...plan.summary })}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Validation planning failed."}\n`,
    );
    process.exitCode = 1;
  });
