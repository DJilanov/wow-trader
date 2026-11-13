import type {
  LevelingItem,
  LevelingRecoveryLine,
  ProfessionLevelingOptions,
} from "./profession-leveling-types";

interface RecoveryRate {
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly method: "vendor" | "disenchant";
  readonly evidence: string;
}
export interface LevelingRecoveryPricer {
  readonly scale: bigint;
  readonly rates: ReadonlyMap<number, RecoveryRate & { readonly scaled: bigint }>;
}

function gcd(left: bigint, right: bigint): bigint {
  while (right) [left, right] = [right, left % right];
  return left;
}

export function createLevelingRecoveryPricer(
  items: readonly LevelingItem[],
  options: ProfessionLevelingOptions,
): LevelingRecoveryPricer {
  const mode = options.recoveryMode ?? "vendor";
  const fee = BigInt(options.disenchantFeeCopper ?? "0");
  const rates = new Map<number, RecoveryRate>();
  let scale = 1n;
  for (const item of items) {
    if (!item.recovery || mode === "none") continue;
    let rate: RecoveryRate = {
      numerator: BigInt(item.recovery.vendorCopper),
      denominator: 1n,
      method: "vendor",
      evidence: "Captured vendor sell price",
    };
    const de = item.recovery.disenchant;
    if (
      mode === "best" &&
      de &&
      (options.enchantingSkill ?? 1) >= de.requiredSkill &&
      (item.recovery.binding !== 1 || options.disenchantAccess === "self")
    ) {
      const denominator = BigInt(de.denominator);
      const numerator = BigInt(de.numerator) - fee * denominator;
      if (denominator <= 0n) throw new Error("Invalid disenchant recovery denominator.");
      if (numerator * rate.denominator > rate.numerator * denominator)
        rate = { numerator, denominator, method: "disenchant", evidence: de.evidence };
    }
    if (rate.numerator <= 0n) continue;
    rates.set(item.id, rate);
    scale = (scale / gcd(scale, rate.denominator)) * rate.denominator;
  }
  return {
    scale,
    rates: new Map(
      [...rates].map(([id, rate]) => [
        id,
        { ...rate, scaled: rate.numerator * (scale / rate.denominator) },
      ]),
    ),
  };
}

export function quoteLevelingRecoveries(
  remaining: ReadonlyMap<number, number>,
  items: ReadonlyMap<number, LevelingItem>,
  pricing: LevelingRecoveryPricer,
): { readonly total: bigint; readonly lines: readonly LevelingRecoveryLine[] } {
  const rows = [...remaining].flatMap(([id, quantity]) => {
    const rate = pricing.rates.get(id);
    if (!rate || quantity <= 0) return [];
    const scaled = rate.scaled * BigInt(quantity);
    return [
      {
        itemId: id,
        name: items.get(id)?.name ?? `Item ${id}`,
        quantity,
        method: rate.method,
        evidence: rate.evidence,
        value: scaled / pricing.scale,
        remainder: scaled % pricing.scale,
      },
    ];
  });
  const total =
    rows.reduce((sum, row) => sum + row.value * pricing.scale + row.remainder, 0n) / pricing.scale;
  const rounded = rows.reduce((sum, row) => sum + row.value, 0n);
  // Allocate aggregate fractional copper deterministically so the displayed lines match the total.
  const order = [...rows].sort((a, b) =>
    a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : a.itemId - b.itemId,
  );
  for (let index = 0; index < Number(total - rounded); index++) order[index]!.value++;
  return {
    total,
    lines: rows.map(({ value, remainder: _remainder, ...row }) => ({
      ...row,
      valueCopper: value.toString(),
    })),
  };
}
