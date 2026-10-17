const path = require("node:path");
const root = process.env.REFERENCE_WORKER_ROOT || "/home/wow-trader-reference-worker";
const priorityQueue = process.env.REFERENCE_PRIORITY_QUEUE;
const priorityStatus = process.env.REFERENCE_PRIORITY_STATUS;
const recoveryQueue = process.env.REFERENCE_RECOVERY_QUEUE;
const recoveryStatus = process.env.REFERENCE_RECOVERY_STATUS;
const archiveQueue = process.env.REFERENCE_ARCHIVE_QUEUE;
const archiveStatus = process.env.REFERENCE_ARCHIVE_STATUS;
// Jittered source-navigation pacing in milliseconds. A durable rolling window
// independently caps the worker at 50 starts per hour across restarts.
const delayMinMs = process.env.REFERENCE_DELAY_MIN_MS || process.env.CRAWL_DELAY_MIN_MS || "72000";
const delayMaxMs = process.env.REFERENCE_DELAY_MAX_MS || process.env.CRAWL_DELAY_MAX_MS || "90000";
if (
  Boolean(priorityQueue) !== Boolean(priorityStatus) ||
  (priorityQueue && (!path.isAbsolute(priorityQueue) || !path.isAbsolute(priorityStatus)))
)
  throw new Error("Priority crawling requires absolute queue and checkpoint paths together.");
if (
  Boolean(recoveryQueue) !== Boolean(recoveryStatus) ||
  (recoveryQueue &&
    (!priorityQueue || !path.isAbsolute(recoveryQueue) || !path.isAbsolute(recoveryStatus)))
)
  throw new Error("Recovery crawling requires priority mode and absolute queue/checkpoint paths.");
if (
  Boolean(archiveQueue) !== Boolean(archiveStatus) ||
  (archiveQueue &&
    (!priorityQueue || !path.isAbsolute(archiveQueue) || !path.isAbsolute(archiveStatus)))
)
  throw new Error("Archive collection requires priority mode and absolute queue/checkpoint paths.");

module.exports = {
  apps: [
    {
      name: "kfc-helper-reference-crawl",
      cwd: path.join(root, "current"),
      script: "dist/cli.js",
      interpreter: "node",
      node_args: "--max-old-space-size=384",
      args: [
        priorityQueue ? "crawl-priority" : "crawl-all",
        "--queue",
        path.join(root, "shared/queues/all-catalog.json"),
        "--staging",
        path.join(root, "shared/staging"),
        "--status",
        path.join(root, "shared/status.json"),
        "--permission-ref",
        "owner-confirmed-2026-10-07",
        "--batch-size",
        "100",
        "--delay-min-ms",
        delayMinMs,
        "--delay-max-ms",
        delayMaxMs,
        "--min-free-disk-mb",
        "8192",
        "--max-staging-mb",
        "2048",
        "--wait-on-source-cooldown",
        ...(priorityQueue
          ? ["--priority-queue", priorityQueue, "--priority-status", priorityStatus]
          : []),
        ...(recoveryQueue
          ? ["--recovery-queue", recoveryQueue, "--recovery-status", recoveryStatus]
          : []),
        ...(archiveQueue
          ? ["--archive-queue", archiveQueue, "--archive-status", archiveStatus]
          : []),
      ],
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: false,
      // Allow the in-flight Browsertrix page (up to 90s jitter plus load) to
      // finish and flush its WARC before PM2 escalates to SIGKILL.
      kill_timeout: 180000,
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
