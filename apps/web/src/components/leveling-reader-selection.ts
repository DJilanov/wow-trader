"use client";

import { useEffect, useState } from "react";
import {
  nextReaderStep,
  readerPositionFromHistory,
  readerStepFromHash,
  writeReaderPosition,
  type ReaderPosition,
} from "../lib/leveling-reader-navigation";

interface ReaderSelection {
  readonly selectedId: string | null;
  readonly resumeId: string | null;
  readonly followingNext: boolean;
  readonly select: (id: string) => void;
  readonly follow: () => void;
  readonly navigate: (hash: string, resume: boolean) => void;
}

export function useLevelingReaderSelection(
  scope: string,
  prefix: string,
  stepIds: readonly string[],
  pendingIds: readonly string[],
  visibleIds: readonly string[],
): ReaderSelection {
  const [position, setPosition] = useState<ReaderPosition | null>(null);
  const allowedKey = stepIds.join("|");
  useEffect(() => {
    const readLocation = (): void => {
      const allowed = allowedKey.split("|");
      const id = readerStepFromHash(window.location.hash, prefix, allowed);
      const saved = readerPositionFromHistory(window.history.state, scope, allowed);
      setPosition(id ? (saved?.id === id ? saved : { scope, id, mode: "pinned" }) : null);
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    window.addEventListener("popstate", readLocation);
    return () => {
      window.removeEventListener("hashchange", readLocation);
      window.removeEventListener("popstate", readLocation);
    };
  }, [scope, prefix, allowedKey]);
  const cursor = position?.scope === scope && stepIds.includes(position.id) ? position : null;
  const pinned = cursor?.mode === "pinned" && visibleIds.includes(cursor.id);
  const resumeId = nextReaderStep(stepIds, pendingIds, cursor?.id ?? null);
  const selectedId = pinned
    ? cursor.id
    : (resumeId ?? nextReaderStep(stepIds, visibleIds, cursor?.id ?? null));
  const cursorId = cursor?.id;
  const cursorMode = cursor?.mode;

  useEffect(() => {
    if (!cursorId || pinned || !selectedId) return;
    const next: ReaderPosition = { scope, id: selectedId, mode: "follow" };
    if (cursorId !== next.id || cursorMode !== next.mode) setPosition(next);
    writeReaderPosition(next, prefix);
  }, [scope, prefix, cursorId, cursorMode, pinned, selectedId]);

  function move(id: string, mode: ReaderPosition["mode"]): void {
    if (!visibleIds.includes(id)) return;
    const next: ReaderPosition = { scope, id, mode };
    setPosition(next);
    writeReaderPosition(next, prefix);
  }
  function select(id: string): void {
    move(id, "pinned");
  }
  function follow(): void {
    if (!selectedId) return;
    // Resume from the selected place, not the chapter's first unchecked prerequisite.
    move(selectedId, "follow");
  }
  function navigate(hash: string, resume: boolean): void {
    const id = readerStepFromHash(hash, prefix, visibleIds);
    if (id) move(id, resume ? "follow" : "pinned");
  }
  return { selectedId, resumeId, followingNext: !pinned, select, follow, navigate };
}
