import { describe, expect, it } from "vitest";

import { nextWatchRetry } from "./watcher.js";

describe("watch retry schedule", () => {
  it("backs off exponentially and caps retries at five minutes", () => {
    let retry = nextWatchRetry(undefined, 1_000);
    expect(retry).toEqual({ attempt: 1, notBefore: 6_000, delayMilliseconds: 5_000 });

    for (let attempt = 2; attempt <= 8; attempt += 1) {
      retry = nextWatchRetry(retry, 1_000);
    }
    expect(retry).toEqual({ attempt: 8, notBefore: 301_000, delayMilliseconds: 300_000 });
  });
});
