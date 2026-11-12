import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

execFileSync(
  process.env.DOTNET_BIN || "dotnet",
  [
    "run",
    "--project",
    "tools/extractor-dotnet-controls/Controls.csproj",
    "--configuration",
    "Release",
  ],
  { cwd: resolve(import.meta.dirname, ".."), stdio: "inherit" },
);
