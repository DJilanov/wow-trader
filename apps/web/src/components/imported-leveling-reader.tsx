"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CHAPTER_REFERENCES,
  LEVELING_EVIDENCE,
  findChapterTargets,
  getChapterLabel,
  getGuideStepView,
  getLevelingRace,
  type CharacterProfile,
  type ChapterReference,
  type ImportedChapter,
  type ImportedDirective,
  type GuideStepView,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingEntityLinks } from "./leveling-entity-links";
import { LevelingStepProgress } from "./leveling-step-progress";
import { LevelingZoneMap } from "./leveling-zone-map";
import { LevelingReaderWorkspace } from "./leveling-reader-workspace";
import { LevelingQuestCard } from "./leveling-quest-card";
import { useLevelingReaderSelection } from "./leveling-reader-selection";
import type { LevelingChapterMaps } from "../lib/leveling-map-data";
import {
  chapterProgressKey,
  levelingChapterPath,
  levelingDashboardPath,
  profileSummary,
  WESTFALL_CHAPTER_ID,
  type ImportedProgressDefinition,
  type StepProgress,
} from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";

interface ImportedReaderProps {
  readonly chapter: ChapterReference;
  readonly guide: ImportedChapter;
  readonly defaultProfile: CharacterProfile;
  readonly maps: LevelingChapterMaps;
}
const describedActions: Readonly<Record<string, string>> = {
  ".accept": "Accept quest",
  ".turnin": "Turn in quest",
  ".complete": "Complete objective",
  ".collect": "Collect",
  ".train": "Train",
  ".trainer": "Visit trainer",
  ".vendor": "Visit vendor",
  ".use": "Use item",
  ".cast": "Cast",
  ".usespell": "Use spell",
  ".fly": "Fly to",
  ".fp": "Learn flight point",
  ".hs": "Use Hearthstone",
  ".home": "Set Hearthstone",
  ".xp": "XP checkpoint",
  ".target": "NPC",
  ".mob": "Target enemy",
  ".abandon": "Abandon quest",
  ".destroy": "Destroy item",
  ".zone": "Travel to zone",
  ".equip": "Equip",
  ".stable": "Visit stable",
  ".deathskip": "Death-skip option",
  ".macro": "Optional macro",
  ".bankdeposit": "Deposit",
  ".bankwithdraw": "Withdraw",
  ".dailyturnin": "Turn in daily quest",
};
const controlLabels: Readonly<Record<string, string>> = {
  "#completewith": "Do alongside",
  "#requires": "Requires step",
  "#sticky": "Keep active while continuing",
  "#loop": "Repeat this path",
  "#optional": "Optional",
  "#hidewindow": "Background path in source",
  "#stop": "Stop here in source",
  "#phase": "Content phase",
  ".dungeon": "Dungeon branch",
  ".group": "Group content",
  ".solo": "Solo variant",
  "#xprate": "XP-rate condition",
  "#level": "Level condition",
  "#completwith": "Unrecognized source tag (possible completewith typo)",
};
function describe(directive: ImportedDirective): string {
  if (directive.text) return directive.text;
  if ([".train", ".xp"].includes(directive.tag)) return "";
  const action = describedActions[directive.tag];
  return action
    ? `${action}${directive.arguments ? `: ${directive.arguments.replaceAll("::", " · ")}` : ""}`
    : "";
}

