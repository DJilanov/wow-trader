interface ItemTitle {
  readonly itemId: number;
  readonly name: string;
}

interface CapturedItemObjective {
  readonly quantity: number;
  readonly provided: boolean;
}

/** Reuse named objective rows in older captures, without parsing prose numbers or rewards. */
export function capturedItemObjectives(
  objectives: readonly string[],
  titles: readonly ItemTitle[],
): ReadonlyMap<number, CapturedItemObjective> {
  const normalize = (value: string): string => value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const identities = new Map<string, Set<number>>();
  for (const { itemId, name } of titles) {
    const title = normalize(name).toLowerCase();
    if (!title) continue;
    const ids = identities.get(title) ?? new Set<number>();
    ids.add(itemId);
    identities.set(title, ids);
  }
  if (!identities.size) return new Map();
  const alternatives = [...identities.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(
    `(${alternatives})\\s*(\\(Provided\\)\\s*)?\\((\\d+)\\)(?=$|[\\s,;.!])`,
    "gi",
  );
  const claims = new Map<number, CapturedItemObjective[]>();
  for (const objective of objectives) {
    const text = normalize(objective).split(/\bProvided item:/i)[0]!;
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(0, match.index);
      if (prefix.trim() && !/[.!?:)]\s*$/.test(prefix)) continue;
      const ids = identities.get(match[1]!.toLowerCase());
      const quantity = Number(match[3]);
      if (ids?.size !== 1 || quantity < 1 || quantity > 10000) continue;
      const itemId = [...ids][0]!,
        values = claims.get(itemId) ?? [];
      values.push({ quantity, provided: match[2] !== undefined });
      claims.set(itemId, values);
    }
  }
  return new Map(
    [...claims]
      .filter(([, rows]) =>
        rows.every(
          (row) => row.quantity === rows[0]!.quantity && row.provided === rows[0]!.provided,
        ),
      )
      .map(([itemId, rows]) => [itemId, rows[0]!]),
  );
}
