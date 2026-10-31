import process from "node:process";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
const execute = promisify(execFile);

export async function verifyCompanionPublisher(platform, sourcePath, signing) {
  if (platform === "macos" && signing.mac) {
    if (process.platform !== "darwin")
      throw new Error("Verify signed macOS releases on a macOS runner.");
    const mount = await mkdtemp(path.join(tmpdir(), "wow-trader-signing-"));
    let mounted = false;
    try {
      await execute("hdiutil", [
        "attach",
        "-readonly",
        "-nobrowse",
        "-mountpoint",
        mount,
        sourcePath,
      ]);
      mounted = true;
      const bundle = path.join(mount, "WoW Trader Companion.app");
      await execute("codesign", ["--verify", "--deep", "--strict", bundle]);
      const details = await execute("codesign", ["--display", "--verbose=4", bundle]);
      if (
        !/Authority=Developer ID Application:/.test(details.stderr) ||
        !/flags=.*runtime/.test(details.stderr)
      )
        throw new Error("The release does not have a Developer ID hardened-runtime signature.");
      await execute("xcrun", ["stapler", "validate", bundle]);
      await execute("spctl", ["--assess", "--type", "execute", bundle]);
      return true;
    } finally {
      if (mounted) await execute("hdiutil", ["detach", mount]);
      await rm(mount, { recursive: true, force: true });
    }
  }
  if (platform === "windows" && signing.windows) {
    if (process.platform !== "win32")
      throw new Error("Verify signed Windows releases on a Windows runner.");
    const directory = await mkdtemp(path.join(tmpdir(), "wow-trader-signing-"));
    try {
      const thumbprint = signing.windows.signWithParams[1];
      const script =
        "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:WOW_TRADER_VERIFY_ARCHIVE -DestinationPath $env:WOW_TRADER_VERIFY_DIRECTORY; $signature=Get-AuthenticodeSignature -LiteralPath (Join-Path $env:WOW_TRADER_VERIFY_DIRECTORY 'wow-trader-companion.exe'); if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $env:WOW_TRADER_VERIFY_THUMBPRINT) { throw 'Publisher signature verification failed' }";
      await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        env: {
          ...process.env,
          WOW_TRADER_VERIFY_ARCHIVE: sourcePath,
          WOW_TRADER_VERIFY_DIRECTORY: directory,
          WOW_TRADER_VERIFY_THUMBPRINT: thumbprint,
        },
      });
      return true;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  return false;
}
