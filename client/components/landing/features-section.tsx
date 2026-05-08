import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

type FeatureVisual = "setup" | "collection" | "settlement";

const featureCards: Array<{
  title: readonly [string, string];
  body: string;
  visual: FeatureVisual;
  visualSide: "left" | "right";
}> = [
  {
    title: ["Collections", "API & SDK."],
    body: "Collect local fiat payments across fiat-first markets with a developer-friendly API and SDK, tied cleanly to your order reference.",
    visual: "setup",
    visualSide: "right",
  },
  {
    title: ["Renew", "Checkout."],
    body: "Give customers a focused payment screen for local collection, bank transfer details, and payment confirmation.",
    visual: "collection",
    visualSide: "left",
  },
  {
    title: ["Public or private", "settlement."],
    body: "Get standard or private settlement, depending on how your business wants to receive funds.",
    visual: "settlement",
    visualSide: "right",
  },
];

const cardZIndexClasses = ["z-10", "z-20", "z-30"] as const;

const payoutRows = [
  { batch: "batch_1042", net: "$16.04", destination: "main-wallet", status: "settled" },
  { batch: "batch_1041", net: "$8,930.00", destination: "ops-wallet", status: "queued" },
] as const;

function SetupVisual() {
  const codeLines = [
    'import { renew } from "@renew.sh/sdk";',
    "",
    "const client = renew({",
    "  secretKey: process.env.RENEW_SECRET_KEY!,",
    "});",
    "",
    "const collection = await client.collections.create({",
    "  amount: order.total,",
    '  currency: "NGN",',
    "  reference: order.id,",
    '  settlement: "default",',
    "});",
    "",
    "return collection.checkoutUrl;",
  ];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#dfe9dd] bg-[#fbfcf8]">
      <div className="flex items-center justify-between border-b border-[#e5ede2] bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#e7796b]" />
          <span className="h-3 w-3 rounded-full bg-[#e8bb52]" />
          <span className="h-3 w-3 rounded-full bg-[#5fbf7c]" />
        </div>
        <span className="text-xs font-semibold text-[#68726b]">checkout.ts</span>
      </div>
      <div className="overflow-x-auto px-5 py-5 font-mono text-[11px] leading-6 text-[#1b221d] sm:px-6 sm:py-6 sm:text-[12px] lg:text-[13px] xl:text-[14px]">
        {codeLines.map((line, index) => (
          <div
            key={`${line}-${index}`}
            className="grid grid-cols-[2rem_minmax(24rem,1fr)] gap-3"
          >
            <span className="select-none text-right text-[#9aa69d]">{index + 1}</span>
            <code className="whitespace-pre">{line}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollectionVisual() {
  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-[20rem]">
        <div className="rounded-xl border border-[#d8ddd6] bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e9f5ec] text-sm font-semibold text-[#225c39]">
              A
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-[#151713]">
              Acme Store
            </span>
          </div>

          <div className="mt-6 text-center">
            <p className="whitespace-nowrap font-display text-[2.45rem] font-medium leading-none tracking-normal text-[#151713]">
              <span className="text-[#b7b7b7]">₦</span>26,500
            </p>
            <p className="mt-2 text-sm font-medium text-[#66706a]">Order #1042</p>
          </div>

          <div className="mt-5 space-y-2.5">
            <CheckoutField label="Bank" value="Providus Bank" />
            <CheckoutField label="Account number" value="1234567890" />
            <CheckoutField label="Account name" value="Acme Store - Ada" />
          </div>

          <button className="mt-4 h-10 w-full rounded-lg bg-[#272b25] text-sm font-semibold text-white">
            I've paid
          </button>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-[#7a7f73]">
            <span>Powered by</span>
            <img
              src="/renew-logo.png"
              alt="Renew"
              width={500}
              height={500}
              className="h-4 w-auto object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dcdee8] bg-white px-3.5 py-2.5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#7a8178]">
        {label}
      </p>
      <p className="mt-1.5 text-base font-semibold text-[#151713]">{value}</p>
    </div>
  );
}

function SettlementVisual() {
  return (
    <div className="w-full max-w-[38rem] overflow-hidden rounded-xl border border-[#dfe9dd] bg-white">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-[2rem] font-semibold leading-none tracking-[-0.05em] text-[#111111]">
            Payouts
          </h3>
          <span className="rounded-full bg-[#e9f5ec] px-4 py-2 text-xs font-semibold text-[#225c39]">
            USDC
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <DashboardMetric label="Queued" value="3" />
          <DashboardMetric label="Settled" value="$16.04" />
          <DashboardMetric label="Failed" value="0" />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-xl border border-[#e3e8e1] bg-[#fbfcf8] p-4">
            <p className="text-xs font-medium text-[#68726b]">Default route</p>
            <p className="mt-2 text-lg font-semibold text-[#111111]">main-wallet</p>
            <div className="mt-5 space-y-3">
              {["Customer paid", "Payment captured", "USDC settled"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9f5ec] text-[#225c39]">
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                      <path d="M4 8.2l2.2 2.2L12 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-[#111111]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#e3e8e1] bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-base font-semibold text-[#111111]">Recent payouts</h4>
              <span className="rounded-lg border border-[#dfe6dd] bg-[#fbfcf8] px-3 py-1.5 text-xs font-semibold text-[#68726b]">
                All
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {payoutRows.map((row) => (
                <div
                  key={row.batch}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-[#edf1eb] px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#111111]">{row.batch}</p>
                    <p className="mt-1 text-xs font-medium text-[#68726b]">
                      {row.destination}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#111111]">{row.net}</p>
                    <span
                      className={cn(
                        "mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                        row.status === "settled"
                          ? "bg-[#e9f5ec] text-[#225c39]"
                          : "bg-[#fff6e7] text-[#76511a]"
                      )}
                    >
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e3e8e1] bg-white p-3">
      <p className="text-xs font-medium text-[#68726b]">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-[#111111]">
        {value}
      </p>
    </div>
  );
}

function FeatureVisual({ visual }: { visual: FeatureVisual }) {
  if (visual === "setup") {
    return <SetupVisual />;
  }

  if (visual === "collection") {
    return <CollectionVisual />;
  }

  return <SettlementVisual />;
}

export function FeaturesSection() {
  return (
    <section className="py-12 sm:py-14 lg:py-16">
      <Container>
        <div className="space-y-[10vh] pb-6 sm:pb-8 lg:pb-10">
          {featureCards.map((card, index) => {
            const visualFirst = card.visualSide === "left";

            return (
              <Reveal
                key={card.body}
                offset={18}
                className={cn("sticky top-20", cardZIndexClasses[index])}
              >
                <article className="relative min-h-[34rem] overflow-hidden rounded-xl border border-[#dfe9dd] bg-[#fbfdf8] px-5 py-6 sm:min-h-[38rem] sm:px-7 sm:py-8 lg:min-h-[42rem] lg:px-10 lg:py-10">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(17,17,17,0),rgba(47,125,60,0.38),rgba(17,17,17,0))]" />
                  <div
                    className={cn(
                      "relative grid h-full gap-8 lg:min-h-[34rem] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center",
                      visualFirst && "lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-h-[19rem] items-center justify-center",
                        visualFirst ? "lg:order-1" : "lg:order-2"
                      )}
                    >
                      <FeatureVisual visual={card.visual} />
                    </div>

                    <div
                      className={cn(
                        "max-w-[32rem] self-center",
                        visualFirst ? "lg:order-2 lg:justify-self-center" : "lg:order-1"
                      )}
                    >
                      <h2 className="max-w-[11ch] font-display text-[clamp(2.55rem,5.7vw,4.35rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
                        <span>{card.title[0]}</span>
                        <span className="hero-image-text block">{card.title[1]}</span>
                      </h2>
                      <p className="mt-6 text-[1rem] leading-7 text-[#5e6861] sm:text-[1.08rem]">
                        {card.body}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
