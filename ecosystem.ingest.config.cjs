const path = require("node:path");
const process = require("node:process");

const deployRoot = process.env.WOW_TRADER_DEPLOY_ROOT ?? "/home/wow-trader-system";
const releaseRoot = process.env.WOW_TRADER_INGEST_RELEASE_ROOT;

if (!releaseRoot || !path.isAbsolute(releaseRoot)) {
  throw new Error("WOW_TRADER_INGEST_RELEASE_ROOT must be an absolute release directory");
}

module.exports = {
  apps: [
    {
      name: "kfc-helper-ingest",
      namespace: "kfc",
      cwd: releaseRoot,
      script: "./scripts/run-production.sh",
      args: ["ingest"],
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      restart_delay: 3_000,
      min_uptime: "10s",
      max_restarts: 10,
      kill_timeout: 10_000,
      time: true,
      merge_logs: true,
      max_memory_restart: "350M",
      env_production: {
        NODE_ENV: "production",
        WOW_TRADER_ENV_FILE: `${deployRoot}/shared/env/ingest.env`,
      },
    },
  ],
};
