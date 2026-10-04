"use client";

import { useState } from "react";
import type { StepProgress } from "../lib/leveling-experience";

interface CompletionOptions {
  readonly scope: string;
  readonly selectedId: string | null;
  readonly enabled: boolean;
  readonly progress: Readonly<Record<string, StepProgress>>;
  readonly mark: (id: string, status: StepProgress) => void;
  readonly advance: () => void;
  readonly restore: (id: string) => void;
}
interface CompletionActions {
  readonly doneDisabled: boolean;
  readonly undoDisabled: boolean;
  readonly finish: () => void;
  readonly undo: () => void;
}
interface LastCompletion {
  readonly scope: string;
  readonly id: string;
  readonly previous: StepProgress;
}

export function useReaderCompletion(options: CompletionOptions): CompletionActions {
  const [last, setLast] = useState<LastCompletion | null>(null);
  const doneDisabled =
    !options.enabled || !options.selectedId || options.progress[options.selectedId] === "done";
  const undoDisabled =
    !options.enabled ||
    !last ||
    last.scope !== options.scope ||
    options.progress[last.id] !== "done";
  function finish(): void {
    if (doneDisabled || !options.selectedId) return;
    const id = options.selectedId;
    setLast({ scope: options.scope, id, previous: options.progress[id] ?? "pending" });
    options.mark(id, "done");
    options.advance();
  }
  function undo(): void {
    if (undoDisabled || !last) return;
    options.mark(last.id, last.previous);
    options.restore(last.id);
    setLast(null);
  }
  return { doneDisabled, undoDisabled, finish, undo };
}
