import { getOpsTarget, opsFetch } from "./ops-target.mjs";
const target = getOpsTarget();
const { webUrl, apiUrl } = target;

async function request(path, type = "json", base = webUrl) {
  const response = await opsFetch(target, base, path);
  const body = type === "json" ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return { response, body };
}

const directHealth = await request("/api/health/ready", "json", apiUrl);
if (directHealth.body?.status !== "ok") throw new Error("Direct API readiness was not ok");
const health = await request("/api/health/ready");
if (health.body?.status !== "ok") throw new Error("Health response was not ok");

const events = await request("/api/public/events");
if (!Array.isArray(events.body?.events)) throw new Error("Public events response has an invalid shape");

const discovery = await request("/api/public/discovery/people");
if (!Array.isArray(discovery.body?.people)) throw new Error("Public discovery response has an invalid shape");

const eventsPage = await request("/events", "text");
if (!eventsPage.body.includes("<!DOCTYPE html") && !eventsPage.body.includes("<!doctype html")) {
  throw new Error("Events route did not return an HTML document");
}

const firstEvent = events.body.events[0];
if (firstEvent?.id) {
  const detail = await request(`/api/public/events/${encodeURIComponent(firstEvent.id)}`);
  if ((detail.body?.id ?? detail.body?.event?.id) !== firstEvent.id) throw new Error("Public event detail did not match the list");
  const sharedPage = await request(`/events/${encodeURIComponent(firstEvent.id)}`, "text");
  if (sharedPage.body.length < 1_000) throw new Error("Shared event page returned an unexpectedly small document");
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  environment: target.environment,
  release: target.release,
  webUrl,
  apiUrl,
  directApiReady: true,
  webApiReady: true,
  publicEvents: events.body.events.length,
  apiRequestId: health.response.headers.get("x-request-id") ?? health.response.headers.get("x-railway-request-id"),
}, null, 2));
