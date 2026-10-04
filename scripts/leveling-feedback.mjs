#!/usr/bin/env node

import process from "node:process";
import { resolve } from "node:path";
import { createDatabase } from "../packages/db/dist/index.js";

const statuses = ["new", "reviewed", "resolved", "dismissed"];
const args = process.argv.slice(2);

async function main() {
  if (args.includes("--help")) {
    process.stdout.write(
      "List: pnpm leveling:feedback [--status new|reviewed|resolved|dismissed] [--limit 1..100]\nReview: pnpm leveling:feedback --mark REPORT_UUID reviewed|resolved|dismissed|new\nOnly review status changes; reports never modify routes.\n",
    );
    return;
  }
  let status = "new",
    limit = 50,
    mark = null;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--status" && statuses.includes(args[index + 1])) status = args[++index];
    else if (
      argument === "--limit" &&
      /^\d{1,3}$/.test(args[index + 1] ?? "") &&
      Number(args[index + 1]) >= 1 &&
      Number(args[index + 1]) <= 100
    )
      limit = Number(args[++index]);
    else if (
      argument === "--mark" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        args[index + 1] ?? "",
      ) &&
      statuses.includes(args[index + 2])
    ) {
      if (mark) throw new Error("Use one --mark operation per command.");
      mark = { id: args[++index], status: args[++index] };
    } else throw new Error("Invalid arguments. Run pnpm leveling:feedback --help.");
  }
  if (!process.env.DATABASE_URL) process.loadEnvFile(resolve(import.meta.dirname, "../.env"));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = createDatabase(process.env.DATABASE_URL);
  try {
    const rows = mark
      ? await connection.client`UPDATE leveling_feedback SET status = ${mark.status} WHERE id = ${mark.id}::uuid RETURNING id, status`
      : await connection.client`SELECT id, chapter_id, route_version, client_build, step_id, profile, category, message, status, created_at FROM leveling_feedback WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}`;
    if (mark && rows.length === 0) throw new Error("Report not found.");
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } finally {
    await connection.close();
  }
}

await main().catch(() => {
  process.stderr.write(
    "Feedback command failed. Check arguments, database configuration and migrations; use --help for usage.\n",
  );
  process.exitCode = 1;
});
