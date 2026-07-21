import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outputDir = join(process.cwd(), "runtime");
mkdirSync(outputDir, { recursive: true });

const buildInfo = {
  sha: process.env.GITHUB_SHA ?? "local",
  branch: process.env.GITHUB_REF_NAME ?? "local",
  environment: process.env.NODE_ENV ?? "development",
  generatedAt: new Date().toISOString()
};

writeFileSync(
  join(outputDir, "build-info.json"),
  JSON.stringify(buildInfo, null, 2)
);
