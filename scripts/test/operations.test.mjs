import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { getOpsTarget, opsFetch } from "../ops-target.mjs";

test("operational checks require explicit targets and reject accidental production staging checks", () => {
  const local = { OPS_ENVIRONMENT: "local", SMOKE_WEB_URL: "http://127.0.0.1:3000", SMOKE_API_URL: "http://127.0.0.1:4000/api/" };
  assert.equal(getOpsTarget(local).apiUrl, "http://127.0.0.1:4000");
  for (const overrides of [
    { OPS_ENVIRONMENT: undefined }, { SMOKE_API_URL: undefined },
    { SMOKE_WEB_URL: "https://crushclub.ng" }, { SMOKE_WEB_URL: "http://127.0.0.1/api" },
    { SMOKE_API_URL: "http://secret:password@127.0.0.1:4000" },
    { SMOKE_WEB_URL: "http://127.0.0.1:3000?secret=hidden" }, { OPS_TIMEOUT_MS: "0" }
  ]) assert.throws(() => getOpsTarget({ ...local, ...overrides }));
  assert.throws(() => getOpsTarget({ OPS_ENVIRONMENT: "staging", SMOKE_WEB_URL: "https://www.crushclub.ng", SMOKE_API_URL: "https://staging-api.example.com" }));
  assert.throws(() => getOpsTarget({ OPS_ENVIRONMENT: "staging", SMOKE_WEB_URL: "https://staging.example.com", SMOKE_API_URL: "https://api.example.com", PRODUCTION_API_URL: "https://api.example.com" }));
  assert.throws(() => getOpsTarget({ OPS_ENVIRONMENT: "production", SMOKE_WEB_URL: "http://crushclub.ng", SMOKE_API_URL: "https://api.example.com" }));
});

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test("deadlines include stalled response bodies, not only initial headers", async (t) => {
  const url = await serve(t, (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"status":');
  });
  const started = performance.now();
  const response = await opsFetch({ timeoutMs: 100, webUrl: url }, url, "/slow");
  await assert.rejects(response.text());
  assert.ok(performance.now() - started < 2000);
});

test("protection bypass stays on the web target and never follows redirects", async (t) => {
  const seen = [];
  const other = await serve(t, (request, response) => { seen.push(request.headers); response.end("ok"); });
  const web = await serve(t, (request, response) => {
    seen.push(request.headers);
    if (request.url === "/redirect") { response.writeHead(302, { location: other }); }
    response.end("ok");
  });
  const original = process.env.SMOKE_VERCEL_BYPASS_SECRET;
  process.env.SMOKE_VERCEL_BYPASS_SECRET = "synthetic-secret";
  try {
    const target = { timeoutMs: 1000, webUrl: web };
    await (await opsFetch(target, web, "/")).text();
    await (await opsFetch(target, other, "/")).text();
    await assert.rejects(opsFetch(target, web, "/redirect"));
    assert.equal(seen.length, 3);
    assert.equal(seen[0]["x-vercel-protection-bypass"], "synthetic-secret");
    assert.equal(seen[1]["x-vercel-protection-bypass"], undefined);
  } finally {
    if (original === undefined) delete process.env.SMOKE_VERCEL_BYPASS_SECRET;
    else process.env.SMOKE_VERCEL_BYPASS_SECRET = original;
  }
});

async function smoke(web, api) {
  const child = spawn(process.execPath, [new URL("../production-smoke.mjs", import.meta.url).pathname], {
    env: { PATH: process.env.PATH, OPS_ENVIRONMENT: "local", SMOKE_WEB_URL: web, SMOKE_API_URL: api, OPS_RELEASE: "test-commit", OPS_TIMEOUT_MS: "1000" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}

test("smoke checks direct API and web routing, and fail on outages or malformed public data", async (t) => {
  let apiReady = true, webReady = true, validDiscovery = true;
  let directProbes = 0, webProbes = 0;
  const api = await serve(t, (_request, response) => {
    directProbes++;
    response.writeHead(apiReady ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: apiReady ? "ok" : "unavailable" }));
  });
  const web = await serve(t, (request, response) => {
    response.setHeader("content-type", "application/json");
    switch (request.url) {
      case "/api/health/ready":
        webProbes++; response.statusCode = webReady ? 200 : 503;
        return response.end(JSON.stringify({ status: webReady ? "ok" : "unavailable" }));
      case "/api/public/events": return response.end('{"events":[{"id":"event-1"}]}');
      case "/api/public/events/event-1": return response.end('{"id":"event-1"}');
      case "/api/public/discovery/people": return response.end(JSON.stringify(validDiscovery ? { people: [] } : { error: "wrong shape" }));
      default:
        response.setHeader("content-type", "text/html");
        return response.end(`<!DOCTYPE html><html>${"x".repeat(1100)}</html>`);
    }
  });
  let result = await smoke(web, api);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual([directProbes, webProbes], [1, 1]);
  assert.equal(JSON.parse(result.stdout).release, "test-commit");
  apiReady = false;
  result = await smoke(web, api);
  assert.equal(result.code, 1); assert.match(result.stderr, /HTTP 503/);
  assert.equal(webProbes, 1, "stop if the direct API is unavailable");
  apiReady = true; webReady = false;
  result = await smoke(web, api);
  assert.equal(result.code, 1); assert.match(result.stderr, /HTTP 503/);
  webReady = true; validDiscovery = false;
  result = await smoke(web, api);
  assert.equal(result.code, 1); assert.match(result.stderr, /discovery response has an invalid shape/);
});
