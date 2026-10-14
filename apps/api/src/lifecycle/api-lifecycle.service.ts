import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

/** Per-process state only. Shared records and limits remain in PostgreSQL/Redis. */
@Injectable()
export class ApiLifecycleService {
  readonly instanceId = randomUUID();
  private draining = false;
  private active = 0;
  private readonly idleListeners = new Set<() => void>();

  isDraining() { return this.draining; }
  beginDrain() { this.draining = true; }
  get activeWork() { return this.active; }

  beginWork() {
    this.active++;
    let completed = false;
    return () => {
      if (completed) return;
      completed = true;
      if (--this.active === 0) for (const resolve of this.idleListeners) resolve();
    };
  }

  async track<T>(operation: () => Promise<T>) {
    const complete = this.beginWork();
    try { return await operation(); }
    finally { complete(); }
  }

  waitForIdle(timeoutMs: number): Promise<boolean> {
    if (this.active === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (idle: boolean) => {
        clearTimeout(timer);
        this.idleListeners.delete(onIdle);
        resolve(idle);
      };
      const onIdle = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.idleListeners.add(onIdle);
    });
  }
}
