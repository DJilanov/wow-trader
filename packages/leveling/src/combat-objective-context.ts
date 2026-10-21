import type { ImportedDirective } from "./guide-archive.js";

interface ObjectiveDirectiveContext {
  readonly all: readonly ImportedDirective[];
  readonly before: readonly ImportedDirective[];
}

export function objectiveDirectiveContext(
  directives: readonly ImportedDirective[],
  offset: number,
): ObjectiveDirectiveContext | null {
  if (directives[offset]?.tag !== ".complete") return null;
  let first = offset;
  while (first > 0 && directives[first - 1]!.tag !== ".complete") first--;
  let last = offset + 1;
  while (last < directives.length && directives[last]!.tag !== ".complete") last++;
  return { all: directives.slice(first, last), before: directives.slice(first, offset) };
}
