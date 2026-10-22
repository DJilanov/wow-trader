import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForeverDpsTierList } from "./forever-dps-tier-list";
import snapshotData from "../lib/data/forever-dps-tier-list.json";
import { dpsTierSnapshotSchema, rankDpsTierEntries } from "../lib/forever-dps-tier-list";

describe("server-rendered tier-list board", () => {
  it("renders every measured spec, usable links and evidence before hydration", () => {
    const entries = rankDpsTierEntries(dpsTierSnapshotSchema.parse(snapshotData));
    const html = renderToStaticMarkup(createElement(ForeverDpsTierList, { entries }));
    expect(html).toContain("21 measured builds");
    expect(html).toContain("Find a spec or class");
    expect(html).toContain("All classes");
    expect(html.match(/<details>/g)).toHaveLength(21);
    expect(html).toContain("Approximate 95% sampling margin");
    expect(html).toContain("View gear &amp; rotation");
    expect(html).toContain("/tools/forever-sim/");
    expect(html).not.toContain("helper.kfcguild.online");
    for (const entry of entries)
      expect(html).toContain(entry.simulatorHref.replaceAll("&", "&amp;"));
  });
});
