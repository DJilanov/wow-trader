import assert from "node:assert/strict";

/**
 * @param {readonly string[]} documents
 * @param {string | undefined} groupPrefix Optional compact name for a single source group.
 * @returns {string[]}
 */
export function groupRestedXpDocumentsByLevel(documents, groupPrefix) {
  const guides = documents.map((content) => {
    const name = /^#name ([^\r\n]+)\r?$/m.exec(content)?.[1];
    const group = /^#group ([^\r\n]+)\r?$/m.exec(content)?.[1];
    const levels = /^\d+ · (\d+)-(\d+) · /u.exec(name ?? "");
    assert(
      name && group && levels,
      "Level grouping requires a numbered chapter with a level range.",
    );
    const from = Number(levels[1]);
    const to = Number(levels[2]);
    assert(from >= 1 && from <= to && to <= 60, "Chapter level range must be within 1–60.");
    assert(!/[\\;]/.test(name + group), "Guide identities contain unsupported link separators.");
    const band = from < 20 ? "01-20" : from < 40 ? "20-40" : "40-60";
    const newGroup = `${groupPrefix ?? group} · ${band}`;
    assert(newGroup.length <= 300 && !/[\r\n\0\\;]/.test(newGroup), "Invalid level group name.");
    return { content, name, group, newGroup };
  });
  if (groupPrefix !== undefined)
    assert(
      new Set(guides.map((guide) => guide.group)).size === 1,
      "A compact level-group prefix requires one source group.",
    );
  const byIdentity = new Map(guides.map((guide) => [guide.group + "\0" + guide.name, guide]));
  assert(byIdentity.size === guides.length, "Duplicate guide identity.");
  return guides.map((guide) => {
    let content = guide.content.replace(/^#group [^\r\n]+\r?$/m, () => "#group " + guide.newGroup);
    const next = /^#next ([^\r\n]+)\r?$/m.exec(content)?.[1];
    if (!next) return content;
    assert(!next.includes(";"), "Level grouping requires a single next-chapter link.");
    const separator = next.lastIndexOf("\\");
    const nextGroup = separator < 0 ? guide.group : next.slice(0, separator);
    const nextName = separator < 0 ? next : next.slice(separator + 1);
    const target = byIdentity.get(nextGroup + "\0" + nextName);
    assert(target, "Next chapter is missing from the export.");
    const link =
      target.newGroup === guide.newGroup ? target.name : target.newGroup + "\\" + target.name;
    content = content.replace(/^#next [^\r\n]+\r?$/m, () => "#next " + link);
    return content;
  });
}
