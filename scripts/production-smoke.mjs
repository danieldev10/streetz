const webUrl = (process.env.SMOKE_WEB_URL ?? "https://crushclub-v1.vercel.app").replace(/\/+$/, "");

async function request(path, type = "json") {
  const response = await fetch(`${webUrl}${path}`, { headers: { "accept-encoding": "gzip, br" } });
  const body = type === "json" ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return { response, body };
}

const health = await request("/api/health");
if (health.body?.status !== "ok") throw new Error("Health response was not ok");

const events = await request("/api/public/events");
if (!Array.isArray(events.body?.events)) throw new Error("Public events response has an invalid shape");

const raffles = await request("/api/public/raffles");
if (!Array.isArray(raffles.body?.raffles)) throw new Error("Public raffles response has an invalid shape");

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

const firstRaffle = raffles.body.raffles[0];
if (firstRaffle?.id) {
  const detail = await request(`/api/public/raffles/${encodeURIComponent(firstRaffle.id)}`);
  if ((detail.body?.id ?? detail.body?.raffle?.id) !== firstRaffle.id) throw new Error("Public raffle detail did not match the list");
  const sharedPage = await request(`/events/raffles/${encodeURIComponent(firstRaffle.id)}`, "text");
  if (sharedPage.body.length < 1_000) throw new Error("Shared raffle page returned an unexpectedly small document");
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  webUrl,
  publicEvents: events.body.events.length,
  publicRaffles: raffles.body.raffles.length,
  apiRequestId: health.response.headers.get("x-request-id") ?? health.response.headers.get("x-railway-request-id"),
}, null, 2));
