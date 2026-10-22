import { z } from "zod";

function hasControlCharacters(value: string): boolean {
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

const sourcePaths = {
  leveling:
    /^\/tools\/forever\/leveling\/routes\/[a-z0-9-]{2,90}(?:\/(?:chapters|dungeons)\/[a-z0-9-]{2,120})?$/,
  quest: /^\/tools\/forever\/encyclopedia\/quests\/[1-9]\d{0,7}$/,
  dungeon: /^\/tools\/forever\/encyclopedia\/instances\/[1-9]\d{0,7}$/,
} as const;

export const toolGroupDraftSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["leveling", "quest", "dungeon"]),
    label: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .refine((value) => !hasControlCharacters(value), "Control characters are not allowed."),
    sourceUrl: z.string().max(1400),
    faction: z.enum(["Alliance", "Horde"]).optional(),
    capacity: z.number().int().min(2).max(5).optional(),
  })
  .strict()
  .superRefine((draft, context) => {
    try {
      const url = new URL(draft.sourceUrl);
      if (
        draft.kind === "leveling" &&
        draft.faction &&
        !url.pathname.startsWith(`/tools/forever/leveling/routes/${draft.faction.toLowerCase()}-`)
      )
        throw new Error("The route faction does not match the group");
      if (
        url.origin !== "https://kfcguild.online" ||
        url.username ||
        url.password ||
        url.hash ||
        !sourcePaths[draft.kind].test(url.pathname)
      )
        throw new Error("Invalid source");
      const seen = new Set<string>();
      for (const [key, value] of url.searchParams) {
        if (
          !["setup", "plan", "class", "chapter", "edition"].includes(key) ||
          seen.has(key) ||
          value.length > 800 ||
          hasControlCharacters(value)
        )
          throw new Error("Invalid source settings");
        seen.add(key);
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "Choose a public KFC Forever route, quest or dungeon link.",
      });
    }
  });

export type ToolGroupDraft = z.infer<typeof toolGroupDraftSchema>;

export function encodeToolGroupDraft(draft: ToolGroupDraft): string {
  const parsed = toolGroupDraftSchema.parse(draft);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (encoded.length > 2400) throw new Error("This shared plan is too large.");
  return encoded;
}

export function decodeToolGroupDraft(value: unknown): ToolGroupDraft | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,2400}$/.test(value)) return null;
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
    const parsed = toolGroupDraftSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function toolGroupCreatePath(draft: ToolGroupDraft): string {
  return `/raids/new?${new URLSearchParams({ draft: encodeToolGroupDraft(draft) })}`;
}

export function toolGroupEventType(draft: ToolGroupDraft): "dungeon" | "questing" {
  return draft.kind === "dungeon" || new URL(draft.sourceUrl).pathname.includes("/dungeons/")
    ? "dungeon"
    : "questing";
}
