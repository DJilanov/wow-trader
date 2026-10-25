"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  activeCampaignActions,
  campaignExportProgress,
  campaignExportSelectionFromProgress,
  restedXpDocumentSetSchema,
  CAMPAIGN_RACES,
  getLevelingRace,
  type CampaignPartyStarter,
  type CampaignRace,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import {
  RESTEDXP_REVIEW_TARGET,
  type RestedXpExportRequest,
} from "../lib/leveling-restedxp-contract";
import {
  browserRestedXpImport,
  campaignActionSha256,
  readRestedXpExportResponse,
} from "../lib/leveling-restedxp-browser";
import styles from "./leveling-experience.module.css";
import exportStyles from "./leveling-restedxp-export.module.css";
import { withHelperBasePath } from "../lib/site-path";

interface ExportProps {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly mode?: "review" | "member";
}

function download(bytes: Blob, name: string): void {
  const url = URL.createObjectURL(bytes);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking before the browser has consumed the URL can cancel Safari downloads.
  setTimeout((): void => URL.revokeObjectURL(url), 60_000);
}

export function LevelingRestedXpExport({
  plan,
  progress,
  mode = "review",
}: ExportProps): React.JSX.Element {
  const id = useId();
  const accountInput = useRef<HTMLInputElement>(null);
  const output = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const [role, setRole] = useState<"leader" | "party">("leader");
  const [selectedMember, setSelectedMember] = useState<CampaignPartyStarter | null>(null);
  const [busy, setBusy] = useState<"import" | "addon" | null>(null);
  const [encoded, setEncoded] = useState("");
  const [generatedSelection, setGeneratedSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selection = campaignExportSelectionFromProgress(progress);
  const member: CampaignPartyStarter = selectedMember ?? {
    race: plan.race,
    classSlug: plan.leaderClass ?? "warrior",
  };
  const memberRace = getLevelingRace("alliance", member.race)!;
  const partyStarter = role === "party" ? member : undefined;
  const selectionKey = JSON.stringify({
    release: plan.release,
    race: plan.race,
    classSlug: plan.leaderClass,
    role,
    selection,
    partyStarter,
  });
  const currentOutput = generatedSelection === selectionKey ? encoded : "";
  useEffect(
    () => (): void => {
      requestController.current?.abort();
    },
    [],
  );

  async function requestExport(format: RestedXpExportRequest["format"]): Promise<Response> {
    if (!plan.leaderClass) throw new Error("Choose a class before exporting.");
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const actions = activeCampaignActions(plan, campaignExportProgress(selection));
    const input: RestedXpExportRequest = {
      race: plan.race,
      classSlug: plan.leaderClass,
      routeRelease: plan.release,
      actionSha256: await campaignActionSha256(actions),
      selection,
      format,
      partyStarter,
    };
    const timeout = setTimeout((): void => controller.abort(), 30_000);
    try {
      return await fetch(withHelperBasePath("/api/v1/leveling-restedxp-export"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function createImport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy("import");
    setError(null);
    setNotice(null);
    setEncoded("");
    // Read only on explicit submission. This value is never part of a fetch, URL, log or saved profile.
    const account = accountInput.current?.value ?? "";
    try {
      const result = restedXpDocumentSetSchema.parse(
        await readRestedXpExportResponse(await requestExport("documents")),
      );
      if (result.restedXpVersion !== RESTEDXP_REVIEW_TARGET.restedXpVersion)
        throw new Error("The addon target changed. Reload before exporting.");
      if (
        result.runtimeBuild !== RESTEDXP_REVIEW_TARGET.runtimeBuild ||
        result.routeRelease !== plan.release ||
        JSON.stringify(result.edition?.partyStarter) !== JSON.stringify(partyStarter) ||
        JSON.stringify(result.selection) !== JSON.stringify(selection)
      )
        throw new Error(
          "The returned guide does not match these route settings. Reload and try again.",
        );
      const value = await browserRestedXpImport(result, role, account);
      setEncoded(value);
      setGeneratedSelection(selectionKey);
      setNotice(
        "Import verified. Copy it into RestedXP → Guide Import, or download the text file.",
      );
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "The import could not be created. Try again.",
      );
    } finally {
      if (accountInput.current) accountInput.current.value = "";
      setBusy(null);
    }
  }

  async function downloadAddon(): Promise<void> {
    if (busy) return;
    setBusy("addon");
    setError(null);
    setNotice(null);
    try {
      const response = await requestExport("addon");
      if (!response.ok) await readRestedXpExportResponse(response);
      if (response.headers.get("content-type") !== "application/zip")
        throw new Error("The server did not return an addon ZIP. Try again.");
      const blob = await response.blob();
      if (!blob.size || blob.size > 12_000_000)
        throw new Error("The addon download exceeds its size limit.");
      download(blob, `kfc-forever-${plan.race}-${plan.leaderClass}-review.zip`);
      setNotice(
        "ZIP downloaded. Extract KFCForeverGuides into Interface/AddOns, keep RestedXP installed, then restart the game.",
      );
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The addon could not be downloaded. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyImport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(currentOutput);
      setNotice("Copied. Paste into RestedXP → Guide Import.");
    } catch {
      output.current?.focus();
      output.current?.select();
      setNotice(
        "Clipboard access was blocked. The import is selected below; copy it with your keyboard, or download the text file.",
      );
    }
  }

  return (
    <section
      className={`${styles.continueCard} ${exportStyles.panel}`}
      aria-labelledby={`${id}-heading`}
    >
      <span className="eyebrow">
        {mode === "review"
          ? "Local review · not released"
          : "KFC member / supporter edition · beta"}
      </span>
      <h2 id={`${id}-heading`}>Take this route into RestedXP</h2>
      <p>
        Your {plan.race.replaceAll("-", " ")} {plan.leaderClass} route and selected dungeon options.
        Saved completions, names and XP bars are not exported.
      </p>
      <p className={styles.muted}>
        WoW Forever build {RESTEDXP_REVIEW_TARGET.runtimeBuild} · RestedXP{" "}
        {RESTEDXP_REVIEW_TARGET.restedXpVersion}. This guide still needs in-game review. Export a
        party member's race and class to include their personal starter before the shared route.
      </p>
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>): void => {
          void createImport(event);
        }}
        className={exportStyles.form}
      >
        <div className={styles.field}>
          <label htmlFor={`${id}-role`}>Guide role</label>
          <select
            id={`${id}-role`}
            value={role}
            disabled={busy !== null}
            onChange={(event): void => {
              setRole(event.target.value as "leader" | "party");
              setNotice(null);
            }}
          >
            <option value="leader">Leader — starter + shared route</option>
            <option value="party">Party member — own starter + shared route</option>
          </select>
        </div>
        {role === "party" && (
          <div className={exportStyles.member}>
            <div className={styles.field}>
              <label htmlFor={`${id}-race`}>Your race</label>
              <select
                id={`${id}-race`}
                value={member.race}
                disabled={busy !== null}
                onChange={(event): void => {
                  const race = event.target.value as CampaignRace;
                  const available = getLevelingRace("alliance", race)!;
                  setSelectedMember({
                    race,
                    classSlug: available.classes.includes(member.classSlug)
                      ? member.classSlug
                      : available.classes[0]!,
                  });
                  setNotice(null);
                }}
              >
                {CAMPAIGN_RACES.map((race) => (
                  <option key={race} value={race}>
                    {getLevelingRace("alliance", race)!.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-class`}>Your class</label>
              <select
                id={`${id}-class`}
                value={member.classSlug}
                disabled={busy !== null}
                onChange={(event): void => {
                  const classSlug = memberRace.classes.find(
                    (value) => value === event.target.value,
                  );
                  if (classSlug) setSelectedMember({ ...member, classSlug });
                  setNotice(null);
                }}
              >
                {memberRace.classes.map((value) => (
                  <option key={value} value={value}>
                    {value[0]!.toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.muted}>
              Your starter leads into this group's shared route. Already started? Select your
              current chapter in RestedXP after import.
            </p>
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor={`${id}-account`}>Your BattleTag</label>
          <input
            id={`${id}-account`}
            ref={accountInput}
            name="restedxp-account-context"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="YourName#1234"
            maxLength={100}
            required
            disabled={busy !== null}
            aria-describedby={`${id}-privacy`}
          />
        </div>
        <p id={`${id}-privacy`} className={styles.muted}>
          Used only in this browser to match RestedXP's account-bound import format. Never sent to
          our server or saved. The input is cleared after generation. A ZIP does not need a
          BattleTag.
        </p>
        <div className={exportStyles.actions}>
          <button
            type="submit"
            className={styles.button}
            disabled={busy !== null || !plan.leaderClass}
          >
            {busy === "import" ? "Preparing import…" : "Create paste import"}
          </button>
          <button
            type="button"
            className={styles.quietButton}
            disabled={busy !== null || !plan.leaderClass}
            onClick={(): void => {
              void downloadAddon();
            }}
          >
            {busy === "addon" ? "Preparing ZIP…" : "Download addon ZIP"}
          </button>
        </div>
      </form>
      {busy && (
        <p role="status">
          {busy === "import"
            ? "Generating and checking your import locally…"
            : "Building the selected review addon…"}
        </p>
      )}
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {currentOutput && (
        <div className={exportStyles.output}>
          <div className={exportStyles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={(): void => {
                void copyImport();
              }}
            >
              Copy import
            </button>
            <button
              type="button"
              className={styles.quietButton}
              onClick={(): void =>
                download(
                  new Blob([currentOutput], { type: "text/plain;charset=utf-8" }),
                  `kfc-forever-${plan.race}-${plan.leaderClass}-${role}-review.txt`,
                )
              }
            >
              Download import.txt
            </button>
            <button
              type="button"
              className={styles.quietButton}
              onClick={(): void => {
                setEncoded("");
                setNotice(null);
              }}
            >
              Clear import
            </button>
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-output`}>Paste this into RestedXP → Guide Import</label>
            <textarea
              id={`${id}-output`}
              ref={output}
              readOnly
              value={currentOutput}
              rows={4}
              spellCheck={false}
            />
          </div>
          <p className={styles.muted}>
            Paste imports are Forever-only but cannot enforce an exact client build. The ZIP checks
            build {RESTEDXP_REVIEW_TARGET.runtimeBuild} before registering guides. Use only one
            installation method to avoid duplicate groups.
          </p>
        </div>
      )}
    </section>
  );
}
