import { env } from "@/config/env.config";

export function getCloudinaryConfig() {
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME.trim(),
    apiKey: env.CLOUDINARY_API_KEY.trim(),
    apiSecret: env.CLOUDINARY_API_SECRET.trim(),
    uploadFolder: env.CLOUDINARY_UPLOAD_FOLDER.trim() || "renew",
  };
}

export type CloudinaryRuntimeConfig = ReturnType<typeof getCloudinaryConfig>;
