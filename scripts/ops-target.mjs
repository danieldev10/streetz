export function getOpsTarget(env = process.env) {
  const environment = env.OPS_ENVIRONMENT;
  if (!["local", "staging", "production"].includes(environment)) {
    throw new Error("Set OPS_ENVIRONMENT to local, staging, or production explicitly.");
  }
  const webUrl = parseUrl(env.SMOKE_WEB_URL, "SMOKE_WEB_URL", environment);
  const apiUrl = parseUrl(env.SMOKE_API_URL, "SMOKE_API_URL", environment).replace(/\/api$/, "");
  if (environment === "staging") {
    const productionHosts = ["crushclub.ng", "www.crushclub.ng", "crushclub-v1.vercel.app"];
    if (productionHosts.includes(new URL(webUrl).hostname) ||
      (env.PRODUCTION_API_URL && new URL(apiUrl).hostname === new URL(env.PRODUCTION_API_URL).hostname)) {
      throw new Error("Staging checks cannot target the production website or API.");
    }
  }
  const timeoutMs = Number(env.OPS_TIMEOUT_MS ?? "5000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error("OPS_TIMEOUT_MS must be between 100 and 30000.");
  return { environment, webUrl, apiUrl, timeoutMs, release: env.OPS_RELEASE ?? "unrecorded" };
}

function parseUrl(value, key, environment) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key} must be explicitly set to a valid base URL.`); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${key} must be an HTTP(S) base URL without credentials, query, or fragment.`);
  }
  if (environment !== "local" && url.protocol !== "https:") throw new Error(`${key} must use HTTPS outside local checks.`);
  if (environment === "local" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Local checks must target loopback services.");
  }
  const allowedPaths = key === "SMOKE_API_URL" ? ["/", "/api", "/api/"] : ["/"];
  if (!allowedPaths.includes(url.pathname)) throw new Error(`${key} must be a base URL.`);
  return url.href.replace(/\/+$/, "");
}

export async function opsFetch(target, baseUrl, path) {
  const headers = { "accept-encoding": "gzip, br" };
  if (baseUrl === target.webUrl && process.env.SMOKE_VERCEL_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.SMOKE_VERCEL_BYPASS_SECRET;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(target.timeoutMs)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response;
}
