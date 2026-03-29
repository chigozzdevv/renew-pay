import type { NavItem, ProofItem } from "@/types/marketing";

export const landingPrimaryNav: NavItem[] = [
  { label: "Documentation", href: "/docs" },
  { label: "Enterprise", href: "/enterprise" },
  { label: "Playground", href: "/playground" },
];

export const landingProductNav: NavItem[] = [
  { label: "Subscription", href: "/products?type=subscription" },
  { label: "Invoice", href: "/products?type=invoice" },
];

export const proofItems: ProofItem[] = [
  { value: "24/7", label: "always-on settlement" },
  { value: "Solana", label: "native Solana execution" },
  { value: "USDC+", label: "stablecoin-ready invoice rails" },
  { value: "<60s", label: "operator confirmation loop" }
];

export const supportedBillingCurrencies = [
  { code: "NGN", symbol: "\u20A6" },
  { code: "KES", symbol: "KSh" },
  { code: "UGX", symbol: "USh" },
  { code: "XAF", symbol: "FCFA" },
  { code: "MWK", symbol: "MK" },
  { code: "ZAR", symbol: "R" },
  { code: "ZMW", symbol: "ZK" },
  { code: "RWF", symbol: "FRw" },
  { code: "XOF", symbol: "CFA" },
  { code: "BWP", symbol: "P" },
  { code: "CDF", symbol: "FC" },
  { code: "TZS", symbol: "TSh" },
  { code: "GHS", symbol: "GH\u20B5" },
] as const;
