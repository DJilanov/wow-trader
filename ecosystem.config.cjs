const deployRoot = process.env.WOW_TRADER_DEPLOY_ROOT ?? "/home/wow-trader-system";

const sharedProcessOptions = {
  namespace: "kfc",
  cwd: `${deployRoot}/current`,
  script: "./scripts/run-production.sh",
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
};

module.exports = {
  apps: [
    {
      ...sharedProcessOptions,
      name: "kfc-helper-web",
      args: ["web"],
      max_memory_restart: "600M",
      env_production: {
        NODE_ENV: "production",
        WOW_TRADER_ENV_FILE: `${deployRoot}/shared/env/web.env`,
      },
    },
    {
      ...sharedProcessOptions,
      name: "kfc-helper-ingest",
      args: ["ingest"],
      max_memory_restart: "350M",
      env_production: {
        NODE_ENV: "production",
        WOW_TRADER_ENV_FILE: `${deployRoot}/shared/env/ingest.env`,
      },
    },
  ],
};
