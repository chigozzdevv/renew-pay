import { createHash } from "crypto";

import { getCloudinaryConfig } from "@/config/cloudinary.config";
import { HttpError } from "@/shared/errors/http-error";

function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string) {
  const payload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${apiSecret}`)
    .digest("hex");
}

export function createMerchantLogoUploadSignature(input: { merchantId: string }) {
  const config = getCloudinaryConfig();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new HttpError(503, "Cloudinary uploads are not configured.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${config.uploadFolder.replace(/\/+$/, "")}/merchant-${input.merchantId}/branding`;
  const params = {
    folder,
    invalidate: "true",
    overwrite: "true",
    public_id: "logo",
    timestamp,
  } as const;

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    folder: params.folder,
    publicId: params.public_id,
    invalidate: true,
    overwrite: true,
    timestamp,
    signature: signCloudinaryParams(params, config.apiSecret),
  };
}
