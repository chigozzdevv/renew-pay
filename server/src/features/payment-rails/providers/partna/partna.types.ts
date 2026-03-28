export type PartnaManagedAccountInput = {
  email: string;
  fullName: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2?: string | null;
  addressLine3?: string | null;
  phoneNumber: string;
  country: string;
  currency: string;
  bvn: string;
  stateOfOrigin: string;
  stateOfResidence: string;
  lgaOfOrigin: string;
  lgaOfResidence: string;
  callbackUrl?: string | null;
};

export type PartnaManagedBankAccount = {
  provider: "partna";
  accountName: string;
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  currency: string;
  email: string;
  fullName: string;
  raw: Record<string, unknown>;
};

export type PartnaVoucherInput = {
  email: string;
  fullName: string;
  amount: number;
  merchant: string;
};

export type PartnaVoucherRecord = {
  provider: "partna";
  voucherId: string;
  voucherCode: string | null;
  status: string;
  amount: number;
  fee: number | null;
  currency: string;
  email: string;
  fullName: string;
  reference: string | null;
  paymentUrl: string | null;
  raw: Record<string, unknown>;
};

export type PartnaRedeemVoucherInput = {
  email: string;
  voucherCode: string;
  currency: "USDC";
  network: "solana";
  cryptoAddress: string;
};

export type PartnaMockPaymentInput = {
  accountNumber: string;
  paymentAmount: number;
  currency: string;
  reference: string;
};

export interface PartnaProvider {
  createManagedBankAccount(
    input: PartnaManagedAccountInput
  ): Promise<PartnaManagedBankAccount>;
  listStaticBankAccounts(email: string): Promise<PartnaManagedBankAccount[]>;
  createVoucher(input: PartnaVoucherInput): Promise<PartnaVoucherRecord>;
  redeemVoucherAndWithdraw(
    input: PartnaRedeemVoucherInput
  ): Promise<Record<string, unknown>>;
  makeMockPayment?(input: PartnaMockPaymentInput): Promise<Record<string, unknown>>;
}
