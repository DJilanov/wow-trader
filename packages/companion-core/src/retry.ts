const BASE_RETRY_DELAY_MILLISECONDS = 5_000;
const MAX_RETRY_DELAY_MILLISECONDS = 300_000;

export interface WatchRetry {
  readonly attempt: number;
  readonly notBefore: number;
  readonly delayMilliseconds: number;
}

export function nextWatchRetry(previous: WatchRetry | undefined, now: number): WatchRetry {
  const attempt = (previous?.attempt ?? 0) + 1;
  const delayMilliseconds = Math.min(
    MAX_RETRY_DELAY_MILLISECONDS,
    BASE_RETRY_DELAY_MILLISECONDS * 2 ** (attempt - 1),
  );
  return { attempt, notBefore: now + delayMilliseconds, delayMilliseconds };
}
