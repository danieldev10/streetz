function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function platformGroup({ webLocks = true } = {}) {
  const values = new Map(), listeners = new Map();
  let tail = Promise.resolve(), sequence = 0;
  const locks = { request(_name, _options, callback) {
    const pending = tail.then(callback);
    tail = pending.catch(() => {});
    return pending;
  }};
  const make = () => {
    const tab = ++sequence;
    const notify = (key) => queueMicrotask(() => {
      for (const [other, listener] of listeners) if (other !== tab) listener({ key });
    });
    const storage = {
      get length() { return values.size; },
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) { values.set(key, String(value)); notify(key); },
      removeItem(key) { values.delete(key); notify(key); },
      clear() { values.clear(); notify(null); },
    };
    return { storage, ...(webLocks ? { locks } : {}),
      listenStorage(listener) { listeners.set(tab, listener); },
      id: () => String(++sequence).padStart(6, "0") };
  };
  return { make, values };
}
function auth(id = "member", expiresIn = 900, marker = "fresh") {
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + expiresIn })).toString("base64url");
  return { accessToken: "header." + payload + "." + marker, user: { id, email: id + "@example.test", role: "USER" } };
}
module.exports = { platformGroup, deferred, auth, tick: () => new Promise((r) => setImmediate(r)) };

