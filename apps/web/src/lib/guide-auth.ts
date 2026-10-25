import NextAuth, { type NextAuthConfig, type NextAuthResult } from "next-auth";
import Discord from "next-auth/providers/discord";
import { NextRequest } from "next/server";
import {
  GUIDE_AUTH_PATH,
  GUIDE_HOME,
  guideReturnPath,
  readGuideAccessSettings,
  type GuideAccessSettings,
} from "./guide-access-config";

export function guideAuthOptions(settings: GuideAccessSettings): NextAuthConfig {
  const secure = settings.origin.startsWith("https:");
  const prefix = secure ? "__Secure-kfc-guide" : "kfc-guide";
  const cookie = (
    suffix: string,
    maxAge?: number,
  ): {
    name: string;
    options: { httpOnly: boolean; sameSite: "lax"; path: string; secure: boolean; maxAge?: number };
  } => ({
    name: `${prefix}.${suffix}`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/tools",
      secure,
      ...(maxAge ? { maxAge } : {}),
    },
  });
  return {
    basePath: GUIDE_AUTH_PATH,
    secret: settings.sessionSecret,
    trustHost: true,
    session: { strategy: "jwt", maxAge: 8 * 3600 },
    cookies: {
      sessionToken: cookie("session-token"),
      callbackUrl: cookie("callback-url"),
      csrfToken: cookie("csrf-token"),
      pkceCodeVerifier: cookie("pkce", 900),
      state: cookie("state", 900),
      nonce: cookie("nonce", 900),
    },
    pages: { signIn: "/tools/forever/leveling/access", error: "/tools/forever/leveling/access" },
    providers: [
      Discord({
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        issuer: "https://discord.com",
        authorization: {
          params: {
            scope: "identify",
            redirect_uri: `${settings.origin}${GUIDE_AUTH_PATH}/callback/discord`,
          },
        },
        checks: ["pkce", "state"],
        profile(profile) {
          return { id: profile.id, name: null, email: null, image: null };
        },
      }),
    ],
    callbacks: {
      signIn({ profile, account }): boolean {
        return (
          settings.ready &&
          account?.provider === "discord" &&
          typeof profile?.id === "string" &&
          /^\d{17,20}$/.test(profile.id)
        );
      },
      jwt({ token, profile, account }) {
        if (account?.provider === "discord" && typeof profile?.id === "string")
          token.sub = profile.id;
        token.name = null;
        token.email = null;
        token.picture = null;
        return token;
      },
      session({ session, token }) {
        if (session.user) session.user.id = token.sub || "";
        return session;
      },
      redirect({ url }): string {
        const destination = new URL(url, settings.origin || "https://kfcguild.online");
        return `${settings.origin}${destination.origin === settings.origin ? guideReturnPath(destination.pathname + destination.search) : GUIDE_HOME}`;
      },
    },
    logger: {
      error(error): void {
        console.error("Guide authentication failed", error.name);
      },
    },
  };
}

const instance = NextAuth(() => guideAuthOptions(readGuideAccessSettings()));
export const guideSignIn: NextAuthResult["signIn"] = instance.signIn;
export const guideSignOut: NextAuthResult["signOut"] = instance.signOut;

export async function guideDiscordId(): Promise<string | null> {
  if (!readGuideAccessSettings().ready) return null;
  const session = await instance.auth();
  const id = session?.user?.id;
  return id && /^\d{17,20}$/.test(id) ? id : null;
}

export async function guideAuthRequest(request: NextRequest): Promise<Response> {
  const settings = readGuideAccessSettings();
  if (!settings.ready)
    return Response.json(
      { error: "auth_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const incoming = new URL(request.url);
  const canonical = new URL(incoming.pathname + incoming.search, settings.origin);
  const headers = new Headers(request.headers);
  headers.set("host", canonical.host);
  headers.set("x-forwarded-host", canonical.host);
  headers.set("x-forwarded-proto", canonical.protocol.slice(0, -1));
  const trusted = new NextRequest(canonical, {
    method: request.method,
    headers,
    ...(request.method === "POST" ? { body: request.body, duplex: "half" as const } : {}),
  });
  return instance.handlers[request.method === "POST" ? "POST" : "GET"](trusted);
}
