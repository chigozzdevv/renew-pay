export type PlaygroundUseCaseId = "ecommerce" | "marketplace" | "saas" | "fintech";
export type PlaygroundMarketCode = "NG" | "GH" | "KE";

export type PlaygroundItem = {
  id: string;
  name: string;
  detail: string;
  amount: Record<string, number>;
};

export type PlaygroundUseCase = {
  id: PlaygroundUseCaseId;
  title: string;
  variants: string[];
  recurring?: {
    enabled: true;
    interval: "month";
    intervalCount: 1;
  };
  items: Record<string, PlaygroundItem[]>;
};

export const playgroundMarkets = [
  { code: "NG", currency: "NGN" },
  { code: "GH", currency: "GHS" },
  { code: "KE", currency: "KES" },
] as const;

export const playgroundUseCases: PlaygroundUseCase[] = [
  {
    id: "ecommerce",
    title: "Cart checkout",
    variants: ["fashion", "home", "food"],
    items: {
      fashion: [
        { id: "linen-shirt", name: "Linen shirt", detail: "Olive", amount: { NGN: 1200, GHS: 12, KES: 160 } },
        { id: "canvas-tote", name: "Canvas tote", detail: "Sand", amount: { NGN: 900, GHS: 9, KES: 120 } },
        { id: "classic-cap", name: "Classic cap", detail: "Forest", amount: { NGN: 600, GHS: 6, KES: 80 } },
      ],
      home: [
        { id: "desk-lamp", name: "Desk lamp", detail: "Warm light", amount: { NGN: 1500, GHS: 15, KES: 200 } },
        { id: "ceramic-cup", name: "Ceramic cup", detail: "Ivory", amount: { NGN: 700, GHS: 7, KES: 95 } },
        { id: "linen-throw", name: "Linen throw", detail: "Moss", amount: { NGN: 1300, GHS: 13, KES: 175 } },
      ],
      food: [
        { id: "lunch-box", name: "Lunch box", detail: "Rice bowl", amount: { NGN: 800, GHS: 8, KES: 105 } },
        { id: "coffee-pack", name: "Coffee pack", detail: "Ground", amount: { NGN: 1000, GHS: 10, KES: 135 } },
        { id: "fruit-box", name: "Fruit box", detail: "Seasonal", amount: { NGN: 1100, GHS: 11, KES: 145 } },
      ],
    },
  },
  {
    id: "marketplace",
    title: "Multi-seller order",
    variants: ["services", "delivery", "creators"],
    items: {
      services: [
        { id: "brand-kit", name: "Brand kit", detail: "Seller: Nia Studio", amount: { NGN: 1600, GHS: 16, KES: 215 } },
        { id: "product-shoot", name: "Product shoot", detail: "Seller: Frame Lab", amount: { NGN: 2200, GHS: 22, KES: 295 } },
        { id: "landing-copy", name: "Landing copy", detail: "Seller: Ada Writes", amount: { NGN: 1400, GHS: 14, KES: 185 } },
      ],
      delivery: [
        { id: "same-day", name: "Same-day delivery", detail: "Vendor: SwiftHub", amount: { NGN: 700, GHS: 7, KES: 95 } },
        { id: "market-run", name: "Market run", detail: "Vendor: ErrandPro", amount: { NGN: 900, GHS: 9, KES: 120 } },
        { id: "bulk-drop", name: "Bulk drop", detail: "Vendor: Dispatch Lane", amount: { NGN: 1300, GHS: 13, KES: 175 } },
      ],
      creators: [
        { id: "creator-pack", name: "Creator pack", detail: "Seller: Kemi Visuals", amount: { NGN: 1400, GHS: 14, KES: 185 } },
        { id: "voiceover", name: "Voiceover", detail: "Seller: Audio Haus", amount: { NGN: 1000, GHS: 10, KES: 135 } },
        { id: "short-edit", name: "Short edit", detail: "Seller: Cut Room", amount: { NGN: 1200, GHS: 12, KES: 160 } },
      ],
    },
  },
  {
    id: "saas",
    title: "Subscription billing",
    variants: ["plans", "seats", "usage"],
    recurring: { enabled: true, interval: "month", intervalCount: 1 },
    items: {
      plans: [
        { id: "starter-plan", name: "Starter plan", detail: "Monthly", amount: { NGN: 1000, GHS: 10, KES: 135 } },
        { id: "team-plan", name: "Team plan", detail: "Monthly", amount: { NGN: 1600, GHS: 16, KES: 215 } },
        { id: "scale-plan", name: "Scale plan", detail: "Monthly", amount: { NGN: 2400, GHS: 24, KES: 320 } },
      ],
      seats: [
        { id: "five-seats", name: "5 seats", detail: "Monthly", amount: { NGN: 1200, GHS: 12, KES: 160 } },
        { id: "ten-seats", name: "10 seats", detail: "Monthly", amount: { NGN: 1700, GHS: 17, KES: 225 } },
        { id: "twenty-seats", name: "20 seats", detail: "Monthly", amount: { NGN: 2500, GHS: 25, KES: 335 } },
      ],
      usage: [
        { id: "api-pack", name: "API pack", detail: "Monthly", amount: { NGN: 1300, GHS: 13, KES: 175 } },
        { id: "storage-pack", name: "Storage pack", detail: "Monthly", amount: { NGN: 1000, GHS: 10, KES: 135 } },
        { id: "support-pack", name: "Support pack", detail: "Monthly", amount: { NGN: 1500, GHS: 15, KES: 200 } },
      ],
    },
  },
  {
    id: "fintech",
    title: "Account funding",
    variants: ["wallet", "savings", "credit"],
    items: {
      wallet: [
        { id: "wallet-small", name: "Wallet top-up", detail: "Small", amount: { NGN: 1000, GHS: 10, KES: 135 } },
        { id: "wallet-medium", name: "Wallet top-up", detail: "Medium", amount: { NGN: 1500, GHS: 15, KES: 200 } },
        { id: "wallet-large", name: "Wallet top-up", detail: "Large", amount: { NGN: 2200, GHS: 22, KES: 295 } },
      ],
      savings: [
        { id: "goal-weekly", name: "Goal deposit", detail: "Weekly target", amount: { NGN: 1200, GHS: 12, KES: 160 } },
        { id: "goal-monthly", name: "Goal deposit", detail: "Monthly target", amount: { NGN: 1800, GHS: 18, KES: 240 } },
        { id: "vault-deposit", name: "Vault deposit", detail: "Locked savings", amount: { NGN: 2500, GHS: 25, KES: 335 } },
      ],
      credit: [
        { id: "repayment-small", name: "Loan repayment", detail: "Installment", amount: { NGN: 1100, GHS: 11, KES: 145 } },
        { id: "repayment-medium", name: "Loan repayment", detail: "Balance", amount: { NGN: 1700, GHS: 17, KES: 225 } },
        { id: "repayment-large", name: "Loan repayment", detail: "Early payoff", amount: { NGN: 2600, GHS: 26, KES: 345 } },
      ],
    },
  },
];

export function getPlaygroundMarket(code: string) {
  return playgroundMarkets.find((market) => market.code === code) ?? playgroundMarkets[0];
}

export function getPlaygroundUseCase(id: string) {
  return playgroundUseCases.find((useCase) => useCase.id === id) ?? playgroundUseCases[0];
}

export function getPlaygroundVariant(useCase: PlaygroundUseCase, id: string) {
  return useCase.variants.includes(id) ? id : useCase.variants[0];
}
