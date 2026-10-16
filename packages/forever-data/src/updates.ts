import { createHash } from "node:crypto";
import { load } from "cheerio";
import { z } from "zod";

export const BLIZZARD_TOPIC_ID = 631316;
export const BLIZZARD_TOPIC_URL = "https://eu.forums.blizzard.com/en/wow/t/631316";
export const BLIZZARD_TOPIC_JSON = `${BLIZZARD_TOPIC_URL}.json`;
export const BLIZZARD_NOTES_PARSER = "blizzard-forever-notes.v1";
export const FOREVER_CLASSES = [
  "Druid",
  "Hunter",
  "Mage",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
] as const;

const specs = new Set([
  "Balance",
  "Feral",
  "Restoration",
  "Beast Mastery",
  "Marksmanship",
  "Survival",
  "Arcane",
  "Fire",
  "Frost",
  "Holy",
  "Protection",
  "Retribution",
  "Discipline",
  "Shadow",
  "Assassination",
  "Combat",
  "Subtlety",
  "Elemental",
  "Enhancement",
  "Affliction",
  "Demonology",
  "Destruction",
  "Arms",
  "Fury",
]);
const headings = new Set([
  "Bug Fixes",
  "Changes and Updates",
  "Classes",
  "Racial abilities have been updated.",
  "Quests",
  "Dungeons",
  "Items",
  "Professions",
  "User Interface",
  "Player versus Player",
  "Known Issues",
  "New to this build - Known Issues",
  "General",
]);
const timestamp = z.iso.datetime({ offset: true });
const className = z.enum(FOREVER_CLASSES);
const kind = z.enum(["tuning", "structure", "tooltip", "bug_fix", "general"]);
export type OfficialChangeKind = z.infer<typeof kind>;

export const officialChangeSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    category: z.string().max(100),
    className: className.nullable(),
    specialization: z.string().max(60).nullable(),
    subject: z.string().max(120).nullable(),
    kind,
    text: z.string().min(1).max(6000),
  })
  .strict();
export type OfficialChange = z.infer<typeof officialChangeSchema>;

export const officialPostSchema = z
  .object({
    postId: z.number().int().positive(),
    postNumber: z.number().int().positive(),
    authorId: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: z.number().int().positive(),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceUrl: z.url(),
    changes: z.array(officialChangeSchema).max(3000),
  })
  .strict();
export type OfficialPost = z.infer<typeof officialPostSchema>;

export const officialNotesSchema = z
  .object({
    schema: z.literal("blizzard-forever-notes.v1"),
    topicId: z.literal(BLIZZARD_TOPIC_ID),
    title: z.string().min(1).max(300),
    posts: z.array(officialPostSchema).min(1).max(1000),
  })
  .strict();
export type OfficialNotes = z.infer<typeof officialNotesSchema>;

const discoursePostSchema = z.object({
  id: z.number().int().positive(),
  post_number: z.number().int().positive(),
  user_id: z.number().int().positive(),
  staff: z.boolean(),
  username: z.string().min(1),
  created_at: timestamp,
  updated_at: timestamp,
  version: z.number().int().positive(),
  cooked: z.string().max(1_000_000),
});
export const discourseTopicSchema = z.object({
  id: z.literal(BLIZZARD_TOPIC_ID),
  title: z.string().min(1).max(300),
  post_stream: z.object({
    posts: z.array(discoursePostSchema).max(1000),
    stream: z.array(z.number().int().positive()).min(1).max(1000),
  }),
});
export const discoursePostsSchema = z.object({
  post_stream: z.object({ posts: z.array(discoursePostSchema).max(20) }),
});
export type DiscourseTopic = z.infer<typeof discourseTopicSchema>;
export type DiscoursePost = z.infer<typeof discoursePostSchema>;

export function notesChecksum(notes: OfficialNotes): string {
  return hash(JSON.stringify(notes));
}

