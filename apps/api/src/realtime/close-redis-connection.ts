import type Redis from "ioredis";

/** Flush a healthy client's commands, but never wait on a reconnecting client. */
export async function closeRedisConnection(client: Redis) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (client.status === "ready") {
      await Promise.race([
        client.quit(),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, 1_000); })
      ]);
    }
  } catch { /* Connection loss during shutdown is expected. */ }
  finally {
    clearTimeout(timer);
    client.disconnect();
  }
}
