const process = require("node:process");
function readSigningConfiguration(environment = process.env) {
  const identity = environment.WOW_TRADER_MAC_SIGN_IDENTITY?.trim();
  const profile = environment.WOW_TRADER_NOTARY_PROFILE?.trim();
  if (Boolean(identity) !== Boolean(profile))
    throw new Error(
      "Set both WOW_TRADER_MAC_SIGN_IDENTITY and WOW_TRADER_NOTARY_PROFILE for a notarized macOS release.",
    );
  if (identity && (!identity.startsWith("Developer ID Application:") || /[\r\n]/.test(identity)))
    throw new Error("Use a Developer ID Application identity from Keychain.");
  if (profile && !/^[A-Za-z0-9._-]{1,100}$/.test(profile))
    throw new Error("Use a simple Keychain profile name for notarization.");
  const thumbprint = environment.WOW_TRADER_WINDOWS_CERT_SHA1?.trim().toUpperCase();
  if (thumbprint && !/^[A-F0-9]{40}$/.test(thumbprint))
    throw new Error(
      "WOW_TRADER_WINDOWS_CERT_SHA1 must identify a certificate in the Windows certificate store.",
    );
  return {
    mac: identity ? { osxSign: { identity }, osxNotarize: { keychainProfile: profile } } : null,
    windows: thumbprint
      ? {
          signWithParams: ["/sha1", thumbprint, "/s", "My"],
          automaticallySelectCertificate: false,
          hashes: ["sha256"],
          timestampServer: "http://timestamp.digicert.com",
          ...(environment.WOW_TRADER_SIGNTOOL_PATH
            ? { signToolPath: environment.WOW_TRADER_SIGNTOOL_PATH }
            : {}),
        }
      : null,
  };
}
module.exports = { readSigningConfiguration };
