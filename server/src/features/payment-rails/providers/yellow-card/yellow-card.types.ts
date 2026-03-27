import type {
  CreateWidgetQuoteInput,
  ResolveBankAccountInput,
} from "@/features/payment-rails/payment-rails.validation";

export type YellowCardChannel = {
  id: string;
  country: string;
  currency: string;
  countryCurrency: string;
  status: string;
  widgetStatus?: string;
  apiStatus?: string;
  feeLocal?: number;
  feeUSD?: number;
  min?: number;
  max?: number;
  widgetMin?: number;
  widgetMax?: number;
  channelType: string;
  rampType: string;
  settlementType?: string;
  estimatedSettlementTime?: number;
};

export type YellowCardNetwork = {
  id: string;
  code?: string;
  country: string;
  name: string;
  status: string;
  accountNumberType?: string;
  countryAccountNumberType?: string;
  channelIds?: string[];
};

export type YellowCardCollectionRequestInput = {
  channelId: string;
  sequenceId: string;
  amount?: number;
  localAmount?: number;
  currency?: string;
  country?: string;
  customerUID: string;
  customerType: "retail" | "institution";
  recipient: {
    businessId?: string;
    businessName?: string;
    name?: string;
    country?: string;
    address?: string;
    dob?: string;
    email?: string;
    idNumber?: string;
    idType?: string;
    additionalIdType?: string;
    additionalIdNumber?: string;
    phone?: string;
  };
  source: {
    accountType: "bank" | "momo";
    accountNumber?: string;
    networkId?: string;
  };
  forceAccept?: boolean;
};

export interface YellowCardProvider {
  getChannels(country?: string): Promise<YellowCardChannel[]>;
  getNetworks(country?: string): Promise<YellowCardNetwork[]>;
  getWidgetQuote(input: CreateWidgetQuoteInput): Promise<Record<string, unknown>>;
  resolveBankAccount(input: ResolveBankAccountInput): Promise<Record<string, unknown>>;
  submitCollectionRequest(
    input: YellowCardCollectionRequestInput
  ): Promise<Record<string, unknown>>;
  getCollectionById(collectionId: string): Promise<Record<string, unknown>>;
  acceptCollectionRequest(collectionId: string): Promise<Record<string, unknown>>;
  denyCollectionRequest(collectionId: string): Promise<Record<string, unknown>>;
}
