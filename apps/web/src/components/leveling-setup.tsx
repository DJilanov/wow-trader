"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LEVELING_RACES,
  createCharacterProfile,
  getLevelingRace,
  getPartyGuidance,
  type CharacterProfile,
  type Faction,
  type RaceId,
} from "@wow-trader/leveling";
import { ForeverIcon } from "./forever-icon";
import { useLeveling } from "./leveling-provider";
import {
  levelingDashboardPath,
  profileSummary,
  readSharedCharacter,
} from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";

const stages = ["Faction", "Race", "Playstyle"] as const;

export function LevelingSetup(): React.JSX.Element {
  const router = useRouter();
  const { session, loaded, workspace, notice, saveCharacter, selectCharacter } = useLeveling();
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState<CharacterProfile>(createCharacterProfile);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [groupOpen, setGroupOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!loaded) return;
    function restore(): void {
      const params = new URLSearchParams(window.location.search);
      const restored = readSharedCharacter(params.get("draft"));
      const editId = params.get("edit");
      const editing = workspace.sessions.find((entry) => entry.id === editId);
      setEditingId(editing?.id);
      setDraft(restored ?? editing?.profile ?? createCharacterProfile());
      setStage(params.get("stage") === "style" ? 2 : params.get("stage") === "race" ? 1 : 0);
      setGroupOpen(
        (restored ?? editing?.profile)?.party.size !== undefined &&
          (restored ?? editing?.profile)?.party.size !== 1,
      );
    }
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [loaded, workspace.sessions]);

  function move(nextStage: number, profile: CharacterProfile = draft): void {
    const params = new URLSearchParams({
      stage: nextStage === 2 ? "style" : nextStage === 1 ? "race" : "faction",
      draft: JSON.stringify(profile),
    });
    if (editingId) params.set("edit", editingId);
    window.history.pushState(null, "", `/forever/leveling?${params}`);
    setDraft(profile);
    setStage(nextStage);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function chooseFaction(faction: Faction): void {
    move(1, createCharacterProfile(faction));
  }
  function updateDraft(profile: CharacterProfile): void {
    setDraft(profile);
    const url = new URL(window.location.href);
    url.searchParams.set("draft", JSON.stringify(profile));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function chooseRace(raceId: RaceId): void {
    updateDraft({ ...draft, raceId, classSlug: raceId === draft.raceId ? draft.classSlug : null });
  }
  function finish(profile: CharacterProfile): void {
    if (saveCharacter(profile, editingId)) router.push(levelingDashboardPath(profile));
  }
  const race = getLevelingRace(draft.faction, draft.raceId);
  const editingSession = workspace.sessions.find((entry) => entry.id === editingId);
  const factionName = draft.faction === "alliance" ? "Alliance" : "Horde";
  const guidance = getPartyGuidance(draft);
  const titles = ["Choose your side.", "Where does your story begin?", "Make the journey yours."];

  return (
    <section className={styles.setup} aria-labelledby="setup-heading">
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {loaded && session && stage === 0 && (
        <div className={styles.resume}>
          <div>
            <span className="eyebrow">Saved on this browser</span>
            <strong>{profileSummary(session.profile)}</strong>
          </div>
          <Link className={styles.button} href={levelingDashboardPath(session.profile)}>
            Resume my route →
          </Link>
          {workspace.sessions.length > 1 && (
            <label className={styles.field}>
              Saved character
              <select value={session.id} onChange={(event) => selectCharacter(event.target.value)}>
                {workspace.sessions.map((entry, index) => (
                  <option key={entry.id} value={entry.id}>
                    {index + 1}. {profileSummary(entry.profile)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <ol className={styles.stepper} aria-label="Character setup">
        {stages.map((label, index) => (
          <li key={label} aria-current={index === stage ? "step" : undefined}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className={styles.setupHeading}>
        <span className="eyebrow">
          Step {stage + 1} of 3{stage > 0 ? ` · ${factionName}` : ""}
        </span>
        <h2 id="setup-heading" tabIndex={-1} ref={heading}>
          {titles[stage]}
        </h2>
        <p>
          {stage === 0
            ? "Choose a faction, then your race and how you like to play. No account needed."
            : stage === 1
              ? "Your starting zone and class determine which chapter variants fit."
              : "Start with a simple preference. Change pace or party readiness later without losing progress."}
        </p>
      </div>

      {stage === 0 && (
        <div className={styles.factionGrid}>
          {(["alliance", "horde"] as const).map((faction) => (
            <button
              type="button"
              className={`${styles.factionCard} ${faction === "alliance" ? styles.alliance : styles.horde}`}
              key={faction}
              onClick={() => chooseFaction(faction)}
              disabled={!loaded || editingId !== undefined}
            >
              <span className={styles.factionPortrait}>
                <ForeverIcon
                  iconKey={faction === "alliance" ? "race_human_male" : "race_orc_male"}
                  snapshotChecksum="leveling-70205"
                />
              </span>
              <span className="eyebrow">Choose your faction</span>
              <strong>{faction === "alliance" ? "Alliance" : "Horde"}</strong>
              <span>
                {faction === "alliance"
                  ? "From Northshire to the world beyond."
                  : "From the homelands to the world beyond."}
              </span>
              <span className={styles.choiceArrow} aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      )}

      {stage === 1 && (
        <>
          <div className={styles.raceGrid} role="group" aria-label="Choose your race">
            {LEVELING_RACES.filter((entry) => entry.faction === draft.faction).map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={draft.raceId === entry.id}
                className={styles.raceCard}
                onClick={() => chooseRace(entry.id)}
                disabled={editingId !== undefined}
              >
                <span className={styles.racePortrait}>
                  <ForeverIcon iconKey={entry.icon} snapshotChecksum="leveling-70205" />
                </span>
                <strong>{entry.name}</strong>
                <small>{entry.startZone}</small>
                <span className={styles.selectionMark} aria-hidden="true">
                  {draft.raceId === entry.id ? "✓" : "+"}
                </span>
              </button>
            ))}
          </div>
          <div className={styles.detailsRow}>
            <label className={styles.field}>
              Class <small>Optional for reference browsing</small>
              <select
                value={draft.classSlug ?? ""}
                disabled={editingSession !== undefined && editingSession.profile.classSlug !== null}
                onChange={(event) => {
                  const value = race?.classes.find((slug) => slug === event.target.value) ?? null;
                  updateDraft({ ...draft, classSlug: value });
                }}
              >
                <option value="">Choose later</option>
                {race?.classes.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug[0]?.toUpperCase()}
                    {slug.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Current level <small>Optional · does not mark quests done</small>
              <input
                min={1}
                max={60}
                type="number"
                placeholder="Starting fresh"
                value={draft.level ?? ""}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  updateDraft({
                    ...draft,
                    level:
                      Number.isInteger(value) && value >= 1 && value <= 60 && event.target.value
                        ? value
                        : null,
                  });
                }}
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.quietButton} onClick={() => move(0)}>
              ← Back
            </button>
            <button type="button" className={styles.button} onClick={() => move(2)}>
              Choose playstyle →
            </button>
          </div>
        </>
      )}

      {stage === 2 && (
        <>
          <div className={styles.modeGrid}>
            <button
              type="button"
              className={styles.modeCard}
              onClick={() => finish({ ...draft, pace: "fast" })}
            >
              <span className={styles.modeSymbol} aria-hidden="true">
                ↗
              </span>
              <strong>Speed</strong>
              <span>Keep moving. Prioritize efficient solo progress.</span>
              <small>
                {draft.party.size > 1
                  ? "Keeps your saved party · fast pace"
                  : "Outdoor-first · dungeons optional"}
              </small>
            </button>
            <button
              type="button"
              className={styles.modeCard}
              onClick={() => finish({ ...draft, pace: "relaxed" })}
            >
              <span className={styles.modeSymbol} aria-hidden="true">
                ☼
              </span>
              <strong>Chill</strong>
              <span>A comfortable journey, without pressure to keep up.</span>
              <small>
                {draft.party.size > 1
                  ? "Keeps your saved party · relaxed pace"
                  : "Take your time · optional detours"}
              </small>
            </button>
            <button
              type="button"
              className={styles.modeCard}
              aria-expanded={groupOpen}
              aria-controls="leveling-group-setup"
              onClick={() => {
                setGroupOpen(true);
                if (draft.party.size === 1)
                  updateDraft({ ...draft, party: { ...draft.party, size: 5 } });
              }}
            >
              <span className={styles.modeSymbol} aria-hidden="true">
                ⚑
              </span>
              <strong>Group</strong>
              <span>Adventure together. Review group quests and dungeons.</span>
              <small>2–5 players · readiness matters</small>
            </button>
          </div>
          {groupOpen && (
            <section
              id="leveling-group-setup"
              className={styles.groupPanel}
              aria-labelledby="group-heading"
            >
              <h3 id="group-heading">Tell us about your party</h3>
              <div className={styles.detailsRow}>
                <label className={styles.field}>
                  Players
                  <select
                    value={draft.party.size}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        party: { ...draft.party, size: Number(event.target.value) },
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((size) => (
                      <option key={size} value={size}>
                        {size === 1 ? "Solo · no party" : `${size} players`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Are you together?
                  <select
                    value={draft.party.readiness}
                    onChange={(event) => {
                      const readiness = event.target.value;
                      if (
                        readiness === "together" ||
                        readiness === "meet-later" ||
                        readiness === "recruiting"
                      )
                        updateDraft({ ...draft, party: { ...draft.party, readiness } });
                    }}
                  >
                    <option value="recruiting">Still recruiting</option>
                    <option value="meet-later">Meet after starting zones</option>
                    <option value="together">Together now</option>
                  </select>
                </label>
                {(["tank", "healer"] as const).map((role) => (
                  <label key={role} className={styles.field}>
                    {role === "tank" ? "Can someone tank?" : "Can someone heal?"}
                    <select
                      value={draft.party[role]}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "yes" || value === "no" || value === "unknown")
                          updateDraft({ ...draft, party: { ...draft.party, [role]: value } });
                      }}
                    >
                      <option value="unknown">Not sure yet</option>
                      <option value="yes">Yes, confirmed</option>
                      <option value="no">Not yet</option>
                    </select>
                  </label>
                ))}
                <label className={styles.field}>
                  Pace
                  <select
                    value={draft.pace}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        pace: event.target.value === "relaxed" ? "relaxed" : "fast",
                      })
                    }
                  >
                    <option value="fast">Fast</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </label>
              </div>
              <p>
                <strong>{guidance.title}.</strong> {guidance.text}
              </p>
              <button type="button" className={styles.button} onClick={() => finish(draft)}>
                Show our chapters →
              </button>
            </section>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.quietButton} onClick={() => move(1)}>
              ← Back to race
            </button>
            <span className={styles.muted}>
              Current quest order stays intact. Mode-specific route refinements come next.
            </span>
          </div>
        </>
      )}
      {!loaded && (
        <p role="status" className={styles.muted}>
          Loading your saved setup…
        </p>
      )}
    </section>
  );
}
