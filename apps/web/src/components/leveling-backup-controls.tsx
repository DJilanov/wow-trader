"use client";

import { useState, type ChangeEvent } from "react";
import { exportLevelingBackup, readLevelingBackup } from "../lib/leveling-backup";
import type { LevelingWorkspace } from "../lib/leveling-experience";
import { useLeveling } from "./leveling-provider";
import styles from "./leveling-experience.module.css";

export function LevelingBackupControls(): React.JSX.Element {
  const { workspace, loaded, importBackup } = useLeveling();
  const [preview, setPreview] = useState<LevelingWorkspace | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  function download(): void {
    try {
      const url = URL.createObjectURL(
        new Blob([exportLevelingBackup(workspace)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `kfc-leveling-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Backup downloaded. Keep it private: it contains your character setup and progress.",
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Backup could not be created.");
    }
  }
  async function previewFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPreview(null);
    if (!file) return;
    try {
      if (file.size > 2_010_000) throw new Error("Backup exceeds the 2 MB progress limit.");
      const incoming = readLevelingBackup(await file.text());
      setPreview(incoming);
      setMessage(
        `${incoming.sessions.length} character(s) ready to import. Existing settings and already-saved chapter progress will be kept, including undone steps. No progress is inferred or sent to the server.`,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Backup could not be read.");
    }
  }
  function confirm(): void {
    if (!preview) return;
    try {
      importBackup(preview);
      setPreview(null);
      setMessage("Backup imported and saved to this browser.");
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : "Import failed. Existing progress is unchanged.",
      );
    }
  }
  return (
    <details className={styles.guideDetails}>
      <summary>Progress backup & restore</summary>
      <p>
        Progress stays on this browser. Export a private backup before changing devices or clearing
        site data. Account sync is not enabled.
      </p>
      <div className={styles.backupActions}>
        <button
          type="button"
          className={styles.button}
          disabled={!loaded || workspace.sessions.length === 0}
          onClick={download}
        >
          Export progress
        </button>
        <label className={styles.field}>
          Choose backup file
          <input
            type="file"
            accept=".json,application/json"
            disabled={!loaded}
            onChange={(event) => void previewFile(event)}
          />
        </label>
        {preview && (
          <button type="button" className={styles.button} onClick={confirm}>
            Import and merge backup
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
