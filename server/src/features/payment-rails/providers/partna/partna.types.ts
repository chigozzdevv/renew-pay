export type PartnaCreateAccountInput = {
  accountName: string;
};

export type PartnaInitiateBvnKycInput = {
  accountName: string;
  bvn: string;
  kesMobileNetwork?: string | null;
  kesShortcode?: string | null;
};

export type PartnaBvnVerificationMethod = {
  method: string;
  hint: string | null;
};

export type PartnaHandleBvnOtpMethodInput = {
  accountName: string;
  verificationMethod: string;
  accountNumber?: string | null;
  bankCode?: string | null;
};

export type PartnaConfirmBvnOtpInput = {
  accountName: string;
  currency: string;
  otp: string;
};

export type PartnaCreateBankAccountInput = {
  accountName: string;
  currency: string;
  preferredAccountName?: string | null;
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
  wavedFee: number | null;
  feeBearer: string | null;
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

export type PartnaRateInput = {
  fromCurrency: string;
  toCurrency: string;
  fromAmount?: number;
  toAmount?: number;
};

export type PartnaRateQuote = {
  key: string | null;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  raw: Record<string, unknown>;
};

export type PartnaSupportedAsset = {
  currency: string;
  network: string;
  destinationCurrency: string;
  name: string;
  symbol: string;
  decimals: number | null;
  minimumWithdrawal: number | null;
  raw: Record<string, unknown>;
};

export type PartnaAccountKycDetails = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  stateOfResidence: string | null;
  lgaOfResidence: string | null;
  raw: Record<string, unknown>;
};

export type PartnaAccountDetailsRecord = {
  accountName: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  bankName: string | null;
  email: string | null;
  externalRef: string | null;
  createdAt: Date | null;
  kycDetails: PartnaAccountKycDetails | null;
  raw: Record<string, unknown>;
};

export type PartnaAccountDetailsInput = {
  accountName?: string;
  page?: number;
  perPage?: number;
};

export interface PartnaProvider {
  createAccount(input: PartnaCreateAccountInput): Promise<Record<string, unknown>>;
  initiateBvnKyc(
    input: PartnaInitiateBvnKycInput
  ): Promise<PartnaBvnVerificationMethod[]>;
  handleBvnOtpMethod(input: PartnaHandleBvnOtpMethodInput): Promise<Record<string, unknown>>;
  confirmBvnOtp(input: PartnaConfirmBvnOtpInput): Promise<Record<string, unknown>>;
  createBankAccount(
    input: PartnaCreateBankAccountInput
  ): Promise<PartnaManagedBankAccount>;
  listStaticBankAccounts(email: string): Promise<PartnaManagedBankAccount[]>;
  listSupportedAssets(): Promise<PartnaSupportedAsset[]>;
  getRate(input: PartnaRateInput): Promise<PartnaRateQuote>;
  getAccountDetails(
    input?: PartnaAccountDetailsInput
  ): Promise<PartnaAccountDetailsRecord[]>;
  createVoucher(input: PartnaVoucherInput): Promise<PartnaVoucherRecord>;
  redeemVoucherAndWithdraw(
    input: PartnaRedeemVoucherInput
  ): Promise<Record<string, unknown>>;
  makeMockPayment?(input: PartnaMockPaymentInput): Promise<Record<string, unknown>>;
}
