const path = require("node:path");
const process = require("node:process");

const root = process.env.WOW_TRADER_SYSTEM_ROOT || "/home/wow-trader-system";

module.exports = {
  apps: [
    {
      name: "kfc-helper-search-console",
      namespace: "kfc",
      cwd: path.join(root, "current"),
      script: process.execPath,
      interpreter: "none",
      args: [
        `--env-file=${path.join(root, "shared/env/search-console.env")}`,
        "scripts/search-console-intelligence.mjs",
        `--report=${path.join(root, "shared/seo/search-console-intelligence.json")}`,
      ],
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      cron_restart: "43 4 * * *",
      watch: false,
      kill_timeout: 120_000,
      max_memory_restart: "192M",
      time: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
