"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CharacterProfile } from "@wow-trader/leveling";
import {
  LEVELING_STORAGE_KEY,
  emptyLevelingWorkspace,
  readLevelingWorkspace,
  readSharedCharacter,
  serializeLevelingWorkspace,
  updateCharacterSession,
  updateStepProgress,
  rememberReadingPosition,
  type LevelingSession,
  type LevelingWorkspace,
  type StepProgress,
  type ImportedProgressDefinition,
  type ReadingPosition,
} from "../lib/leveling-experience";
import { mergeLevelingBackup } from "../lib/leveling-backup";

interface LevelingContextValue {
  readonly workspace: LevelingWorkspace;
  readonly session: LevelingSession | null;
  readonly loaded: boolean;
  readonly notice: string | null;
  readonly saveCharacter: (profile: CharacterProfile, sessionId?: string) => boolean;
  readonly selectCharacter: (id: string) => void;
  readonly rememberPosition: (sessionId: string, position: ReadingPosition) => void;
  readonly importBackup: (incoming: LevelingWorkspace) => void;
  readonly setProgress: (
    chapterId: string,
    stepId: string,
    progress: StepProgress,
    definition?: ImportedProgressDefinition,
  ) => void;
}
const LevelingContext = createContext<LevelingContextValue | null>(null);

export function LevelingProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  const [workspace, setWorkspace] = useState<LevelingWorkspace>(emptyLevelingWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let saved = emptyLevelingWorkspace();
    try {
      const raw = localStorage.getItem(LEVELING_STORAGE_KEY);
      const parsed = readLevelingWorkspace(raw);
      if (raw && !parsed)
        setNotice(
          "The saved character setup could not be read. It has not been overwritten; you can start a new setup.",
        );
      saved = parsed ?? saved;
    } catch {
      setNotice(
        "Browser storage is unavailable. You can use the guide, but progress will last only for this visit.",
      );
    }
    const sharedRaw = new URLSearchParams(window.location.search).get("setup");
    const shared = readSharedCharacter(sharedRaw);
    if (sharedRaw && !shared)
      setNotice(
        "That shared setup is invalid. You can browse the default route or create your own character.",
      );
    if (shared) {
      const existing = saved.sessions.find(
        (entry) =>
          entry.id.startsWith("shared-") &&
          JSON.stringify(entry.profile) === JSON.stringify(shared),
      );
      if (existing) saved = { ...saved, activeId: existing.id };
      else if (saved.sessions.length < 10)
        saved = updateCharacterSession(saved, `shared-${crypto.randomUUID()}`, shared);
      else
        setNotice(
          "Ten local characters are saved. The shared setup was not imported; select an existing character.",
        );
    }
    if (
      shared &&
      saved.sessions.some(
        (entry) =>
          entry.id === saved.activeId && JSON.stringify(entry.profile) === JSON.stringify(shared),
      )
    ) {
      try {
        // Keep the share URL recoverable until its character has actually been persisted.
        localStorage.setItem(LEVELING_STORAGE_KEY, serializeLevelingWorkspace(saved));
        const url = new URL(window.location.href);
        url.searchParams.delete("setup");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      } catch {
        setNotice(
          "Browser storage is unavailable. Keep this setup link to restore your character; progress lasts only for this visit.",
        );
      }
    }
    setWorkspace(saved);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || workspace.sessions.length === 0) return;
    try {
      localStorage.setItem(LEVELING_STORAGE_KEY, serializeLevelingWorkspace(workspace));
    } catch (error: unknown) {
      setNotice(
        error instanceof Error && error.message.startsWith("Local progress")
          ? error.message
          : "Browser storage is unavailable. You can use the guide, but progress will last only for this visit.",
      );
    }
  }, [loaded, workspace]);

  function saveCharacter(profile: CharacterProfile, sessionId?: string): boolean {
    try {
      const next = updateCharacterSession(
        workspace,
        sessionId ?? `character-${crypto.randomUUID()}`,
        profile,
      );
      setWorkspace(next);
      return true;
    } catch (error: unknown) {
      setNotice(
        error instanceof Error ? error.message : "This character setup could not be saved.",
      );
      return false;
    }
  }
  function selectCharacter(id: string): void {
    if (workspace.sessions.some((session) => session.id === id))
      setWorkspace({ ...workspace, activeId: id });
  }
  function rememberPosition(sessionId: string, position: ReadingPosition): void {
    setWorkspace((current) => rememberReadingPosition(current, sessionId, position));
  }
  function importBackup(incoming: LevelingWorkspace): void {
    const merged = mergeLevelingBackup(workspace, incoming);
    // Persist before acknowledging an import; denied storage must leave the current state untouched.
    localStorage.setItem(LEVELING_STORAGE_KEY, serializeLevelingWorkspace(merged));
    setWorkspace(merged);
    setNotice(
      "Backup imported. Existing character settings and already-saved chapter progress were kept.",
    );
  }
  function setProgress(
    chapterId: string,
    stepId: string,
    progress: StepProgress,
    definition?: ImportedProgressDefinition,
  ): void {
    if (workspace.activeId)
      setWorkspace((current) =>
        updateStepProgress(
          current,
          current.activeId ?? "",
          chapterId,
          stepId,
          progress,
          definition,
        ),
      );
  }
  const session = workspace.sessions.find((entry) => entry.id === workspace.activeId) ?? null;
  return (
    <LevelingContext.Provider
      value={{
        workspace,
        session,
        loaded,
        notice,
        saveCharacter,
        selectCharacter,
        setProgress,
        rememberPosition,
        importBackup,
      }}
    >
      {children}
    </LevelingContext.Provider>
  );
}

export function useLeveling(): LevelingContextValue {
  const context = useContext(LevelingContext);
  if (!context) throw new Error("Leveling context is required");
  return context;
}
