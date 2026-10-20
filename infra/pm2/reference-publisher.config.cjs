const process = require("node:process");
const deployRoot = process.env.WOW_TRADER_DEPLOY_ROOT || "/home/wow-trader-system";
module.exports = {
  apps: [
    {
      name: "kfc-helper-reference-publish",
      namespace: "kfc",
      cwd: `${deployRoot}/current`,
      script: "./scripts/run-production.sh",
      args: ["reference-publisher"],
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      restart_delay: 10000,
      kill_timeout: 30000,
      max_memory_restart: "250M",
      time: true,
      env: {
        NODE_ENV: "production",
        WOW_TRADER_ENV_FILE: `${deployRoot}/shared/env/web.env`,
        WOW_TRADER_REFERENCE_DIRECTORY: "/home/wow-trader-reference-worker/shared/published",
        WOW_TRADER_LEVELING_QUEST_QUEUE:
          "/home/wow-trader-reference-worker/shared/queues/forever-archive-xp-336bb641f1c6e5a6.json",
        WOW_TRADER_LEVELING_QUEST_QUEUE_SHA256:
          "336bb641f1c6e5a62ad1c91170d609c9bfbc75c32c1948811bbed6c20784f805",
      },
    },
  ],
};
