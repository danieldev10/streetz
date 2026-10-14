import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { checkApiReplicas } from "../replica-smoke.mjs";

async function fixture(t, ids, status = 200) {
  let count = 0;
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store",
      "x-crushclub-instance": ids[count++ % ids.length] });
    response.end(JSON.stringify({ status: "ok", service: "crushclub-api" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return "http://127.0.0.1:" + server.address().port;
}
const target = (apiUrl, webUrl) => ({ apiUrl, webUrl, timeoutMs: 1000, environment: "local", release: "test" });

test("replica smoke proves the website proxy reaches the same two ready instances", async (t) => {
  const ids = [randomUUID(), randomUUID()];
  const api = await fixture(t, ids), web = await fixture(t, ids);
  const report = await checkApiReplicas(target(api, web), 2, 6);
  assert.equal(report.observedDirect, 2);
  assert.equal(report.observedThroughWebsite, 2);
});

test("a healthy single instance, wrong backend, or unhealthy replica cannot satisfy acceptance", async (t) => {
  const ids = [randomUUID(), randomUUID()];
  const api = await fixture(t, ids), single = await fixture(t, [ids[0]]);
  await assert.rejects(checkApiReplicas(target(api, single), 2, 6), /Expected at least 2/);
  const wrong = await fixture(t, [randomUUID(), randomUUID()]);
  await assert.rejects(checkApiReplicas(target(api, wrong), 2, 6), /Expected at least 2/);
  const unavailable = await fixture(t, ids, 503);
  await assert.rejects(checkApiReplicas(target(api, unavailable), 2, 6), /HTTP 503/);
});
