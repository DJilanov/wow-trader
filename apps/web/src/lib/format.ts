export function formatCopper(value: bigint | string): string {
  const copper = typeof value === "bigint" ? value : BigInt(value);
  const sign = copper < 0n ? "−" : "";
  const absolute = copper < 0n ? -copper : copper;
  const gold = absolute / 10_000n;
  const silver = (absolute % 10_000n) / 100n;
  const remainder = absolute % 100n;

  return `${sign}${gold.toLocaleString()}g ${silver.toString().padStart(2, "0")}s ${remainder
    .toString()
    .padStart(2, "0")}c`;
}

export function formatPercentBasisPoints(value: bigint | number): string {
  const basisPoints = typeof value === "bigint" ? value : BigInt(value);
  const sign = basisPoints < 0n ? "−" : "";
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}%`;
}

export function formatRelativeTime(value: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
