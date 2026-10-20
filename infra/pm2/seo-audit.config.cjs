const path = require("node:path");
const process = require("node:process");

const root = process.env.WOW_TRADER_SYSTEM_ROOT || "/home/wow-trader-system";

module.exports = {
  apps: [
    {
      name: "kfc-helper-seo-audit",
      namespace: "kfc",
      cwd: path.join(root, "current"),
      script: process.execPath,
      interpreter: "none",
      args: [
        "scripts/seo-audit.mjs",
        "--base-url=http://127.0.0.1:19210/tools",
        "--canonical-base-url=https://kfcguild.online/tools",
        "--max-pages=400",
        "--concurrency=2",
        `--report=${path.join(root, "shared/seo/nightly-search-surface-report.json")}`,
      ],
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      cron_restart: "17 3 * * *",
      watch: false,
      kill_timeout: 120_000,
      max_memory_restart: "192M",
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
