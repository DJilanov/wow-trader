import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForAuctionScanProcessed } from "./upload.js";

const ENDPOINT = new URL("https://helper.example.test");
const API_KEY = "test-key-with-enough-entropy";
const PAYLOAD_ID = "95e8df52-8d38-4a3c-8aad-9fbe26ff8eb8";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload processing receipt", () => {
  it("waits through processing until the server confirms completion", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(statusResponse("processing"))
      .mockResolvedValueOnce(statusResponse("processed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      waitForAuctionScanProcessed(ENDPOINT, API_KEY, PAYLOAD_ID, {
        pollIntervalMilliseconds: 0,
        timeoutMilliseconds: 1_000,
      }),
    ).resolves.toMatchObject({ payloadId: PAYLOAD_ID, status: "processed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps rejected scans out of local completed state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(statusResponse("rejected", "bad_scan")),
    );

    await expect(
      waitForAuctionScanProcessed(ENDPOINT, API_KEY, PAYLOAD_ID, {
        pollIntervalMilliseconds: 0,
        timeoutMilliseconds: 1_000,
      }),
    ).rejects.toThrow("bad_scan");
  });
});

function statusResponse(
  status: "processing" | "processed" | "rejected",
  errorCode: string | null = null,
): Response {
  return Response.json({
    payloadId: PAYLOAD_ID,
    payloadType: "auction_scan",
    status,
    receivedAt: "2026-09-16T12:00:00.000Z",
    rawPayloadUri: null,
    errorCode,
  });
}
