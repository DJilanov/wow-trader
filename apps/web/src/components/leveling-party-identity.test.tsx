import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, recordPremadeMemberIdentity } from "@wow-trader/leveling";
import { LevelingPartyIdentity } from "./leveling-party-identity";

describe("party identity controls", () => {
  it("keeps the selected leader edition fixed and leaves the other four explicitly unknown", () => {
    const markup = renderToStaticMarkup(
      <LevelingPartyIdentity
        progress={emptyPremadeProgress()}
        disabled={false}
        leader={{ raceId: "human", classSlug: "priest" }}
        onChange={() => {}}
      />,
    );
    expect(markup).toContain("selected route edition");
    expect(markup).not.toContain('aria-label="Player 1 race"');
    expect(markup.match(/<select/g)).toHaveLength(8);
    expect(markup).toContain("Unknown members stay unverified");
  });
  it("renders saved identities and respects read-only state", () => {
    const progress = recordPremadeMemberIdentity(emptyPremadeProgress(), 1, {
      raceId: "gnome",
      classSlug: "priest",
    });
    const markup = renderToStaticMarkup(
      <LevelingPartyIdentity progress={progress} disabled={true} onChange={() => {}} />,
    );
    expect(markup).toContain('value="gnome" selected=""');
    expect(markup).toContain('value="priest" selected=""');
    expect(markup.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(5);
  });
});
