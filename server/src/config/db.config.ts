import mongoose from "mongoose";

import { env } from "@/config/env.config";

let isConnected = false;

mongoose.set("strictQuery", true);

export async function connectToDatabase() {
  if (isConnected) {
    return;
  }

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
  });

  isConnected = true;
  console.log(`Connected to MongoDB database "${env.MONGODB_DB_NAME}".`);
}

export async function disconnectFromDatabase() {
  if (!isConnected) {
    return;
  }

  await mongoose.disconnect();
  isConnected = false;
}
