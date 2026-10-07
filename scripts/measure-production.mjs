import { getOpsTarget, opsFetch } from "./ops-target.mjs";
const target = getOpsTarget();
const { webUrl } = target;
const samples = Number(process.env.PERFORMANCE_SAMPLES ?? "3");
if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new Error("PERFORMANCE_SAMPLES must be between 1 and 10; this is a small baseline, not a load test.");

async function measure(path) {
  const startedAt = performance.now();
  const response = await opsFetch(target, webUrl, path);
  const headersAt = performance.now();
  const body = await response.arrayBuffer();
  const endedAt = performance.now();

  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);

  return {
    path,
    status: response.status,
    ttfbMs: Math.round((headersAt - startedAt) * 10) / 10,
    totalMs: Math.round((endedAt - startedAt) * 10) / 10,
    decodedBytes: body.byteLength,
    contentEncoding: response.headers.get("content-encoding") ?? "identity",
    cacheControl: response.headers.get("cache-control") ?? null,
    vercelCache: response.headers.get("x-vercel-cache") ?? null,
    requestId: response.headers.get("x-request-id") ?? response.headers.get("x-railway-request-id") ?? null,
  };
}

function median(values) {
  const ordered = [...values].sort((first, second) => first - second);
  return ordered[Math.floor(ordered.length / 2)];
}

const paths = ["/events", "/api/public/events", "/api/health/ready", "/api/public/discovery/people"];
const report = [];

for (const path of paths) {
  const measurements = [];
  for (let index = 0; index < samples; index += 1) measurements.push(await measure(path));
  report.push({
    ...measurements.at(-1),
    samples,
    medianTtfbMs: median(measurements.map((item) => item.ttfbMs)),
    medianTotalMs: median(measurements.map((item) => item.totalMs)),
  });
}

const eventsHtml = await (await opsFetch(target, webUrl, "/events")).text();
const assetPaths = [...new Set(eventsHtml.match(/\/_next\/static\/[^"' ]+\.(?:js|css)/g) ?? [])];
const assets = [];
for (const path of assetPaths) {
  const response = await opsFetch(target, webUrl, path);
  const body = await response.arrayBuffer();
  assets.push({
    path,
    type: path.endsWith(".css") ? "css" : "js",
    decodedBytes: body.byteLength,
    transferredBytes: Number(response.headers.get("content-length")) || null,
    contentEncoding: response.headers.get("content-encoding") ?? "identity",
  });
}
const eventAssets = {
  count: assets.length,
  decodedBytes: assets.reduce((total, asset) => total + asset.decodedBytes, 0),
  transferredBytes: assets.every((asset) => asset.transferredBytes !== null)
    ? assets.reduce((total, asset) => total + asset.transferredBytes, 0)
    : null,
  jsDecodedBytes: assets.filter((asset) => asset.type === "js").reduce((total, asset) => total + asset.decodedBytes, 0),
  cssDecodedBytes: assets.filter((asset) => asset.type === "css").reduce((total, asset) => total + asset.decodedBytes, 0),
};

console.table(report);
console.table([eventAssets]);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), environment: target.environment, release: target.release, webUrl, apiUrl: target.apiUrl, report, eventAssets }, null, 2));
