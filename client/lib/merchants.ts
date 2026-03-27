"use client";

import { fetchApi } from "@/lib/api";

export async function updateMerchantSupportedMarkets(input: {
  token: string;
  merchantId: string;
  supportedMarkets: string[];
}) {
  const response = await fetchApi<{
    id: string;
    supportedMarkets: string[];
  }>(`/merchants/${input.merchantId}`, {
    method: "PATCH",
    token: input.token,
    body: JSON.stringify({
      supportedMarkets: input.supportedMarkets,
    }),
  });

  return response.data;
}
