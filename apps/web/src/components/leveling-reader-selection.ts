"use client";

import { useEffect, useState } from "react";
import {
  nextReaderStep,
  nextReaderStepAfter,
  previousReaderStep,
  readerPositionFromHistory,
  readerStepFromHash,
  writeReaderPosition,
  type ReaderPosition,
} from "../lib/leveling-reader-navigation";

interface ReaderSelection {
  readonly selectedId: string | null;
  readonly nextId: string | null;
  readonly previousId: string | null;
  readonly select: (id: string) => void;
  readonly next: () => void;
  readonly previous: () => void;
  readonly restore: (id: string) => void;
  readonly navigate: (hash: string) => void;
}

export function useLevelingReaderSelection(
  scope: string,
  prefix: string,
  stepIds: readonly string[],
  pendingIds: readonly string[],
  visibleIds: readonly string[],
  savedId: string | null = null,
  onRemember?: (id: string) => void,
): ReaderSelection {
  const [position, setPosition] = useState<ReaderPosition | null>(null);
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const allowedKey = stepIds.join("|");
  useEffect(() => {
    const readLocation = (): void => {
      const allowed = allowedKey.split("|");
      const id = readerStepFromHash(window.location.hash, prefix, allowed);
      const saved = readerPositionFromHistory(window.history.state, scope, allowed);
      const selectedId = id ?? saved?.id ?? (savedId && allowed.includes(savedId) ? savedId : null);
      if (!id && selectedId && !window.location.hash)
        writeReaderPosition({ scope, id: selectedId, mode: "pinned" }, prefix);
      // Old Follow history remains readable, but navigation is now explicitly manual.
      setPosition(selectedId ? { scope, id: selectedId, mode: "pinned" } : null);
      setHydratedScope(scope);
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    window.addEventListener("popstate", readLocation);
    return () => {
      window.removeEventListener("hashchange", readLocation);
      window.removeEventListener("popstate", readLocation);
    };
  }, [scope, prefix, allowedKey, savedId]);
  const cursor = position?.scope === scope && stepIds.includes(position.id) ? position : null;
  const selectedId = cursor
    ? nextReaderStep(stepIds, visibleIds, cursor.id)
    : (nextReaderStep(stepIds, pendingIds, null) ?? visibleIds[0] ?? null);
  const nextId = nextReaderStepAfter(stepIds, visibleIds, selectedId);
  const previousId = previousReaderStep(stepIds, visibleIds, selectedId);
  const cursorId = cursor?.id;
  useEffect(() => {
    if (hydratedScope === scope && selectedId) onRemember?.(selectedId);
  }, [hydratedScope, scope, selectedId, onRemember]);

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
  function previous(): void {
    if (previousId) select(previousId);
  }
  function restore(id: string): void {
    if (!stepIds.includes(id)) return;
    const next: ReaderPosition = { scope, id, mode: "pinned" };
    setPosition(next);
    writeReaderPosition(next, prefix);
  }
  function navigate(hash: string): void {
    const id = readerStepFromHash(hash, prefix, visibleIds);
    if (id) select(id);
  }
  return { selectedId, nextId, previousId, select, next, previous, restore, navigate };
}
