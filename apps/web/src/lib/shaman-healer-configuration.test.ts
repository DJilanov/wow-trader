import { describe, expect, it } from "vitest";
import { deflateSync } from "fflate";
import { configurationForShamanHealerBuild } from "@wow-trader/forever-data/shaman-healer-workspace";
import {
  shamanIndexFixture as index,
  shamanGroupFixture as group,
} from "./fixtures/shaman-healer-contract";
import {
  decodeShamanConfiguration,
  encodeShamanConfiguration,
  shamanConfigurationStorageKey,
} from "./shaman-healer-configuration";

const release = "a".repeat(24);
describe("Shaman save and share", () => {
  it("round-trips actual gear, enchants, talents, consumes and casting rules", () => {
    for (const source of group.configurations) {
      const config = configurationForShamanHealerBuild(index, group, release, source.id);
      config.iterations = 128;
      config.priorities[0]!.minimumMissingMana = 200;
      expect(decodeShamanConfiguration(encodeShamanConfiguration(config))).toEqual(config);
    }
  });
  it("rejects malformed, oversized and expanded links before restoring a build", () => {
    for (const value of [
      "",
      "!",
      "a".repeat(12001),
      "eyJ2ZXJzaW9uIjo5OTl9",
      btoa(String.fromCharCode(...deflateSync(new TextEncoder().encode(" ".repeat(70000)))))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, ""),
    ])
      expect(() => decodeShamanConfiguration(value)).toThrow();
  });
  it("separates release storage and excludes arbitrary request templates", () => {
    expect(shamanConfigurationStorageKey(release)).not.toBe(
      shamanConfigurationStorageKey("b".repeat(24)),
    );
    const config = configurationForShamanHealerBuild(index, group, release);
    expect(() =>
      encodeShamanConfiguration({ ...config, sourceRequestBase64: "injected" } as typeof config),
    ).toThrow();
  });
});
