import { fileURLToPath } from "node:url";
import { getOpsTarget, opsFetch } from "./ops-target.mjs";

export async function checkApiReplicas(target, expected = 2, samples = 24) {
  if (!Number.isInteger(expected) || expected < 1 || expected > 20 ||
      !Number.isInteger(samples) || samples < expected || samples > 200) {
    throw new Error("Replica count must be 1–20; samples must be between that count and 200.");
  }
  const probe = async (base) => {
    const response = await opsFetch(target, base, "/api/health/ready");
    const body = await response.json();
    const instance = response.headers.get("x-crushclub-instance");
    if (response.status !== 200 || body.status !== "ok" || body.service !== "crushclub-api" ||
        response.headers.get("cache-control") !== "no-store" || !/^[0-9a-f-]{36}$/.test(instance ?? "")) {
      throw new Error("Readiness probe failed or the response lacks an uncached API instance identifier.");
    }
    return instance;
  };
  const direct = new Set(), proxied = new Set();
  // Bounded concurrency keeps probes useful without flooding the database.
  for (let index = 0; index < samples; index += 3) {
    await Promise.all(Array.from({ length: Math.min(3, samples - index) }, async () => {
      direct.add(await probe(target.apiUrl));
      proxied.add(await probe(target.webUrl));
    }));
  }
  if (direct.size < expected || proxied.size < expected || [...proxied].some((id) => !direct.has(id))) {
    throw new Error("Expected at least " + expected + " shared API instances; direct=" + direct.size + ", website proxy=" + proxied.size + ".");
  }
  return { environment: target.environment, release: target.release, expectedMinimum: expected,
    observedDirect: direct.size, observedThroughWebsite: proxied.size, samplesPerRoute: samples, status: "passed" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkApiReplicas(getOpsTarget(), Number(process.env.OPS_EXPECTED_API_INSTANCES ?? "2"),
      Number(process.env.OPS_REPLICA_SAMPLES ?? "24"));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}
