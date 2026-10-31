import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { readSigningConfiguration } = require("../apps/desktop/signing.cjs");

test("alpha packaging does not imply a publisher identity", () => {
  assert.deepEqual(readSigningConfiguration({}), { mac: null, windows: null });
});
test("macOS signing uses a Keychain profile with no embedded credentials", () => {
  const identity = "Developer ID Application: KFC Guild (TEST123456)";
  assert.deepEqual(
    readSigningConfiguration({
      WOW_TRADER_MAC_SIGN_IDENTITY: identity,
      WOW_TRADER_NOTARY_PROFILE: "wow-trader",
    }).mac,
    { osxSign: { identity }, osxNotarize: { keychainProfile: "wow-trader" } },
  );
});
test("partially configured signing and invalid identities fail closed", () => {
  for (const input of [
    { WOW_TRADER_MAC_SIGN_IDENTITY: "Developer ID Application: X" },
    { WOW_TRADER_NOTARY_PROFILE: "profile" },
    { WOW_TRADER_MAC_SIGN_IDENTITY: "-", WOW_TRADER_NOTARY_PROFILE: "profile" },
    { WOW_TRADER_WINDOWS_CERT_SHA1: "not-a-thumbprint" },
  ])
    assert.throws(() => readSigningConfiguration(input));
});
test("Windows supports a certificate-store identity without exporting its key", () => {
  const input = readSigningConfiguration({
    WOW_TRADER_WINDOWS_CERT_SHA1: "a".repeat(40),
    WOW_TRADER_SIGNTOOL_PATH: "C:\\Program Files\\Windows Kits\\signtool.exe",
  });
  assert.deepEqual(input.windows.signWithParams, ["/sha1", "A".repeat(40), "/s", "My"]);
  assert.equal(input.windows.hashes[0], "sha256");
  assert.equal(input.windows.signToolPath, "C:\\Program Files\\Windows Kits\\signtool.exe");
});
