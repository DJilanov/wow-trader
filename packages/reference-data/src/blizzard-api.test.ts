import { describe, expect, it, vi } from "vitest";
import {
  blizzardApiConfigFromEnvironment,
  requireBlizzardQuestApi,
  requestBlizzardAccessToken,
  requestBlizzardQuest,
} from "./blizzard-api.js";

const config = {
  clientId: "client123",
  clientSecret: "secret456",
  region: "eu" as const,
  namespace: "static-classic1x-eu",
  locale: "en_US",
};

describe("Blizzard Game Data API", () => {
  it("loads a validated configuration without exposing credentials", () => {
    expect(
      blizzardApiConfigFromEnvironment({
        BLIZZARD_CLIENT_ID: config.clientId,
        BLIZZARD_CLIENT_SECRET: config.clientSecret,
        BLIZZARD_API_REGION: config.region,
        BLIZZARD_API_NAMESPACE: config.namespace,
        BLIZZARD_API_LOCALE: config.locale,
      }),
    ).toEqual(config);
    expect(() =>
      blizzardApiConfigFromEnvironment({
        BLIZZARD_CLIENT_ID: "your-client-id",
        BLIZZARD_CLIENT_SECRET: config.clientSecret,
        BLIZZARD_API_NAMESPACE: config.namespace,
      }),
    ).toThrow(/placeholder/);
  });

  it("uses OAuth client credentials and returns only the access token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "temporary-token",
          token_type: "bearer",
          expires_in: 86399,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(requestBlizzardAccessToken(config, { fetcher })).resolves.toBe("temporary-token");
    const [url, request] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://oauth.battle.net/token");
    expect(request).toMatchObject({
      method: "POST",
      body: "grant_type=client_credentials",
    });
    expect(new Headers(request?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("client123:secret456").toString("base64")}`,
    );
  });

  it("extracts XP and requirements from a matching quest response", async () => {
    const evidence = await requestBlizzardQuest({
      questId: 581,
      accessToken: "temporary-token",
      region: config.region,
      namespace: config.namespace,
      locale: config.locale,
      now: () => Date.parse("2026-10-17T10:00:00.000Z"),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 581,
            title: "Hunt for Yenniku",
            level: 32,
            requirements: { min_character_level: 25 },
            rewards: { experience: 2450 },
          }),
          { status: 200 },
        ),
      ),
    });
    expect(evidence).toMatchObject({
      questId: 581,
      outcome: "available",
      title: "Hunt for Yenniku",
      questLevel: 32,
      minimumLevel: 25,
      fullXp: 2450,
      capturedAt: "2026-10-17T10:00:00.000Z",
    });
    expect(evidence.sourceUrl).toContain("namespace=static-classic1x-eu");
    expect(JSON.stringify(evidence)).not.toContain("temporary-token");
  });

  it("marks confirmed 404s and successful responses without XP for fallback", async () => {
    const missing = await requestBlizzardQuest({
      questId: 999,
      accessToken: "token",
      region: config.region,
      namespace: config.namespace,
      locale: config.locale,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 404, detail: "Not Found" }), { status: 404 }),
        ),
    });
    expect(missing).toMatchObject({ outcome: "missing", fullXp: null });

    const missingXp = await requestBlizzardQuest({
      questId: 582,
      accessToken: "token",
      region: config.region,
      namespace: config.namespace,
      locale: config.locale,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 582, title: "No XP" }), { status: 200 }),
        ),
    });
    expect(missingXp).toMatchObject({ outcome: "missing_xp", fullXp: null });
  });

  it("throws on authorization failures instead of treating them as missing quests", async () => {
    await expect(
      requestBlizzardQuest({
        questId: 581,
        accessToken: "invalid-token",
        region: config.region,
        namespace: config.namespace,
        locale: config.locale,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify({ code: 403 }), { status: 403 })),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("detects when a valid namespace does not expose the Quest API", async () => {
    await expect(
      requireBlizzardQuestApi({
        accessToken: "temporary-token",
        region: config.region,
        namespace: config.namespace,
        locale: config.locale,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify({ code: 404 }), { status: 404 })),
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("Quest API is unavailable"),
    });
  });
});
