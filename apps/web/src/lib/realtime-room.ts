import type { Socket } from "socket.io-client";

/** Rejoin after every connection, then recover persisted messages over HTTP. */
export function bindRealtimeRoom(socket: Socket, options: {
  joinEvent: string;
  leaveEvent: string;
  payload: Record<string, string>;
  onJoined: () => void;
  onError: (message: string) => void;
}) {
  let active = true;
  let generation = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const join = () => {
    clearTimeout(retry);
    if (!active || !socket.connected) return;
    const attempt = ++generation;
    socket.timeout(10_000).emit(options.joinEvent, options.payload,
      (error: Error | null, response?: { ok?: boolean; error?: string; retryable?: boolean }) => {
        if (!active || attempt !== generation || !socket.connected) return;
        if (!error && response?.ok) { options.onJoined(); return; }
        options.onError(response?.error ?? "Reconnecting to this chat. Please wait a moment.");
        if (error || response?.retryable) retry = setTimeout(join, 2_000);
      });
  };
  const disconnected = () => { generation++; clearTimeout(retry); };
  socket.on("connect", join);
  socket.on("disconnect", disconnected);
  join();
  return () => {
    active = false;
    generation++;
    clearTimeout(retry);
    socket.off("connect", join);
    socket.off("disconnect", disconnected);
    if (socket.connected) socket.emit(options.leaveEvent, options.payload);
  };
}
