import { spawn, spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getTestTargets, testEnvironment } from "./target.mjs";
import { assertPreparedDatabase } from "./prepared-database.mjs";

const env = testEnvironment(getTestTargets());
await assertPreparedDatabase(env.TEST_DATABASE_URL);
const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const build = spawnSync(process.execPath, ["node_modules/@nestjs/cli/bin/nest.js", "build"], { cwd: apiRoot, env, stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const files = (await readdir(new URL("../../test/", import.meta.url))).filter((file) => file.endsWith(".test.js")).sort();
const tests = spawn(process.execPath, ["--test", "--test-reporter=tap", ...files.map((file) => `test/${file}`)], {
  cwd: apiRoot, env, stdio: ["ignore", "pipe", "inherit"]
});
let report = "";
tests.stdout.on("data", (chunk) => { report += chunk; process.stdout.write(chunk); });
tests.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
const code = await new Promise((resolve) => tests.on("close", resolve));
const skipped = /^# skipped (\d+)$/m.exec(report);
const count = /^# tests (\d+)$/m.exec(report);
if (code !== 0 || !count || Number(count[1]) === 0 || !skipped || Number(skipped[1]) !== 0) {
  console.error("CI requires a successful test run with zero skipped tests.");
  process.exitCode = 1;
}
