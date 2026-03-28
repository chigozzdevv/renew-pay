export const paymentRailProviderValues = ["yellow_card", "partna"] as const;

export type PaymentRailProvider = (typeof paymentRailProviderValues)[number];

export type PaymentInstructionKind = "bank_transfer" | "redirect";

export type PaymentInstructionBankTransfer = {
  bankCode?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
};
