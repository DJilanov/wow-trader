import { describe, expect, it } from "vitest";

import { companionReleaseSchema } from "./companion-release-contract";

const baseAsset = {
  architecture: "x64" as const,
  contentType: "application/zip" as const,
  byteSize: 123,
  sha256: "a".repeat(64),
  signed: false,
  recommended: false,
};

describe("Companion release manifest", () => {
  it("accepts one verified artifact for every supported desktop platform", () => {
    const release = companionReleaseSchema.parse({
      schemaVersion: 1,
      version: "0.3.3",
      channel: "maintainer-alpha",
      publishedAt: "2026-09-28T10:00:00.000Z",
      collectorVersion: "0.10.0",
      supportedProducts: ["wow_anniversary", "wow_classic_beta"],
      minimumMacOs: "12",
      minimumWindows: "10",
      minimumLinux: "Ubuntu 22.04 or equivalent with Secret Service",
      notes: [],
      assets: [
        {
          ...baseAsset,
          id: "macos-intel-dmg",
          label: "macOS Intel · DMG",
          platform: "macos",
          filename: "WoW Trader Companion-0.3.3-macOS-x64.dmg",
          contentType: "application/x-apple-diskimage",
          recommended: true,
        },
        {
          ...baseAsset,
          id: "macos-apple-silicon-dmg",
          label: "macOS Apple Silicon · DMG",
          platform: "macos",
          architecture: "arm64",
          filename: "WoW Trader Companion-0.3.3-macOS-arm64.dmg",
          contentType: "application/x-apple-diskimage",
        },
        {
          ...baseAsset,
          id: "windows-x64-zip",
          label: "Windows x64 · Portable ZIP",
          platform: "windows",
          filename: "WoW Trader Companion-0.3.3-Windows-x64.zip",
        },
        {
          ...baseAsset,
          id: "linux-x64-zip",
          label: "Linux x64 · Portable ZIP",
          platform: "linux",
          filename: "WoW Trader Companion-0.3.3-Linux-x64.zip",
        },
      ],
    });

    expect(release.assets.map((asset) => [asset.platform, asset.architecture])).toEqual([
      ["macos", "x64"],
      ["macos", "arm64"],
      ["windows", "x64"],
      ["linux", "x64"],
    ]);
  });

  it("rejects an unrecognized platform", () => {
    expect(() =>
      companionReleaseSchema.parse({
        schemaVersion: 1,
        version: "0.3.3",
        channel: "maintainer-alpha",
        publishedAt: "2026-09-28T10:00:00.000Z",
        collectorVersion: "0.10.0",
        supportedProducts: ["wow_classic_beta"],
        notes: [],
        assets: [
          {
            ...baseAsset,
            id: "android-x64-zip",
            label: "Android",
            platform: "android",
            filename: "companion.zip",
          },
        ],
      }),
    ).toThrow();
  });
});
