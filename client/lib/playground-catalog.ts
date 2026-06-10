export type PlaygroundUseCase = "ecommerce" | "marketplace" | "saas" | "fintech";

export type PlaygroundMarketCode = "NG" | "GH" | "KE";

export type PlaygroundVariant = {
  readonly id: string;
  readonly label: string;
};

export type PlaygroundItem = {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly amount: Record<string, number>;
};

export type PlaygroundUseCaseConfig = {
  readonly id: PlaygroundUseCase;
  readonly label: string;
  readonly title: string;
  readonly action: string;
  readonly variants: readonly PlaygroundVariant[];
  readonly items: Record<string, readonly PlaygroundItem[]>;
  readonly recurring?: {
    readonly enabled: boolean;
    readonly interval: "month";
    readonly intervalCount: number;
  };
};

export const playgroundMarkets = [
  { code: "NG", label: "Nigeria", currency: "NGN", locale: "en-NG" },
  { code: "GH", label: "Ghana", currency: "GHS", locale: "en-GH" },
  { code: "KE", label: "Kenya", currency: "KES", locale: "en-KE" },
] as const;

export const playgroundUseCases: readonly PlaygroundUseCaseConfig[] = [
  {
    id: "ecommerce",
    label: "Ecommerce",
    title: "Cart checkout",
    action: "Checkout with Renew",
    variants: [
      { id: "fashion", label: "Fashion" },
      { id: "home", label: "Home" },
      { id: "food", label: "Food" },
    ],
    items: {
      fashion: [
        {
          id: "linen-shirt",
          name: "Linen shirt",
          detail: "Olive",
          amount: { NGN: 18500, GHS: 185, KES: 2450 },
        },
        {
          id: "canvas-tote",
          name: "Canvas tote",
          detail: "Sand",
          amount: { NGN: 12500, GHS: 125, KES: 1650 },
        },
        {
          id: "classic-cap",
          name: "Classic cap",
          detail: "Forest",
          amount: { NGN: 3500, GHS: 35, KES: 460 },
        },
      ],
      home: [
        {
          id: "desk-lamp",
          name: "Desk lamp",
          detail: "Warm light",
          amount: { NGN: 28500, GHS: 285, KES: 3780 },
        },
        {
          id: "ceramic-cup",
          name: "Ceramic cup",
          detail: "Ivory",
          amount: { NGN: 6500, GHS: 65, KES: 860 },
        },
        {
          id: "linen-throw",
          name: "Linen throw",
          detail: "Moss",
          amount: { NGN: 22000, GHS: 220, KES: 2920 },
        },
      ],
      food: [
        {
          id: "lunch-box",
          name: "Lunch box",
          detail: "Rice bowl",
          amount: { NGN: 7200, GHS: 72, KES: 950 },
        },
        {
          id: "coffee-pack",
          name: "Coffee pack",
          detail: "Ground",
          amount: { NGN: 9600, GHS: 96, KES: 1280 },
        },
        {
          id: "fruit-box",
          name: "Fruit box",
          detail: "Seasonal",
          amount: { NGN: 11800, GHS: 118, KES: 1560 },
        },
      ],
    },
  },
  {
    id: "marketplace",
    label: "Marketplace",
    title: "Multi-seller order",
    action: "Pay marketplace order",
    variants: [
      { id: "services", label: "Services" },
      { id: "delivery", label: "Delivery" },
      { id: "creators", label: "Creators" },
    ],
    items: {
      services: [
        {
          id: "brand-kit",
          name: "Brand kit",
          detail: "Seller: Nia Studio",
          amount: { NGN: 42000, GHS: 420, KES: 5580 },
        },
        {
          id: "product-shoot",
          name: "Product shoot",
          detail: "Seller: Frame Lab",
          amount: { NGN: 68000, GHS: 680, KES: 9020 },
        },
        {
          id: "landing-copy",
          name: "Landing copy",
          detail: "Seller: Ada Writes",
          amount: { NGN: 31000, GHS: 310, KES: 4120 },
        },
      ],
      delivery: [
        {
          id: "same-day",
          name: "Same-day delivery",
          detail: "Vendor: SwiftHub",
          amount: { NGN: 5600, GHS: 56, KES: 740 },
        },
        {
          id: "market-run",
          name: "Market run",
          detail: "Vendor: ErrandPro",
          amount: { NGN: 8300, GHS: 83, KES: 1100 },
        },
        {
          id: "bulk-drop",
          name: "Bulk drop",
          detail: "Vendor: Dispatch Lane",
          amount: { NGN: 15000, GHS: 150, KES: 1990 },
        },
      ],
      creators: [
        {
          id: "creator-pack",
          name: "Creator pack",
          detail: "Seller: Kemi Visuals",
          amount: { NGN: 27500, GHS: 275, KES: 3650 },
        },
        {
          id: "voiceover",
          name: "Voiceover",
          detail: "Seller: Audio Haus",
          amount: { NGN: 19000, GHS: 190, KES: 2520 },
        },
        {
          id: "short-edit",
          name: "Short edit",
          detail: "Seller: Cut Room",
          amount: { NGN: 24500, GHS: 245, KES: 3250 },
        },
      ],
    },
  },
  {
    id: "saas",
    label: "SaaS",
    title: "Subscription billing",
    action: "Start subscription",
    variants: [
      { id: "plans", label: "Plans" },
      { id: "seats", label: "Seats" },
      { id: "usage", label: "Usage" },
    ],
    recurring: { enabled: true, interval: "month", intervalCount: 1 },
    items: {
      plans: [
        {
          id: "starter-plan",
          name: "Starter plan",
          detail: "Monthly",
          amount: { NGN: 14500, GHS: 145, KES: 1920 },
        },
        {
          id: "team-plan",
          name: "Team plan",
          detail: "Monthly",
          amount: { NGN: 39000, GHS: 390, KES: 5180 },
        },
        {
          id: "scale-plan",
          name: "Scale plan",
          detail: "Monthly",
          amount: { NGN: 76000, GHS: 760, KES: 10080 },
        },
      ],
      seats: [
        {
          id: "five-seats",
          name: "5 seats",
          detail: "Monthly",
          amount: { NGN: 21500, GHS: 215, KES: 2850 },
        },
        {
          id: "ten-seats",
          name: "10 seats",
          detail: "Monthly",
          amount: { NGN: 41000, GHS: 410, KES: 5440 },
        },
        {
          id: "twenty-seats",
          name: "20 seats",
          detail: "Monthly",
          amount: { NGN: 79000, GHS: 790, KES: 10480 },
        },
      ],
      usage: [
        {
          id: "api-pack",
          name: "API pack",
          detail: "Monthly",
          amount: { NGN: 26000, GHS: 260, KES: 3450 },
        },
        {
          id: "storage-pack",
          name: "Storage pack",
          detail: "Monthly",
          amount: { NGN: 18000, GHS: 180, KES: 2390 },
        },
        {
          id: "support-pack",
          name: "Support pack",
          detail: "Monthly",
          amount: { NGN: 34000, GHS: 340, KES: 4510 },
        },
      ],
    },
  },
  {
    id: "fintech",
    label: "Fintech",
    title: "Account funding",
    action: "Fund with Renew",
    variants: [
      { id: "wallet", label: "Wallet" },
      { id: "savings", label: "Savings" },
      { id: "credit", label: "Credit" },
    ],
    items: {
      wallet: [
        {
          id: "wallet-small",
          name: "Wallet top-up",
          detail: "Small",
          amount: { NGN: 10000, GHS: 100, KES: 1330 },
        },
        {
          id: "wallet-medium",
          name: "Wallet top-up",
          detail: "Medium",
          amount: { NGN: 25000, GHS: 250, KES: 3320 },
        },
        {
          id: "wallet-large",
          name: "Wallet top-up",
          detail: "Large",
          amount: { NGN: 50000, GHS: 500, KES: 6640 },
        },
      ],
      savings: [
        {
          id: "goal-weekly",
          name: "Goal deposit",
          detail: "Weekly target",
          amount: { NGN: 15000, GHS: 150, KES: 1990 },
        },
        {
          id: "goal-monthly",
          name: "Goal deposit",
          detail: "Monthly target",
          amount: { NGN: 45000, GHS: 450, KES: 5980 },
        },
        {
          id: "vault-deposit",
          name: "Vault deposit",
          detail: "Locked savings",
          amount: { NGN: 80000, GHS: 800, KES: 10620 },
        },
      ],
      credit: [
        {
          id: "repayment-small",
          name: "Loan repayment",
          detail: "Installment",
          amount: { NGN: 18000, GHS: 180, KES: 2390 },
        },
        {
          id: "repayment-medium",
          name: "Loan repayment",
          detail: "Balance",
          amount: { NGN: 42000, GHS: 420, KES: 5580 },
        },
        {
          id: "repayment-large",
          name: "Loan repayment",
          detail: "Early payoff",
          amount: { NGN: 95000, GHS: 950, KES: 12610 },
        },
      ],
    },
  },
] as const;

export function getPlaygroundMarket(code: string) {
  return playgroundMarkets.find((market) => market.code === code) ?? playgroundMarkets[0];
}

export function getPlaygroundUseCase(id: string) {
  return playgroundUseCases.find((useCase) => useCase.id === id) ?? playgroundUseCases[0];
}

export function getPlaygroundVariant(useCase: PlaygroundUseCaseConfig, id: string) {
  return (
    useCase.variants.find((variant) => variant.id === id) ?? useCase.variants[0]
  );
}

export function getPlaygroundItems(useCase: PlaygroundUseCaseConfig, variantId: string) {
  return useCase.items[variantId] ?? useCase.items[useCase.variants[0].id] ?? [];
}

export function formatPlaygroundAmount(amount: number, marketCode: string) {
  const market = getPlaygroundMarket(marketCode);

  return new Intl.NumberFormat(market.locale, {
    style: "currency",
    currency: market.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
