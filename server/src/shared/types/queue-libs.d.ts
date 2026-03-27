declare module "ioredis" {
  class Redis {
    constructor(url: string, options?: Record<string, unknown>);
    quit(): Promise<void>;
    disconnect(reconnect?: boolean): void;
  }

  export = Redis;
}

declare module "bullmq" {
  export class Queue<T = unknown> {
    constructor(
      name: string,
      options?: { connection?: unknown; prefix?: string }
    );

    add(
      name: string,
      data: T,
      options?: {
        delay?: number;
        attempts?: number;
        removeOnComplete?: number | boolean;
        removeOnFail?: number | boolean;
        jobId?: string;
      }
    ): Promise<unknown>;

    close(): Promise<void>;
  }

  export class Worker<T = unknown> {
    constructor(
      name: string,
      processor: (job: { data: T; name: string; id?: string }) => Promise<unknown>,
      options?: {
        connection?: unknown;
        prefix?: string;
        concurrency?: number;
      }
    );

    on(
      event:
        | "completed"
        | "failed"
        | "error"
        | "ready"
        | "active"
        | "stalled",
      listener: (...args: unknown[]) => void
    ): this;

    close(force?: boolean): Promise<void>;
  }
}
