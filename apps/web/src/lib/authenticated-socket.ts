import { io } from "socket.io-client";
import { SOCKET_URL, refreshAccessToken } from "./api";
import { getBrowserSession, tokenExpiresSoon } from "./browser-session";

export function createAuthenticatedSocket() {
  let disposed = false;
  let renewing = false;
  const socket = io(SOCKET_URL, {
    transports: ["websocket"],
    auth: (callback) => {
      if (disposed) { callback({ token: "" }); return; }
      const auth = getBrowserSession().current;
      if (!auth) { callback({ token: "" }); return; }
      if (!tokenExpiresSoon(auth.accessToken)) {
        callback({ token: auth.accessToken });
        return;
      }
      void refreshAccessToken().then((fresh) => {
        if (!disposed) callback({ token: fresh.accessToken });
      }).catch(() => { if (!disposed) callback({ token: "" }); });
    },
  });
  const renew = () => {
    if (disposed || renewing || !getBrowserSession().current) return;
    renewing = true;
    void refreshAccessToken().then(() => {
      if (!disposed && getBrowserSession().current) socket.connect();
    }).catch(() => { /* Session coordinator distinguishes expiry from outages. */ })
      .finally(() => { renewing = false; });
  };
  socket.on("auth:expired", renew);
  socket.on("disconnect", (reason) => {
    if (reason === "io client disconnect") disposed = true;
    if (reason === "io server disconnect") {
      const auth = getBrowserSession().current;
      if (auth && tokenExpiresSoon(auth.accessToken, 0)) renew();
    }
  });
  return socket;
}
