const path = require("node:path");
const root = process.env.REFERENCE_WORKER_ROOT || "/home/wow-trader-reference-worker";

module.exports = {
  apps: [
    {
      name: "kfc-helper-reference-crawl",
      cwd: path.join(root, "current"),
      script: "dist/cli.js",
      interpreter: "node",
      node_args: "--max-old-space-size=384",
      args: [
        "crawl-all",
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
        "--delay-ms",
        "60000",
        "--min-free-disk-mb",
        "8192",
        "--max-staging-mb",
        "2048",
      ],
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: false,
      kill_timeout: 30000,
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
