import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeRestedXpImport, type CampaignAction } from "@wow-trader/leveling";
import {
  browserRestedXpImport,
  campaignActionSha256,
  readRestedXpExportResponse,
} from "./leveling-restedxp-browser";
import { restedXpTestFixture } from "./leveling-restedxp.test-fixture";
afterEach(() => vi.unstubAllGlobals());

describe("local-only import generation", () => {
  it("uses the same complete action digest as the server", async () => {
    const actions: readonly CampaignAction[] = restedXpTestFixture().plan.actions;
    expect(await campaignActionSha256(actions)).toBe(
      createHash("sha256").update(JSON.stringify(actions)).digest("hex"),
    );
    expect(await campaignActionSha256([...actions].reverse())).not.toBe(
      await campaignActionSha256(actions),
    );
  });
  it("encodes only the chosen role with browser streams, with independent Node zlib decoding", async () => {
    const { documents } = restedXpTestFixture();
    const account = "KfcBrowserFixture#1234";
    const adapter = {
      compressZlib: async (bytes: Uint8Array): Promise<Uint8Array> => deflateSync(bytes),
      decompressZlib: async (bytes: Uint8Array, maximum: number): Promise<Uint8Array> =>
        inflateSync(bytes, { maxOutputLength: maximum }),
    };
    for (const role of ["leader", "party"] as const) {
      const encoded = await browserRestedXpImport(documents, role, account);
      expect((await decodeRestedXpImport(encoded, account, adapter)).guides).toEqual(
        documents.documents
          .filter((document) => document.role === role)
          .map((document) => document.content),
      );
      await expect(decodeRestedXpImport(encoded, "WrongFixture#5678", adapter)).rejects.toThrow();
      expect(encoded).not.toContain(account);
    }
  });
  it("offers the ZIP fallback when compression or secure hashing is unavailable", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    await expect(
      browserRestedXpImport(restedXpTestFixture().documents, "leader", "Fixture#1234"),
    ).rejects.toThrow("Download addon ZIP");
    vi.stubGlobal("crypto", {});
    await expect(campaignActionSha256([])).rejects.toThrow("HTTPS or localhost");
  });
  it("translates server errors without displaying arbitrary server text", async () => {
    await expect(
      readRestedXpExportResponse(Response.json({ error: "route_changed" }, { status: 409 })),
    ).rejects.toThrow("Reload this page");
    await expect(
      readRestedXpExportResponse(new Response("private server traceback", { status: 500 })),
    ).rejects.toThrow("Export failed.");
    await expect(
      readRestedXpExportResponse(
        Response.json({ error: "private server traceback" }, { status: 500 }),
      ),
    ).rejects.not.toThrow("private server traceback");
    expect(await readRestedXpExportResponse(Response.json({ publication: "review" }))).toEqual({
      publication: "review",
    });
  });
});
