"use client";

import { useEffect, useState } from "react";
import {
  nextReaderStep,
  nextReaderStepAfter,
  readerPositionFromHistory,
  readerStepFromHash,
  writeReaderPosition,
  type ReaderPosition,
} from "../lib/leveling-reader-navigation";

interface ReaderSelection {
  readonly selectedId: string | null;
  readonly nextId: string | null;
  readonly select: (id: string) => void;
  readonly next: () => void;
  readonly navigate: (hash: string) => void;
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
      const selectedId = id ?? saved?.id ?? null;
      // Old Follow history remains readable, but navigation is now explicitly manual.
      setPosition(selectedId ? { scope, id: selectedId, mode: "pinned" } : null);
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
  const selectedId = cursor
    ? nextReaderStep(stepIds, visibleIds, cursor.id)
    : (nextReaderStep(stepIds, pendingIds, null) ?? visibleIds[0] ?? null);
  const nextId = nextReaderStepAfter(stepIds, visibleIds, selectedId);
  const cursorId = cursor?.id;

  useEffect(() => {
    if (!cursorId || !selectedId || cursorId === selectedId) return;
    const next: ReaderPosition = { scope, id: selectedId, mode: "pinned" };
    setPosition(next);
    writeReaderPosition(next, prefix);
  }, [scope, prefix, cursorId, selectedId]);

  function select(id: string): void {
    if (!visibleIds.includes(id)) return;
    const next: ReaderPosition = { scope, id, mode: "pinned" };
    setPosition(next);
    writeReaderPosition(next, prefix);
  }
  function next(): void {
    if (nextId) select(nextId);
  }
  function navigate(hash: string): void {
    const id = readerStepFromHash(hash, prefix, visibleIds);
    if (id) select(id);
  }
  return { selectedId, nextId, select, next, navigate };
}
