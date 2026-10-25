import { z } from "zod";

export const KFC_GUILD_ID = "1411533815356194968";
export const KFC_CERTIFIED_ROLE_ID = "1411680778185736242";
export const GUIDE_AUTH_PATH = "/tools/api/guide-auth";
export const GUIDE_HOME = "/tools/forever/leveling";
export const GUIDE_SUPPORT_AMOUNT = 999;
export const GUIDE_SUPPORT_CURRENCY = "USD";
const snowflake = z.string().regex(/^\d{17,20}$/);

export interface GuideAccessSettings {
  readonly origin: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly sessionSecret: string;
  readonly botToken: string;
  readonly downloadsEnabled: boolean;
  readonly previewIds?: readonly string[];
  readonly paymentsEnabled: boolean;
  readonly ready: boolean;
}

export function readGuideAccessSettings(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GuideAccessSettings {
  const candidate = environment.GUIDE_SITE_ORIGIN || "https://kfcguild.online";
  let origin = "";
  try {
    const url = new URL(candidate);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      (url.protocol === "https:" ||
        (environment.NODE_ENV !== "production" && local && url.protocol === "http:"))
    )
      origin = url.origin;
  } catch {
    /* Invalid deployment configuration disables authentication. */
  }
  const clientId = environment.GUIDE_DISCORD_CLIENT_ID || "";
  const clientSecret = environment.GUIDE_DISCORD_CLIENT_SECRET || "";
  const sessionSecret = environment.GUIDE_AUTH_SECRET || "";
  const botToken = environment.GUIDE_DISCORD_BOT_TOKEN || "";
  const preview = z
    .array(snowflake)
    .max(10)
    .safeParse(
      (environment.GUIDE_DOWNLOAD_PREVIEW_IDS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
  const ready = Boolean(
    origin &&
    snowflake.safeParse(clientId).success &&
    clientSecret.trim() &&
    sessionSecret.trim().length >= 32 &&
    ![environment.AUTH_SECRET, environment.NEXTAUTH_SECRET, environment.COMMUNITY_AUTH_SECRET]
      .filter(Boolean)
      .includes(sessionSecret) &&
    botToken.trim(),
  );
  return {
    origin,
    clientId,
    clientSecret,
    sessionSecret,
    botToken,
    ready,
    downloadsEnabled: ready && environment.LEVELING_GUIDE_DOWNLOADS_ENABLED === "1",
    previewIds: ready && preview.success ? [...new Set(preview.data)] : [],
    paymentsEnabled:
      ready &&
      environment.LEVELING_GUIDE_DOWNLOADS_ENABLED === "1" &&
      environment.GUIDE_SUPPORT_PAYMENTS_ENABLED === "1",
  };
}

export function guideReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith("/tools/forever/leveling")
  )
    return GUIDE_HOME;
  const url = new URL(value, "https://guide.invalid");
  if (!/^\/tools\/forever\/leveling(?:\/routes\/alliance-[a-z-]+)?$/.test(url.pathname) || url.hash)
    return GUIDE_HOME;
  if (
    [...url.searchParams].some(
      ([key, value]) => !["plan", "class"].includes(key) || !/^[a-z-]{1,30}$/.test(value),
    )
  )
    return GUIDE_HOME;
  return url.pathname + url.search;
}

export function guideSameOrigin(request: Request, settings: GuideAccessSettings): boolean {
  return Boolean(
    settings.origin &&
    request.headers.get("origin") === settings.origin &&
    request.headers.get("sec-fetch-site") !== "cross-site",
  );
}