export function ImportedLevelingReader({
  chapter,
  guide,
  defaultProfile,
  maps,
}: ImportedReaderProps): React.JSX.Element {
  const { session, loaded, notice, saveCharacter, setProgress } = useLeveling();
  const matching =
    session?.profile.faction === defaultProfile.faction &&
    session.profile.raceId === defaultProfile.raceId
      ? session
      : null;
  const profile = matching?.profile ?? defaultProfile;
  const label = getChapterLabel(chapter, profile);
  const race = getLevelingRace(profile.faction, profile.raceId);
  const [dungeons, setDungeons] = useState<readonly string[]>([]);
  const [hideDone, setHideDone] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const views = useMemo(
    () => guide.steps.map((step) => getGuideStepView(step, profile, { dungeons })),
    [guide, profile, dungeons],
  );
  const active = views.filter(
    (view) =>
      view.condition === "match" &&
      view.directives.some((directive) => describe(directive) || directive.position),
  );
  const unresolved = views.filter((view) => view.condition === "unknown");
  const excluded = views.filter((view) => view.condition === "exclude").length;
  const releaseKey = chapterProgressKey(chapter.id, guide.version, guide.targetBuild);
  const progress = matching?.progress[releaseKey] ?? {};
  const completed = active.filter((view) => progress[view.step.id] === "done").length;
  const selection = useLevelingReaderSelection(
    `${matching?.id ?? "unsaved"}:${releaseKey}`,
    "guide-",
    active.map((view) => view.step.id),
    active.filter((view) => !progress[view.step.id]).map((view) => view.step.id),
    active
      .filter((view) => !hideDone || progress[view.step.id] !== "done")
      .map((view) => view.step.id),
  );
  const selectedMapStep = active.find((view) => view.step.id === selection.selectedId);
  const mapPoints = maps.points.filter(
    (point) =>
      point.stepId === selectedMapStep?.step.id &&
      selectedMapStep.directives.some((directive) => directive.sourceLine === point.sourceLine),
  );
  const definition: ImportedProgressDefinition = useMemo(
    () => ({
      chapterId: chapter.id,
      version: guide.version,
      clientBuild: guide.targetBuild,
      stepIds: guide.steps.map((step) => step.id),
    }),
    [chapter.id, guide],
  );
  const dungeonChoices = [
    ...new Set(
      guide.steps.flatMap((step) =>
        step.directives
          .filter((directive) => directive.tag === ".dungeon")
          .map((directive) => directive.arguments.replace(/^!/, "").toUpperCase()),
      ),
    ),
  ];
  const next = findChapterTargets(chapter, CHAPTER_REFERENCES, profile);
  function changeProfile(nextProfile: CharacterProfile): void {
    saveCharacter(nextProfile, matching?.id);
  }
  function mark(stepId: string, status: StepProgress): void {
    if (status === "skipped")
      setWarning(
        "Skipped steps are not completed prerequisites. Check quest chains, source dependencies and the next checkpoint in game.",
      );
    setProgress(chapter.id, stepId, status, definition);
  }
  function renderStep(view: GuideStepView, conditional = false): React.JSX.Element {
    const texts = view.directives.filter((directive) => describe(directive));
    const heading =
      texts.find((directive) => directive.questId !== null)?.text ||
      texts[0]?.text ||
      `Source step ${view.step.ordinal}`;
    const positions = view.directives.filter((directive) => directive.position !== null);
    const controls = view.directives.filter(
      (directive) => directive.tag !== "#label" && directive.tag.startsWith("#"),
    );
    const dependencies = controls.filter((directive) =>
      ["#requires", "#completewith"].includes(directive.tag),
    );
    return (
      <LevelingQuestCard
        key={view.step.id}
        id={`guide-${view.step.id}`}
        title={heading}
        selectionLabel={
          maps.points.some(
            (point) =>
              point.stepId === view.step.id &&
              view.directives.some((directive) => directive.sourceLine === point.sourceLine),
          )
            ? `Show source step ${view.step.ordinal} on map`
            : `Select source step ${view.step.ordinal}`
        }
        selected={!conditional && selection.selectedId === view.step.id}
        done={progress[view.step.id] === "done"}
        disabled={conditional}
        onSelect={() => selection.select(view.step.id)}
        leading={
          <span className={`${styles.actionIcon} ${styles.sourceStepIcon}`} aria-hidden="true">
            {view.step.ordinal}
          </span>
        }
        meta={
          <>
            Step {view.step.ordinal}
            {view.optional && " · Optional / alongside"}
            {conditional && " · Condition unresolved"}
          </>
        }
        progress={
          <LevelingStepProgress
            label={`source step ${view.step.ordinal}`}
            value={progress[view.step.id] ?? "pending"}
            disabled={!loaded || !matching || conditional}
            onChange={(status) => mark(view.step.id, status)}
          />
        }
      >
        {texts.map((directive, index) => (
          <div key={`${directive.sourceLine}-${index}`} className={styles.guideInstruction}>
            {describe(directive) !== heading && <p>{describe(directive)}</p>}
            {directive.questId !== null && (
              <LevelingEntityLinks kind="quest" id={directive.questId} />
            )}
            {[".use", ".collect", ".equip", ".destroy"].includes(directive.tag) &&
              /^\d+/.test(directive.arguments) && (
                <LevelingEntityLinks kind="item" id={Number(directive.arguments.split(",")[0])} />
              )}
            {[".cast", ".usespell", ".train"].includes(directive.tag) &&
              /^\d+(?:,|$)/.test(directive.arguments) && (
                <LevelingEntityLinks kind="spell" id={Number(directive.arguments.split(",")[0])} />
              )}
          </div>
        ))}
        {positions.length > 0 && (
          <details className={styles.guideDetails}>
            <summary>Locations & path · {positions.length} point(s)</summary>
            <ul>
              {positions.map((directive) => (
                <li key={directive.sourceLine}>
                  {directive.position!.zone}
                  {directive.position!.floor !== null &&
                    ` / world map ${directive.position!.floor}`}{" "}
                  · {directive.position!.x}, {directive.position!.y}
                  {directive.position!.space === "world"
                    ? " (world coordinates, not map %)"
                    : " (map %)"}
                </li>
              ))}
            </ul>
          </details>
        )}
        {controls.length > 0 && (
          <ul className={styles.guideControls}>
            {controls.map((directive) => (
              <li key={directive.sourceLine}>
                {controlLabels[directive.tag] ?? directive.tag}: {directive.arguments || "yes"}
              </li>
            ))}
          </ul>
        )}
        {dependencies.map((dependency) => {
          const target = views.find(
            (candidate) =>
              candidate.condition !== "exclude" &&
              candidate.step.directives.some(
                (directive) =>
                  directive.tag === "#label" && directive.arguments === dependency.arguments,
              ),
          );
          return target ? (
            <a key={dependency.sourceLine} href={`#guide-${target.step.id}`}>
              {dependency.tag === "#requires" ? "Required source step" : "Alongside source step"}{" "}
              {target.step.ordinal} ↓
            </a>
          ) : null;
        })}
        <details className={styles.guideDetails}>
          <summary>Source context & controls</summary>
          <ul>
            {view.directives
              .filter((directive) => directive.tag !== "text")
              .map((directive) => (
                <li key={directive.sourceLine}>
                  {directive.tag} {directive.arguments}
                </li>
              ))}
          </ul>
        </details>
        {view.runtimeChecks.length > 0 && (
          <details className={styles.guideDetails}>
            <summary>Check in game · {view.runtimeChecks.length} state condition(s)</summary>
            <p>Browser checkmarks do not establish quest, item, money, skill or position state.</p>
            <ul>
              {view.runtimeChecks.map((directive) => (
                <li key={directive.sourceLine}>
                  {directive.tag} {directive.arguments}
                </li>
              ))}
            </ul>
          </details>
        )}
        {view.conditionalDirectives.length > 0 && (
          <details className={styles.guideDetails}>
            <summary>
              Other conditional instructions · choose class / check source condition
            </summary>
            <ul>
              {view.conditionalDirectives.map((directive) => (
                <li key={directive.sourceLine}>
                  {directive.condition}:{" "}
                  {describe(directive) || `${directive.tag} ${directive.arguments}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </LevelingQuestCard>
    );
  }
  return (
    <LevelingReaderWorkspace
      scope={releaseKey}
      ready={loaded}
      title={label.zone}
      minimumLevel={label.minimumLevel}
      maximumLevel={label.maximumLevel}
      profile={`${profileSummary(profile)} · ${profile.pace === "fast" ? "Speed" : "Chill"} · ${profile.party.size === 1 ? "Solo" : `${profile.party.size} players`}`}
      dashboardHref={levelingDashboardPath(profile)}
      completed={completed}
      total={active.length}
      progressLabel={`${completed} / ${active.length} visible steps done`}
      notice={notice}
      onNavigate={selection.navigate}
      settings={
        <>
          <div className={styles.detailsRow}>
            <label className={styles.field}>
              Class
              <select
                value={profile.classSlug ?? ""}
                disabled={!loaded || Boolean(matching?.profile.classSlug)}
                onChange={(event) =>
                  changeProfile({
                    ...profile,
                    classSlug: race?.classes.find((slug) => slug === event.target.value) ?? null,
                  })
                }
              >
                <option value="">Choose to resolve class instructions</option>
                {race?.classes.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Known outdoor XP rate
              <select
                value={profile.xpRate ?? ""}
                disabled={!loaded}
                onChange={(event) =>
                  changeProfile({
                    ...profile,
                    xpRate: event.target.value ? Number(event.target.value) : null,
                  })
                }
              >
                <option value="">Unknown · gated steps need review</option>
                {[1, 1.5, 2, 3].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          {dungeonChoices.length > 0 && (
            <details className={styles.guideDetails}>
              <summary>Optional dungeon branches · off by default</summary>
              <p>
                These are explicit source alternatives, not a recommendation or an assumed zero-wait
                clear. Selecting one changes its outdoor alternative.
              </p>
              <div className={styles.dungeonChoices}>
                {dungeonChoices.map((dungeon) => (
                  <label key={dungeon}>
                    <input
                      type="checkbox"
                      checked={dungeons.includes(dungeon)}
                      onChange={(event) =>
                        setDungeons(
                          event.target.checked
                            ? [...dungeons, dungeon]
                            : dungeons.filter((entry) => entry !== dungeon),
                        )
                      }
                    />{" "}
                    {dungeon}
                  </label>
                ))}
              </div>
            </details>
          )}
          <p className={styles.muted}>
            {excluded} excluded variant steps · {unresolved.length} unresolved. Hidden variants are
            not marked complete.
          </p>
          <p className={styles.muted}>
            Full imported guide · runtime check pending. This is not a playtested or mode-optimized
            route; game-state checks remain manual.
          </p>
        </>
      }
      map={
        <LevelingZoneMap
          maps={maps}
          points={mapPoints}
          stepLabel={selectedMapStep ? `Step ${selectedMapStep.step.ordinal}` : "No active step"}
          followingNext={selection.followingNext}
          onFollowNext={selection.follow}
        />
      }
      toolbar={
        <>
          <div className={styles.readerToolbar}>
            <h2 id="full-quest-list-heading">The current quest list</h2>
            <label>
              <input
                type="checkbox"
                checked={hideDone}
                onChange={(event) => setHideDone(event.target.checked)}
              />{" "}
              Hide completed
            </label>
          </div>
          <div className={styles.workspaceListLinks}>
            {selection.resumeId && (
              <a href={`#guide-${selection.resumeId}`} data-reader-resume>
                Resume next step ↓
              </a>
            )}
            {chapter.id === WESTFALL_CHAPTER_ID && (
              <Link href={`${levelingChapterPath(profile, chapter.id)}?edition=kfc`}>
                Original KFC preview & calculator
              </Link>
            )}
          </div>
        </>
      }
    >
      <p className={styles.readerSource}>
        Authorized RestedXP source · {guide.steps.length} original source steps · target build{" "}
        {guide.targetBuild}. Order is preserved.
      </p>
      {label.maximumLevel > LEVELING_EVIDENCE.betaLevelCap && (
        <p className={styles.notice}>Includes future content above the reviewed beta cap of 30.</p>
      )}
      {loaded && !matching && (
        <div className={styles.resume}>
          <p>Save this setup to track this chapter independently.</p>
          <button className={styles.button} type="button" onClick={() => saveCharacter(profile)}>
            Save character & enable progress
          </button>
        </div>
      )}
      {(!profile.classSlug || profile.xpRate === null) && (
        <p className={styles.readerSource}>
          Choose class and known outdoor XP rate in Settings to resolve conditional instructions.
        </p>
      )}
      {warning && (
        <p className={styles.notice} role="status">
          {warning}
        </p>
      )}
      {active.length === 0 && (
        <p className={styles.empty}>
          No resolved instructions for this profile. Choose class/XP rate or review the conditional
          steps below.
        </p>
      )}
      <ol className={styles.questSteps}>
        {active
          .filter((view) => !hideDone || progress[view.step.id] !== "done")
          .map((view) => renderStep(view))}
      </ol>
      {hideDone && active.length > 0 && completed === active.length && (
        <p className={styles.empty}>
          All visible steps are done. Unresolved branches still require review.
        </p>
      )}
      {unresolved.length > 0 && (
        <details className={styles.guideDetails}>
          <summary>Unresolved source steps · {unresolved.length}</summary>
          <p>
            Not part of the active list. Conditions depend on class, XP rate, group readiness or an
            unverified phase.
          </p>
          <ol className={styles.questSteps}>{unresolved.map((view) => renderStep(view, true))}</ol>
        </details>
      )}
      <nav className={styles.chapterPagination} aria-label="Chapter navigation">
        <Link href={levelingDashboardPath(profile)}>← Chapter overview</Link>
        {next.length === 1 ? (
          <Link href={levelingChapterPath(profile, next[0]!.id)}>
            Next source chapter: {getChapterLabel(next[0]!, profile).zone} →
          </Link>
        ) : (
          <span>
            {next.length > 1
              ? "Choose a continuation in the chapter overview"
              : "Next transition needs review"}
          </span>
        )}
      </nav>
    </LevelingReaderWorkspace>
  );
}
