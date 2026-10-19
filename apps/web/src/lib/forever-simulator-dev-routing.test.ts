import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

afterEach((): void => {
  vi.unstubAllEnvs();
});

async function rewrites(): Promise<unknown> {
  if (!nextConfig.rewrites) throw new Error("Missing development simulator compatibility");
  return nextConfig.rewrites();
}

describe("Local immutable simulator routing after the tools migration", () => {
  it("proxies only versioned root assets to the actual local Next port", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORT", "3017");
    expect(await rewrites()).toEqual([
      {
        source: "/forever-sim/:release([a-f0-9]{24})/:asset*",
        destination: "http://127.0.0.1:3017/tools/forever-sim/:release/:asset*",
        basePath: false,
      },
    ]);
  });
  it("uses the standard dev port when Next has not assigned one yet", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORT", undefined);
    expect(await rewrites()).toEqual([
      expect.objectContaining({
        destination: "http://127.0.0.1:3000/tools/forever-sim/:release/:asset*",
      }),
    ]);
  });
  it("does not change production routing or proxy any remote/request-provided host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORT", "host.example:443");
    expect(await rewrites()).toEqual([]);
  });
  it("rejects malformed or out-of-range development ports", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const port of ["", "0", "-1", "65536", "3017/path", "host.example:443"]) {
      vi.stubEnv("PORT", port);
      await expect(rewrites()).rejects.toThrow("Invalid local simulator proxy port");
    }
  });
});
