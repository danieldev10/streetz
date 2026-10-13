export function browserOrigins(webAppUrl: string, additional = "") {
  return [...new Set([webAppUrl, ...additional.split(",")].filter((value) => value.trim()).map((value) => {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.hostname.includes("*") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Browser origins must be explicit http(s) origins without credentials, paths or wildcards.");
    }
    return url.origin;
  }))];
}
