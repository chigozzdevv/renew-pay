"use client";

import { ApiError, fetchApi } from "@/lib/api";

export type CloudinaryLogoUploadSignature = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  folder: string;
  publicId: string;
  invalidate: boolean;
  overwrite: boolean;
  timestamp: number;
  signature: string;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  version?: number;
  error?: {
    message?: string;
  };
};

export async function createLogoUploadSignature(input: { token: string }) {
  const response = await fetchApi<CloudinaryLogoUploadSignature>(
    "/media/cloudinary/logo-signature",
    {
      method: "POST",
      token: input.token,
    }
  );

  return response.data;
}

export async function uploadLogoToCloudinary(input: {
  file: File;
  token: string;
}) {
  const signature = await createLogoUploadSignature({ token: input.token });
  const formData = new FormData();

  formData.append("file", input.file);
  formData.append("api_key", signature.apiKey);
  formData.append("folder", signature.folder);
  formData.append("public_id", signature.publicId);
  formData.append("invalidate", String(signature.invalidate));
  formData.append("overwrite", String(signature.overwrite));
  formData.append("signature", signature.signature);
  formData.append("timestamp", String(signature.timestamp));

  const response = await fetch(signature.uploadUrl, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as CloudinaryUploadResponse | null;

  if (!response.ok || !payload?.secure_url) {
    throw new ApiError(
      response.status || 500,
      payload?.error?.message ?? "Logo upload failed."
    );
  }

  return payload.secure_url;
}
