"use client";

import { fetchApi } from "@/lib/api";

export type NotificationTemplateCatalogEntry = {
  key: string;
  label: string;
  description: string;
  audience: "customer" | "merchant" | "team";
  subjectPreview: string;
  environment: "test" | "live";
};

export type NotificationTemplatePreview = {
  key: string;
  label: string;
  description: string;
  audience: "customer" | "merchant" | "team";
  subject: string;
  html: string;
  text: string;
  environment: "test" | "live";
};

export async function loadNotificationTemplates(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<NotificationTemplateCatalogEntry[]>(
    `/notifications/${input.merchantId}/templates`,
    {
      token: input.token,
      query: {
        environment: input.environment,
      },
    }
  );

  return response.data;
}

export async function loadNotificationTemplatePreview(input: {
  token: string;
  merchantId: string;
  templateKey: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<NotificationTemplatePreview>(
    `/notifications/${input.merchantId}/templates/${encodeURIComponent(input.templateKey)}/preview`,
    {
      token: input.token,
      query: {
        environment: input.environment,
      },
    }
  );

  return response.data;
}
