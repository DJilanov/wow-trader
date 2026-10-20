import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import process from "node:process";

const execute = promisify(execFile);
if (process.platform !== "darwin") throw new Error("This installer requires macOS");
if (process.argv.length > 2) throw new Error("Usage: install-storage-maintenance-macos.mjs");
const label = "online.kfcguild.storage-maintenance";
const domain = `gui/${process.getuid()}`;
const root = resolve(import.meta.dirname, "..");
const path = join(homedir(), "Library/LaunchAgents", `${label}.plist`);
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
await mkdir(dirname(path), { recursive: true });
await execute("/bin/launchctl", ["bootout", `${domain}/${label}`]).catch((error) => {
  if (!/Could not find (?:specified )?service|No such process/.test(error.stderr ?? ""))
    throw error;
});
await writeFile(
  path,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(join(root, "scripts/storage-monitor.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>EnvironmentVariables</key><dict>
<key>PATH</key><string>${escape(dirname(process.execPath))}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
<key>DEVELOPER_DIR</key><string>/Library/Developer/CommandLineTools</string>
</dict>
<key>StartInterval</key><integer>3600</integer>
<key>RunAtLoad</key><true/>
<key>ProcessType</key><string>Background</string>
<key>LowPriorityIO</key><true/>
<key>Nice</key><integer>10</integer>
<key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`,
  { mode: 0o600 },
);
await execute("/usr/bin/plutil", ["-lint", path]);
await execute("/bin/launchctl", ["bootstrap", domain, path]);
process.stdout.write(
  `Installed hourly storage monitoring with daily idle cleanup and weekly idle pnpm pruning.\n${path}\n`,
);
