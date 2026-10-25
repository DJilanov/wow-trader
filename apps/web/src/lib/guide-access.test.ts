import { describe, expect, it, vi } from "vitest";
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));
import {
  GUIDE_HOME,
  KFC_CERTIFIED_ROLE_ID,
  guideReturnPath,
  guideSameOrigin,
  readGuideAccessSettings,
} from "./guide-access-config";
import { checkKfcCertifiedRole } from "./guide-access-policy";
import { guideAuthOptions } from "./guide-auth";

const id = "407839813769756693";
const environment = {
  GUIDE_SITE_ORIGIN: "https://kfcguild.online",
  GUIDE_DISCORD_CLIENT_ID: "1554796912673169428",
  GUIDE_DISCORD_CLIENT_SECRET: "test-only-client-secret",
  GUIDE_AUTH_SECRET: "a".repeat(64),
  GUIDE_DISCORD_BOT_TOKEN: "test-only-token",
};
describe("guide access configuration and authentication", () => {
  it("keeps payment and downloads off without explicit independent activation", () => {
    expect(readGuideAccessSettings({})).toMatchObject({
      ready: false,
      downloadsEnabled: false,
      paymentsEnabled: false,
    });
    expect(readGuideAccessSettings(environment)).toMatchObject({
      ready: true,
      downloadsEnabled: false,
      paymentsEnabled: false,
    });
    expect(
      readGuideAccessSettings({ ...environment, GUIDE_SUPPORT_PAYMENTS_ENABLED: "1" })
        .paymentsEnabled,
    ).toBe(false);
    expect(
      readGuideAccessSettings({
        ...environment,
        LEVELING_GUIDE_DOWNLOADS_ENABLED: "1",
        GUIDE_SUPPORT_PAYMENTS_ENABLED: "1",
      }).paymentsEnabled,
    ).toBe(true);
    for (const origin of [
      "https://user:password@kfcguild.online",
      "http://kfcguild.online",
      "https://kfcguild.online/other",
      "https://kfcguild.online?bad=1",
    ]) {
      expect(
        readGuideAccessSettings({
          ...environment,
          NODE_ENV: "production",
          GUIDE_SITE_ORIGIN: origin,
        }).ready,
      ).toBe(false);
    }
  });
  it("rejects cross-origin writes and unsafe OAuth return paths", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/tools/forever/leveling/access",
      "/tools/forever/leveling/../admin",
      "/tools/forever/leveling?token=secret",
      ["bad"],
      undefined,
    ])
      expect(guideReturnPath(value)).toBe(GUIDE_HOME);
    const path = `${GUIDE_HOME}/routes/alliance-human?plan=premade&class=warrior`;
    expect(guideReturnPath(path)).toBe(path);
    const settings = readGuideAccessSettings(environment);
    expect(
      guideSameOrigin(
        new Request(settings.origin, { headers: { origin: "https://evil.example" } }),
        settings,
      ),
    ).toBe(false);
    expect(
      guideSameOrigin(
        new Request(settings.origin, {
          headers: { origin: settings.origin, "sec-fetch-site": "cross-site" },
        }),
        settings,
      ),
    ).toBe(false);
    expect(
      guideSameOrigin(
        new Request(settings.origin, { headers: { origin: settings.origin } }),
        settings,
      ),
    ).toBe(true);
  });
  it("isolates guide cookies from staff auth and uses only Discord identify scope", () => {
    const options = guideAuthOptions(readGuideAccessSettings(environment));
    expect(options.cookies?.sessionToken).toMatchObject({
      name: "__Secure-kfc-guide.session-token",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/tools" },
    });
    const provider = options.providers[0];
    expect(typeof provider).toBe("object");
    expect(provider).toMatchObject({
      options: { checks: ["pkce", "state"], authorization: { params: { scope: "identify" } } },
    });
  });
});
describe("KFC certified role boundary", () => {
  it("does not accept ordinary Discord membership or other roles", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ user: { id }, roles: ["1411533815356194968"] }));
    expect(await checkKfcCertifiedRole(id, "secret", fetcher)).toBe("not_certified");
    fetcher.mockResolvedValueOnce(Response.json({ user: { id }, roles: [KFC_CERTIFIED_ROLE_ID] }));
    expect(await checkKfcCertifiedRole(id, "secret", fetcher)).toBe("certified");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://discord.com/api/v10/guilds/1411533815356194968/members/${id}`,
    );
    expect(fetcher.mock.calls[0]?.[1]?.cache).toBe("no-store");
  });
  it("fails closed for missing roles, a mismatched user, errors and rate limits", async () => {
    for (const response of [
      Response.json({ user: { id: "216148895888048138" }, roles: [KFC_CERTIFIED_ROLE_ID] }),
      Response.json({ user: { id } }),
      new Response(null, { status: 429 }),
      new Response(null, { status: 403 }),
    ]) {
      expect(
        await checkKfcCertifiedRole(
          id,
          "secret",
          vi.fn<typeof fetch>().mockResolvedValue(response),
        ),
      ).toBe("unavailable");
    }
    expect(
      await checkKfcCertifiedRole(
        id,
        "secret",
        vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
      ),
    ).toBe("not_certified");
    expect(
      await checkKfcCertifiedRole(
        id,
        "secret",
        vi.fn<typeof fetch>().mockRejectedValue(new Error("network")),
      ),
    ).toBe("unavailable");
    const fetcher = vi.fn<typeof fetch>();
    expect(await checkKfcCertifiedRole("bad", "secret", fetcher)).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