export function parseOfficialNotes(
  input: unknown,
  additionalPosts: readonly DiscoursePost[] = [],
): OfficialNotes {
  const topic = discourseTopicSchema.parse(input);
  const stream = new Set(topic.post_stream.stream);
  if (stream.size !== topic.post_stream.stream.length) throw new Error("Duplicate post stream ID");
  const posts = new Map<number, DiscoursePost>();
  for (const post of [...topic.post_stream.posts, ...additionalPosts]) {
    if (!stream.has(post.id)) throw new Error("Post is outside the requested topic stream");
    const previous = posts.get(post.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(post))
      throw new Error("Conflicting forum post revisions");
    posts.set(post.id, post);
  }
  if (posts.size !== stream.size) throw new Error("Incomplete official topic pagination");
  if (new Set([...posts.values()].map((post) => post.post_number)).size !== posts.size)
    throw new Error("Duplicate forum post number");
  for (const post of posts.values()) {
    if (Date.parse(post.updated_at) < Date.parse(post.created_at))
      throw new Error("Invalid forum post timestamps");
  }
  const first = [...posts.values()].find((post) => post.post_number === 1);
  if (!first?.staff) throw new Error("Official topic must be authored by Blizzard staff");
  const official = [...posts.values()]
    .filter((post) => post.staff && post.user_id === first.user_id)
    .sort((a, b) => a.post_number - b.post_number);
  return officialNotesSchema.parse({
    schema: BLIZZARD_NOTES_PARSER,
    topicId: BLIZZARD_TOPIC_ID,
    title: topic.title,
    posts: official.map((post) => {
      const changes = parseChanges(post.cooked);
      return {
        postId: post.id,
        postNumber: post.post_number,
        authorId: post.user_id,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        revision: post.version,
        contentSha256: hash(JSON.stringify(changes)),
        sourceUrl: `${BLIZZARD_TOPIC_URL}/${post.post_number}`,
        changes,
      };
    }),
  });
}

export function getChangeKind(text: string): OfficialChangeKind {
  if (/tooltip|visual bug|visual effect|visuals/i.test(text)) return "tooltip";
  if (
    /\b(?:moved|removed|replaced|prerequisite|pre-requisite|row|column)\b|\d[ -]point talent/i.test(
      text,
    )
  )
    return "structure";
  if (/\b(?:fixed|resolved|correctly)\b/i.test(text)) return "bug_fix";
  if (/\b(?:increased|reduced|cooldown|coefficient|scales?|damage|duration|cost)\b/i.test(text))
    return "tuning";
  return "general";
}

export function changedClasses(
  before: OfficialNotes | null,
  after: OfficialNotes,
): readonly string[] {
  const old = new Map(
    before?.posts.flatMap((post) => post.changes.map((change) => [change.id, change] as const)) ??
      [],
  );
  const current = new Map(
    after.posts.flatMap((post) => post.changes.map((change) => [change.id, change] as const)),
  );
  const delta = [...old.values(), ...current.values()].filter(
    (change) => old.has(change.id) !== current.has(change.id),
  );
  if (delta.some((change) => /racial|general/i.test(change.category))) return [...FOREVER_CLASSES];
  return [
    ...new Set(delta.flatMap((change) => (change.className ? [change.className] : []))),
  ].sort();
}

function parseChanges(html: string): OfficialChange[] {
  const $ = load(html);
  $("script,style,iframe,object,embed,blockquote,aside").remove();
  let category = "General";
  let currentClass: z.infer<typeof className> | null = null;
  let specialization: string | null = null;
  const result: OfficialChange[] = [];
  const seen = new Set<string>();
  $("h1,h2,h3,h4,p,li").each((_index, element) => {
    const node = $(element);
    if (node.is("p") && node.parents("li").length) return;
    const copy = node.clone();
    copy.children("ul,ol").remove();
    const text = copy
      .text()
      .replace(/\s+/g, " ")
      .replace(/^[§·\s]+/, "")
      .trim();
    if (!text) return;
    if ((FOREVER_CLASSES as readonly string[]).includes(text)) {
      currentClass = className.parse(text);
      specialization = null;
      category = "Classes";
      return;
    }
    if (specs.has(text) && currentClass) {
      specialization = text;
      return;
    }
    if (headings.has(text) || /^CHANGE LOG$/i.test(text)) {
      category = /^CHANGE LOG$/i.test(text) ? "General" : text;
      currentClass = null;
      specialization = null;
      return;
    }
    if (
      (!node.is("li") && !node.is("p")) ||
      text.length < 16 ||
      /^Developers[’'] notes:/i.test(text)
    )
      return;
    const subjectMatch = /^([^:]{2,120}):\s/.exec(text);
    const subject = subjectMatch?.[1]?.trim() ?? null;
    const value = {
      category,
      className: currentClass,
      specialization,
      subject,
      kind: getChangeKind(text),
      text,
    };
    const id = hash(JSON.stringify(value));
    if (seen.has(id)) return;
    seen.add(id);
    result.push(officialChangeSchema.parse({ id, ...value }));
  });
  return result;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
