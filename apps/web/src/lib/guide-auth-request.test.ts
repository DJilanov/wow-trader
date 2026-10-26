import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guideAuthRequest } from "./guide-auth";
import { GUIDE_AUTH_PATH, GUIDE_HOME } from "./guide-access-config";

const origin = "https://kfcguild.online";
const discordId = "407839813769756693";
const returnTo = `${GUIDE_HOME}/routes/alliance-human?plan=premade&class=warrior&finish=dungeons`;
const publicCallback = `${origin}${GUIDE_AUTH_PATH}/callback/discord`;
const internalPath = "/api/guide-auth";

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://127.0.0.1:19210${path}`, init);
}

function updateCookies(cookies: Map<string, string>, response: Response): void {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0] || "";
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const content = pair.slice(separator + 1);
    if (content) cookies.set(name, content);
    else cookies.delete(name);
  }
}

function cookieHeader(cookies: ReadonlyMap<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

interface Authorization {
  readonly cookies: Map<string, string>;
  readonly url: URL;
}

async function startSignIn(basePath: string): Promise<Authorization> {
  const cookies = new Map<string, string>();
  const csrf = await guideAuthRequest(request(`${basePath}/csrf`));
  expect(csrf.status).toBe(200);
  updateCookies(cookies, csrf);
  const data: { csrfToken: string } = await csrf.json();
  const response = await guideAuthRequest(
    request(`${basePath}/signin/discord`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(cookies),
        origin,
      },
      body: new URLSearchParams({ csrfToken: data.csrfToken, callbackUrl: `${origin}${returnTo}` }),
    }),
  );
  expect(response.status).toBe(302);
  updateCookies(cookies, response);
  const url = new URL(response.headers.get("location") || "");
  expect(url.origin).toBe("https://discord.com");
  expect(url.searchParams.get("redirect_uri")).toBe(publicCallback);
  expect(url.searchParams.get("scope")).toBe("identify");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.has("client_secret")).toBe(false);
  return { cookies, url };
}

describe("guide authentication HTTP boundary", () => {
  beforeEach(() => {
    vi.stubEnv("GUIDE_SITE_ORIGIN", origin);
    vi.stubEnv("GUIDE_DISCORD_CLIENT_ID", "1554796912673169428");
    vi.stubEnv("GUIDE_DISCORD_CLIENT_SECRET", "test-only-client-secret");
    vi.stubEnv("GUIDE_AUTH_SECRET", "test-only-isolated-guide-session-secret-".repeat(2));
    vi.stubEnv("GUIDE_DISCORD_BOT_TOKEN", "test-only-bot-token");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected network")));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  for (const basePath of [GUIDE_AUTH_PATH, internalPath]) {
    it(`serves an anonymous session at ${basePath} without an external request`, async () => {
      const response = await guideAuthRequest(request(`${basePath}/session`));
      expect(response.status).toBe(200);
      expect(await response.json()).toBe(null);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(fetch).not.toHaveBeenCalled();
    });

    it(`keeps public provider URLs canonical at ${basePath}`, async () => {
      const response = await guideAuthRequest(
        request(`${basePath}/providers`, {
          headers: { host: "untrusted.example", "x-forwarded-host": "untrusted.example" },
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        discord: { callbackUrl: publicCallback, signinUrl: `${origin}${GUIDE_AUTH_PATH}/signin/discord` },
      });
    });

    it(`completes a synthetic PKCE/state callback at ${basePath}`, async () => {
      const authorization = await startSignIn(basePath);
      const network = vi.mocked(fetch);
      network.mockImplementation(async (input, init): Promise<Response> => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.href === "https://discord.com/api/oauth2/token") {
          expect(init?.method).toBe("POST");
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("code")).toBe("test-only-oauth-code");
          expect(body.get("redirect_uri")).toBe(publicCallback);
          expect(body.get("code_verifier")).toBeTruthy();
          return Response.json({
            access_token: "test-only-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "identify",
          });
        }
        if (url.href === "https://discord.com/api/users/@me") {
          return Response.json({ id: discordId, username: "Test member", avatar: null });
        }
        throw new Error("Unexpected network");
      });
      const query = new URLSearchParams({
        code: "test-only-oauth-code",
        state: authorization.url.searchParams.get("state") || "",
        iss: "https://discord.com",
      });
      const callback = await guideAuthRequest(
        request(`${basePath}/callback/discord?${query}`, {
          headers: { cookie: cookieHeader(authorization.cookies) },
        }),
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(`${origin}${returnTo}`);
      expect(network).toHaveBeenCalledTimes(2);
      updateCookies(authorization.cookies, callback);
      const session = await guideAuthRequest(
        request(`${basePath}/session`, { headers: { cookie: cookieHeader(authorization.cookies) } }),
      );
      expect(session.status).toBe(200);
      expect(await session.json()).toMatchObject({
        user: { id: discordId, name: null, email: null, image: null },
      });
      expect(console.error).not.toHaveBeenCalled();
    });
  }

  for (const invalid of ["missing-cookie", "mismatched-state", "wrong-issuer"]) {
    it(`rejects a ${invalid} callback before exchanging any code`, async () => {
      const authorization = await startSignIn(internalPath);
      const query = new URLSearchParams({
        code: "test-only-oauth-code",
        state:
          invalid === "mismatched-state"
            ? "test-only-forged-state"
            : authorization.url.searchParams.get("state") || "",
        iss: invalid === "wrong-issuer" ? "https://untrusted.example" : "https://discord.com",
      });
      const response = await guideAuthRequest(
        request(`${internalPath}/callback/discord?${query}`, {
          headers: { cookie: invalid === "missing-cookie" ? "" : cookieHeader(authorization.cookies) },
        }),
      );
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location") || "");
      expect(location.origin).toBe(origin);
      expect(location.pathname).toBe(`${GUIDE_HOME}/access`);
      expect(location.searchParams.has("error")).toBe(true);
      expect(response.headers.getSetCookie().some((value) => value.includes(".session-token="))).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });
  }

  it("returns to guide access if Discord authorization is declined", async () => {
    const authorization = await startSignIn(internalPath);
    const query = new URLSearchParams({
      error: "access_denied",
      state: authorization.url.searchParams.get("state") || "",
      iss: "https://discord.com",
    });
    const response = await guideAuthRequest(
      request(`${internalPath}/callback/discord?${query}`, {
        headers: { cookie: cookieHeader(authorization.cookies) },
      }),
    );
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location") || "").pathname).toBe(`${GUIDE_HOME}/access`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still requires CSRF verification before starting an HTTP sign-in", async () => {
    const response = await guideAuthRequest(
      request(`${internalPath}/signin/discord`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({ callbackUrl: `${origin}${returnTo}` }),
      }),
    );
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location") || "").pathname).toBe(`${GUIDE_HOME}/access`);
    expect(response.headers.getSetCookie().some((value) => value.includes(".pkce="))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not reinterpret a different authentication route as guide authentication", async () => {
    const response = await guideAuthRequest(request("/api/guide-auth-other/session"));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Guide authentication failed", "UnknownAction");
  });

  it("fails closed when guide authentication is not configured", async () => {
    vi.stubEnv("GUIDE_AUTH_SECRET", "");
    const response = await guideAuthRequest(request(`${internalPath}/session`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "auth_unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
