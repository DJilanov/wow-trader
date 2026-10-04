export interface ReaderPosition {
  readonly scope: string;
  readonly id: string;
  readonly mode: "pinned" | "follow";
}

export function nextReaderStep(
  stepIds: readonly string[],
  pendingIds: readonly string[],
  startId: string | null,
): string | null {
  const start = Math.max(0, startId === null ? 0 : stepIds.indexOf(startId));
  const pending = new Set(pendingIds);
  return stepIds.slice(start).find((id) => pending.has(id)) ?? null;
}

export function nextReaderStepAfter(
  stepIds: readonly string[],
  visibleIds: readonly string[],
  currentId: string | null,
): string | null {
  if (currentId === null) return null;
  const index = stepIds.indexOf(currentId);
  if (index < 0) return null;
  const visible = new Set(visibleIds);
  return stepIds.slice(index + 1).find((id) => visible.has(id)) ?? null;
}

export function readerPositionFromHistory(
  state: unknown,
  scope: string,
  stepIds: readonly string[],
): ReaderPosition | null {
  if (state === null || typeof state !== "object" || !("levelingReaderPosition" in state))
    return null;
  const position = state.levelingReaderPosition;
  if (
    position === null ||
    typeof position !== "object" ||
    !("scope" in position) ||
    position.scope !== scope ||
    !("id" in position) ||
    typeof position.id !== "string" ||
    !stepIds.includes(position.id) ||
    !("mode" in position) ||
    (position.mode !== "pinned" && position.mode !== "follow")
  )
    return null;
  return { scope, id: position.id, mode: position.mode };
}

export function writeReaderPosition(position: ReaderPosition, prefix: string): void {
  const previous: unknown = window.history.state;
  window.history.replaceState(
    {
      ...(previous !== null && typeof previous === "object" ? previous : {}),
      levelingReaderPosition: position,
    },
    "",
    `#${prefix}${encodeURIComponent(position.id)}`,
  );
}

export function readerStepFromHash(
  hash: string,
  prefix: string,
  stepIds: readonly string[],
): string | null {
  let anchor: string;
  try {
    anchor = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  if (!anchor.startsWith(prefix)) return null;
  const stepId = anchor.slice(prefix.length);
  return stepIds.includes(stepId) ? stepId : null;
}

export function scrollReaderToAnchor(anchor: string): boolean {
  const pane = document.getElementById("leveling-quest-pane");
  const target = document.getElementById(anchor);
  if (!pane || pane.getClientRects().length === 0 || !target || !pane.contains(target))
    return false;
  let parent = target.parentElement;
  while (parent && parent !== pane) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  pane.scrollTo({
    top:
      pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12,
    behavior: "instant",
  });
  return true;
}
