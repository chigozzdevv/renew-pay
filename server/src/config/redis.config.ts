import { env } from "@/config/env.config";

export function getRedisConfig() {
  return {
    url: env.REDIS_URL,
    prefix: env.REDIS_QUEUE_PREFIX,
    workerConcurrency: env.REDIS_WORKER_CONCURRENCY,
    enabled: env.ENABLE_WORKERS,
  };
}

export type RedisRuntimeConfig = ReturnType<typeof getRedisConfig>;
