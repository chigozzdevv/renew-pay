import type { NavItem, ProofItem } from "@/types/marketing";

export const landingPrimaryNav: NavItem[] = [
  { label: "Documentation", href: "/docs" },
  { label: "Developers", href: "/developers" },
  { label: "Enterprise", href: "/enterprise" },
];

export const landingProductNav: NavItem[] = [];

export const proofItems: ProofItem[] = [
  { value: "24/7", label: "always-on settlement" },
  { value: "Stellar", label: "USDC settlement" },
  { value: "T+1", label: "next-day release window" },
  { value: "<60s", label: "operator confirmation loop" }
];

export const supportedCollectionCurrencies = [
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
