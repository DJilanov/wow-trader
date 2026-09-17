export interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export function createFraction(numerator: bigint, denominator: bigint): Fraction {
  if (numerator < 0n) {
    throw new RangeError("Fraction numerator cannot be negative");
  }

  if (denominator <= 0n) {
    throw new RangeError("Fraction denominator must be positive");
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

export function multiplyFractionFloor(amount: bigint, fraction: Fraction): bigint {
  if (amount < 0n) {
    throw new RangeError("Amount cannot be negative");
  }

  return (amount * fraction.numerator) / fraction.denominator;
}

export function applyBasisPointsFloor(amount: bigint, basisPoints: number): bigint {
  assertBasisPoints(basisPoints);

  if (amount < 0n) {
    throw new RangeError("Amount cannot be negative");
  }

  return (amount * BigInt(basisPoints)) / 10_000n;
}

export function calculateSignedBasisPoints(value: bigint, reference: bigint): bigint | null {
  if (reference <= 0n) {
    return null;
  }

  return (value * 10_000n) / reference;
}

export function assertBasisPoints(basisPoints: number): void {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError("Basis points must be an integer from 0 to 10000");
  }
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a === 0n ? 1n : a;
}
