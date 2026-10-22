import { deflateSync, inflateSync, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  encodeRestedXpImport,
  decodeRestedXpImport,
  restedXpAdler32,
  RESTEDXP_IMPORT_LIMITS,
  type RestedXpCompression,
} from "./restedxp-import.js";

const compression: RestedXpCompression = {
  compressZlib: async (bytes: Uint8Array): Promise<Uint8Array> => deflateSync(bytes),
  decompressZlib: async (bytes: Uint8Array, maximumBytes: number): Promise<Uint8Array> =>
    inflateSync(bytes, { maxOutputLength: maximumBytes }),
};
const account = "KfcFixture#1234";
const guide = (name: string): string =>
  `#forever\n#name ${name}\n#group KFC Fixture\n\nstep\n    .goto Elwynn Forest,42,64\n    >> Follow the road — do not jump off the cliff.\n`;

describe("stock RestedXP v4.11.27 import transport", () => {
  it("uses unsigned Adler-32, including the empty input", () => {
    expect(restedXpAdler32(new Uint8Array())).toBe(1);
    expect(restedXpAdler32(new TextEncoder().encode("Wikipedia"))).toBe(0x11e60398);
  });

  it("round-trips exact UTF-8 documents with the stock envelope and NUL separators", async () => {
    const documents = [guide("01 · Northshire"), guide("02 · Goldshire")];
    const encoded = await encodeRestedXpImport(documents, account, compression);
    expect(encoded).toMatch(/^2\|\d+:[A-Za-z0-9+/=]+%\|40000$/);
    expect(encoded).not.toContain(account);
    expect((await decodeRestedXpImport(encoded, account, compression)).guides).toEqual(documents);
    expect(await encodeRestedXpImport(documents, account, compression)).toBe(encoded);
  });

  it.each(["KfcFixture#1234", "kfcfixture#1234", " ÅBC测试#12345 ", "VeryLongFixtureName#123456"])(
    "keeps account byte normalization reversible for %s",
    async (battleTag: string) => {
      const encoded = await encodeRestedXpImport([guide("Unicode")], battleTag, compression);
      expect((await decodeRestedXpImport(encoded, battleTag, compression)).guides).toEqual([
        guide("Unicode"),
      ]);
    },
  );

  it("matches Lua's ASCII-only case folding", async () => {
    const encoded = await encodeRestedXpImport([guide("Case")], account, compression);
    expect(
      (await decodeRestedXpImport(encoded, account.toLowerCase(), compression)).guides,
    ).toEqual([guide("Case")]);
    await expect(decodeRestedXpImport(encoded, "OtherFixture#1234", compression)).rejects.toThrow(
      "account mismatch",
    );
  });

  it.each(["", "missing-tag", "Name#abc", "Name #1234", "Name\n#1234", "Name\uD800#1234"])(
    "rejects malformed account input without echoing it",
    async (battleTag: string) => {
      await expect(encodeRestedXpImport([guide("Input")], battleTag, compression)).rejects.toThrow(
        "Enter a BattleTag in Name#1234 format.",
      );
    },
  );

  it("rejects count changes, corruption, unsupported versions and truncation", async () => {
    const encoded = await encodeRestedXpImport([guide("Integrity")], account, compression);
    await expect(
      decodeRestedXpImport(encoded.replace(/^1\|/, "2|"), account, compression),
    ).rejects.toThrow("guide count");
    await expect(
      decodeRestedXpImport(encoded.replace(/\d+:/, "1:"), account, compression),
    ).rejects.toThrow("account mismatch");
    await expect(
      decodeRestedXpImport(encoded.replace(/40000$/, "40001"), account, compression),
    ).rejects.toThrow("Unsupported");
    await expect(
      decodeRestedXpImport(encoded.slice(0, -1), account, compression),
    ).rejects.toThrow();
    await expect(
      decodeRestedXpImport(encoded.replace(":", ":!"), account, compression),
    ).rejects.toThrow();
  });

  it("rejects noncanonical Base64 rather than silently discarding characters", async () => {
    await expect(decodeRestedXpImport("1|1:AA=%|40000", account, compression)).rejects.toThrow(
      "Base64",
    );
    await expect(decodeRestedXpImport("1|1:AB==%|40000", account, compression)).rejects.toThrow(
      "Non-canonical",
    );
  });

  it("requires zlib, not raw DEFLATE", async () => {
    await expect(
      encodeRestedXpImport([guide("Compression")], account, {
        ...compression,
        compressZlib: async (bytes: Uint8Array): Promise<Uint8Array> => deflateRawSync(bytes),
      }),
    ).rejects.toThrow("damaged payload");
  });

  it("passes a hard decompression bound and checks adapters cannot exceed it", async () => {
    const encoded = await encodeRestedXpImport([guide("Bound")], account, compression);
    await expect(
      decodeRestedXpImport(encoded, account, {
        ...compression,
        decompressZlib: async (_bytes: Uint8Array, maximum: number): Promise<Uint8Array> => {
          expect(maximum).toBe(RESTEDXP_IMPORT_LIMITS.plaintextBytes);
          return new Uint8Array(maximum + 1);
        },
      }),
    ).rejects.toThrow("size or checksum");
    await expect(
      decodeRestedXpImport(encoded, account, {
        ...compression,
        decompressZlib: async (): Promise<Uint8Array> => {
          throw new Error("adapter failure");
        },
      }),
    ).rejects.toThrow("within its size limit");
  });

  it("refuses empty bundles, HTML, Lua wrappers, injected separators and oversized content", async () => {
    for (const documents of [
      [],
      ["<html>Guide</html>"],
      [`RXPGuides.RegisterGuide([[\n${guide("Lua")}\n]])`],
      [`${guide("NUL")}\0${guide("Injected")}`],
    ])
      await expect(encodeRestedXpImport(documents, account, compression)).rejects.toThrow();
    await expect(
      encodeRestedXpImport(
        [guide("Large") + "x".repeat(RESTEDXP_IMPORT_LIMITS.plaintextBytes)],
        account,
        compression,
      ),
    ).rejects.toThrow("size limit");
    await expect(
      decodeRestedXpImport(
        "x".repeat(RESTEDXP_IMPORT_LIMITS.encodedCharacters + 1),
        account,
        compression,
      ),
    ).rejects.toThrow("size limit");
  });
});
