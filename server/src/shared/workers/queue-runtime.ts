import type Redis from "ioredis";
import type { Queue, Worker } from "bullmq";

import { env } from "@/config/env.config";
import { getRedisConfig } from "@/config/redis.config";
import { queueNames, type QueueName } from "@/shared/workers/queue-names";

type QueueMap = Map<QueueName, Queue<unknown>>;
type QueueProcessor = (payload: unknown) => Promise<unknown>;

let redisConnection: Redis | null = null;
let queues: QueueMap | null = null;
let workers: Array<Worker<unknown>> = [];
let queueLibrariesAvailable = false;
let missingDependencyLogged = false;
const queueProcessors = new Map<QueueName, QueueProcessor>();

function canInlineOnQueueFailure(error: unknown) {
  if (env.NODE_ENV === "production" || !(error instanceof Error)) {
    return false;
  }

  const redisError = error as Error & { code?: string };

  return (
    redisError.code === "ECONNREFUSED" ||
    redisError.code === "ETIMEDOUT" ||
    redisError.message.includes("Connection is closed") ||
    redisError.message.includes("max retries per request") ||
    redisError.message.includes("Connection is in connecting state")
  );
}

async function loadQueueLibraries() {
  try {
    const [{ Queue, Worker }, { default: RedisClient }] = await Promise.all([
      import("bullmq"),
      import("ioredis"),
    ]);

    queueLibrariesAvailable = true;

    return {
      Queue,
      Worker,
      RedisClient,
    };
  } catch (error) {
    if (!missingDependencyLogged) {
      missingDependencyLogged = true;
      console.warn(
        "Redis queue libraries are unavailable. Install server dependencies to enable workers.",
        error
      );
    }

    return null;
  }
}

async function getQueueResources() {
  const libraries = await loadQueueLibraries();

  if (!libraries) {
    return null;
  }

  if (!redisConnection || !queues) {
    const redisConfig = getRedisConfig();

    redisConnection = new libraries.RedisClient(redisConfig.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    queues = new Map<QueueName, Queue<unknown>>();

    for (const queueName of Object.values(queueNames)) {
      queues.set(
        queueName,
        new libraries.Queue(queueName, {
          connection: redisConnection,
          prefix: redisConfig.prefix,
        })
      );
    }
  }

  return {
    Queue: libraries.Queue,
    Worker: libraries.Worker,
    redisConnection,
    queues,
  };
}

export async function enqueueQueueJob<T>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options?: {
    delayMs?: number;
    attempts?: number;
    jobId?: string;
  }
) {
  if (!getRedisConfig().enabled) {
    return null;
  }

  const resources = await getQueueResources();

  if (!resources) {
    return null;
  }

  const queue = resources.queues.get(queueName);

  if (!queue) {
    throw new Error(`Queue ${queueName} is not registered.`);
  }

  try {
    return await queue.add(jobName, data, {
      delay: options?.delayMs,
      attempts: options?.attempts ?? 3,
      jobId: options?.jobId,
      removeOnComplete: 100,
      removeOnFail: 200,
    });
  } catch (error) {
    if (canInlineOnQueueFailure(error)) {
      console.warn(
        `Queue ${queueName} is unavailable. Falling back to inline processing.`
      );
      return null;
    }

    throw error;
  }
}

export async function startWorkerRuntime() {
  const redisConfig = getRedisConfig();

  if (!redisConfig.enabled) {
    console.log("Redis workers are disabled by configuration.");
    return;
  }

  const resources = await getQueueResources();

  if (!resources || workers.length > 0) {
    return;
  }

  const workerOptions = {
    connection: resources.redisConnection,
    prefix: redisConfig.prefix,
    concurrency: redisConfig.workerConcurrency,
  };

  workers = Object.values(queueNames).map(
    (queueName) =>
      new resources.Worker<unknown>(
        queueName,
        async (job) => {
          const handler = queueProcessors.get(queueName);

          if (!handler) {
            console.warn(`No queue processor registered for ${queueName}.`);
            return null;
          }

          return handler(job.data);
        },
        workerOptions
      )
  );

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      console.error(`Queue job failed: ${(job as { name?: string }).name}`, error);
    });
  }

  console.log("Redis worker runtime started.");
}

export async function stopWorkerRuntime() {
  await Promise.all(workers.map((worker) => worker.close()));
  workers = [];

  if (queues) {
    await Promise.all(Array.from(queues.values()).map((queue) => queue.close()));
    queues = null;
  }

  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}

export function isQueueRuntimeAvailable() {
  return queueLibrariesAvailable;
}

export function registerQueueProcessor(
  queueName: QueueName,
  handler: QueueProcessor
) {
  queueProcessors.set(queueName, handler);
}
