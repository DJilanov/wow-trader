const path = require("node:path");
const process = require("node:process");
const root = process.env.WOW_TRADER_SYSTEM_ROOT || "/home/wow-trader-system";
module.exports = {
  apps: [
    {
      name: "kfc-helper-official-updates",
      namespace: "kfc",
      cwd: path.join(root, "current"),
      script: "scripts/forever-updates-worker.mjs",
      node_args: `--max-old-space-size=256 --env-file=${path.join(root, "shared/forever-updates.env")}`,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: false,
      time: true,
      kill_timeout: 30000,
      env: { NODE_ENV: "production" },
    },
  ],
};
