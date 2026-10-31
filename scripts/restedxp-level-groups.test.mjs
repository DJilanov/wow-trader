import assert from "node:assert/strict";
import test from "node:test";
import { groupRestedXpDocumentsByLevel } from "./restedxp-level-groups.mjs";

function document(name, next, group = "KFC TBC") {
  return `#tbc\n#name ${name}\n#group ${group}\n${next ? "#next " + next + "\n" : ""}step\n    .accept 783 >> Accept the quest\n`;
}

test("Level groups preserve chapter order and instructions and link across the 20/40 boundaries", () => {
  const names = [
    "01 · 19-20 · A",
    "02 · 20-23 · B",
    "03 · 38-42 · C",
    "04 · 40-45 · D",
    "05 · 60-60 · E",
  ];
  const input = names.map((name, index) => document(name, names[index + 1]));
  const output = groupRestedXpDocumentsByLevel(input);
  assert.deepEqual(
    output.map((content) => /^#name (.+)$/m.exec(content)[1]),
    names,
  );
  assert.deepEqual(
    output.map((content) => /^#group (.+)$/m.exec(content)[1]),
    ["KFC TBC · 01-20", "KFC TBC · 20-40", "KFC TBC · 20-40", "KFC TBC · 40-60", "KFC TBC · 40-60"],
  );
  assert.match(output[0], /#next KFC TBC · 20-40\\02 · 20-23 · B/);
  assert.match(output[1], /#next 03 · 38-42 · C/);
  assert.match(output[2], /#next KFC TBC · 40-60\\04 · 40-45 · D/);
  for (const [index, content] of output.entries())
    assert.equal(
      content.slice(content.indexOf("step\n")),
      input[index].slice(input[index].indexOf("step\n")),
    );
});

test("Compact names are supported without merging separate source groups", () => {
  const a = document("01 · 1-6 · A", "02 · 20-23 · B", "A long original group");
  const b = document("02 · 20-23 · B", undefined, "A long original group");
  const output = groupRestedXpDocumentsByLevel([a, b], "KFC TBC");
  assert.match(output[0], /#group KFC TBC · 01-20/);
  assert.match(output[0], /#next KFC TBC · 20-40\\02 · 20-23 · B/);
  assert.throws(
    () =>
      groupRestedXpDocumentsByLevel(
        [a, document("01 · 1-6 · A", undefined, "Other group")],
        "KFC TBC",
      ),
    /one source group/,
  );
});

test("Existing cross-group links are rewritten to the target's level group", () => {
  const output = groupRestedXpDocumentsByLevel([
    document("01 · 19-20 · A", "Other group\\02 · 20-23 · B"),
    document("02 · 20-23 · B", undefined, "Other group"),
  ]);
  assert.match(output[0], /#next Other group · 20-40\\02 · 20-23 · B/);
});

test("Malformed ranges, duplicate identities and broken chapter links fail before export", () => {
  for (const name of ["No levels", "01 · 0-6 · A", "01 · 40-20 · A", "01 · 59-61 · A"])
    assert.throws(() => groupRestedXpDocumentsByLevel([document(name)]));
  const a = document("01 · 1-6 · A");
  assert.throws(() => groupRestedXpDocumentsByLevel([a, a]), /Duplicate/);
  assert.throws(
    () => groupRestedXpDocumentsByLevel([document("01 · 1-6 · A", "Missing")]),
    /missing/,
  );
});
