import { createApp } from "@/app";
import { connectToDatabase, disconnectFromDatabase } from "@/config/db.config";
import { env } from "@/config/env.config";
import { registerWorkerProcessors } from "@/shared/workers/register-processors";
import { startWorkerRuntime, stopWorkerRuntime } from "@/shared/workers/queue-runtime";

async function bootstrap() {
  await connectToDatabase();
  registerWorkerProcessors();
  await startWorkerRuntime();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`Renew server listening on port ${env.PORT}.`);
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`${signal} received, shutting down Renew server.`);

    server.close(async () => {
      await stopWorkerRuntime();
      await disconnectFromDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch(async (error: unknown) => {
  console.error("Failed to start Renew server.", error);
  await stopWorkerRuntime();
  await disconnectFromDatabase();
  process.exit(1);
});
