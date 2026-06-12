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

export type PartnaBank = {
  code: string;
  name: string;
  raw: Record<string, unknown>;
};

export type PartnaListBanksInput = {
  currency?: string | null;
  onlyValidators?: boolean | null;
};

export type PartnaHandleBvnOtpMethodInput = {
  accountName: string;
  verificationMethod: string;
  currency?: string | null;
  accountNumber?: string | null;
  bankCode?: string | null;
};

export type PartnaConfirmPhoneInput = {
  accountName: string;
  phone: string;
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

export type PartnaRampInput = {
  accountName: string;
  cancelPendingRampRequest?: boolean;
  cryptoAddress: string;
  expireAction?: "useCurrentRate" | "deposit";
  fromAmount: number;
  fromCurrency: string;
  fromNetwork: string;
  rampReference?: string | null;
  rateKey: string;
  toCurrency: "USDC";
  toNetwork: string;
  type: "fiatToCrypto";
};

export type PartnaRampStatusInput = {
  accountName: string;
  rampReference?: string | null;
};

export type PartnaMockFiatDepositInput = {
  accountName: string;
  amount: number;
  currency: string;
  username?: string | null;
};

export type PartnaRampRecord = {
  rampReference: string;
  status: string | null;
  accountName: string | null;
  accountNumber: string | null;
  bankName: string | null;
  currentRate: number | null;
  expiryDate: Date | null;
  feeInFromCurrency: number | null;
  feeInToCurrency: number | null;
  fromAmount: number | null;
  fromCurrency: string | null;
  fromNetwork: string | null;
  toAmount: number | null;
  toCurrency: string | null;
  toNetwork: string | null;
  totalFeesInFromCurrency: number | null;
  totalFeesInToCurrency: number | null;
  raw: Record<string, unknown>;
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
  listBanks(input?: PartnaListBanksInput): Promise<PartnaBank[]>;
  initiateBvnKyc(
    input: PartnaInitiateBvnKycInput
  ): Promise<PartnaBvnVerificationMethod[]>;
  handleBvnOtpMethod(input: PartnaHandleBvnOtpMethodInput): Promise<Record<string, unknown>>;
  confirmPhone(input: PartnaConfirmPhoneInput): Promise<Record<string, unknown>>;
  confirmBvnOtp(input: PartnaConfirmBvnOtpInput): Promise<Record<string, unknown>>;
  createBankAccount(
    input: PartnaCreateBankAccountInput
  ): Promise<PartnaManagedBankAccount>;
  listSupportedAssets(): Promise<PartnaSupportedAsset[]>;
  getRate(input: PartnaRateInput): Promise<PartnaRateQuote>;
  getAccountDetails(
    input?: PartnaAccountDetailsInput
  ): Promise<PartnaAccountDetailsRecord[]>;
  createRamp(input: PartnaRampInput): Promise<PartnaRampRecord>;
  getRampRequests(input: PartnaRampStatusInput): Promise<PartnaRampRecord[]>;
  mockFiatDeposit(input: PartnaMockFiatDepositInput): Promise<Record<string, unknown>>;
}
