import { z } from "zod";
import { KFC_CERTIFIED_ROLE_ID, KFC_GUILD_ID } from "./guide-access-config";

export type CertifiedAccess = "certified" | "not_certified" | "unavailable";

export async function checkKfcCertifiedRole(
  discordId: string,
  botToken: string,
  fetcher: typeof fetch = fetch,
): Promise<CertifiedAccess> {
  if (!/^\d{17,20}$/.test(discordId) || !botToken.trim()) return "unavailable";
  try {
    const response = await fetcher(
      `https://discord.com/api/v10/guilds/${KFC_GUILD_ID}/members/${discordId}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 404) return "not_certified";
    if (!response.ok) return "unavailable";
    const parsed = z
      .object({
        user: z.object({ id: z.literal(discordId) }),
        roles: z.array(z.string().regex(/^\d{17,20}$/)).max(250),
      })
      .safeParse(await response.json());
    if (!parsed.success) return "unavailable";
    return parsed.data.roles.includes(KFC_CERTIFIED_ROLE_ID) ? "certified" : "not_certified";
  } catch {
    return "unavailable";
  }
}
