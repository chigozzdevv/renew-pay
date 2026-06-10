"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { checkout } from "@renew.sh/sdk";

import { Logo } from "@/components/shared/logo";
import { fetchApi } from "@/lib/api";
import {
  demoMarkets,
  demoUseCases,
  formatDemoAmount,
  getDemoItems,
  getDemoMarket,
  getDemoUseCase,
  getDemoVariant,
  type DemoUseCase,
} from "@/lib/demo-catalog";
import { cn } from "@/lib/utils";

type DemoCollectionResponse = {
  readonly checkoutUrl: string;
};

function getDefaultItemIds(useCaseId: DemoUseCase, variantId: string) {
  const useCase = getDemoUseCase(useCaseId);
  const items = getDemoItems(useCase, variantId);

  return items[0] ? [items[0].id] : [];
}

export default function DemoPage() {
  const [useCaseId, setUseCaseId] = useState<DemoUseCase>("ecommerce");
  const activeUseCase = getDemoUseCase(useCaseId);
  const [variantId, setVariantId] = useState(activeUseCase.variants[0].id);
  const activeVariant = getDemoVariant(activeUseCase, variantId);
  const [marketCode, setMarketCode] = useState("NG");
  const activeMarket = getDemoMarket(marketCode);
  const items = useMemo(
    () => getDemoItems(activeUseCase, activeVariant.id),
    [activeUseCase, activeVariant.id]
  );
  const [cartIds, setCartIds] = useState(() =>
    getDefaultItemIds("ecommerce", activeUseCase.variants[0].id)
  );
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextVariant = activeUseCase.variants[0].id;
    setVariantId(nextVariant);
    setCartIds(getDefaultItemIds(activeUseCase.id, nextVariant));
  }, [activeUseCase]);

  useEffect(() => {
    setCartIds(getDefaultItemIds(activeUseCase.id, activeVariant.id));
  }, [activeUseCase.id, activeVariant.id]);

  const quantities = useMemo(
    () =>
      cartIds.reduce<Map<string, number>>((next, itemId) => {
        next.set(itemId, (next.get(itemId) ?? 0) + 1);
        return next;
      }, new Map()),
    [cartIds]
  );

  const cartItems = items.filter((item) => quantities.has(item.id));
  const total = cartItems.reduce(
    (sum, item) =>
      sum + item.amount[activeMarket.currency] * (quantities.get(item.id) ?? 1),
    0
  );
  const cartCount = cartIds.length;
  const oneShotFlow = useCaseId === "saas" || useCaseId === "fintech";

  function addItem(itemId: string) {
    setError(null);
    setCartIds((current) => (oneShotFlow ? [itemId] : [...current, itemId]));
  }

  function removeItem(itemId: string) {
    setCartIds((current) => {
      const next = [...current];
      const index = next.lastIndexOf(itemId);

      if (index >= 0) {
        next.splice(index, 1);
      }

      return next.length > 0 ? next : current;
    });
  }

  async function openCheckout() {
    if (cartIds.length === 0) {
      setError("Choose an item first.");
      return;
    }

    setIsCheckingOut(true);
    setError(null);

    try {
      const { data } = await fetchApi<DemoCollectionResponse>("/demo/collections", {
        method: "POST",
        body: JSON.stringify({
          useCase: useCaseId,
          variant: activeVariant.id,
          market: marketCode,
          itemIds: cartIds,
        }),
      });

      checkout.open(data.checkoutUrl);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open checkout."
      );
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fbf6] px-4 py-5 text-[#111111] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/82 px-4 py-3 backdrop-blur">
          <a href="/" aria-label="Renew home">
            <Logo size="compact" />
          </a>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-black/10 bg-[#f2f7ef] px-3 py-1.5 text-sm font-semibold text-[#526058]">
              Demo
            </span>
            <a
              href="/docs"
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-[#111111] transition-colors hover:bg-[#f4f5f2]"
            >
              Docs
            </a>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border border-black/10 bg-white px-4 py-4 shadow-[0_20px_80px_rgba(20,35,25,0.08)] sm:px-5 sm:py-5">
            <div className="flex flex-col gap-4 border-b border-black/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#6b746d]">
                  Renew checkout demo
                </p>
                <h1 className="mt-1 max-w-xl text-4xl font-semibold tracking-normal text-[#111111] sm:text-5xl">
                  Collect local payments.
                </h1>
              </div>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b837d]">
                  Country
                </span>
                <select
                  value={marketCode}
                  onChange={(event) => setMarketCode(event.target.value)}
                  className="h-12 rounded-lg border border-black/10 bg-white px-3 text-base font-semibold text-[#111111] outline-none transition-colors focus:border-[#2f6f4e]"
                >
                  {demoMarkets.map((market) => (
                    <option key={market.code} value={market.code}>
                      {market.label} - {market.currency}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {demoUseCases.map((useCase) => (
                <button
                  key={useCase.id}
                  type="button"
                  onClick={() => setUseCaseId(useCase.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                    useCase.id === useCaseId
                      ? "border-[#111111] bg-[#111111] text-white"
                      : "border-black/10 bg-white text-[#5e6761] hover:bg-[#f4f5f2]"
                  )}
                >
                  {useCase.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeUseCase.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setVariantId(variant.id)}
                  className={cn(
                    "rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                    variant.id === activeVariant.id
                      ? "border-[#2f6f4e] bg-[#e8f5e9] text-[#24583d]"
                      : "border-black/10 bg-[#fafafa] text-[#66706a] hover:bg-[#f4f5f2]"
                  )}
                >
                  {variant.label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {items.map((item) => {
                const quantity = quantities.get(item.id) ?? 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id)}
                    className={cn(
                      "group min-h-[178px] rounded-xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#2f6f4e] hover:shadow-[0_18px_40px_rgba(20,35,25,0.1)]",
                      quantity > 0 ? "border-[#2f6f4e]" : "border-black/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#eef6ed] text-sm font-bold text-[#2f6f4e]">
                        {item.name.slice(0, 1)}
                      </div>
                      {quantity > 0 ? (
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#111111] px-2 text-xs font-bold text-white">
                          {quantity}
                        </span>
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-full border border-black/10 text-[#66706a] transition-colors group-hover:border-[#2f6f4e] group-hover:text-[#2f6f4e]">
                          <Plus className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                    <div className="mt-8">
                      <p className="text-lg font-semibold text-[#111111]">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#6b746d]">
                        {item.detail}
                      </p>
                      <p className="mt-5 text-xl font-semibold text-[#111111]">
                        {formatDemoAmount(item.amount[activeMarket.currency], marketCode)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="rounded-2xl border border-black/10 bg-[#111111] p-4 text-white shadow-[0_20px_80px_rgba(20,35,25,0.12)] sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-sm font-semibold text-white/55">
                  {activeUseCase.title}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                  {cartCount} {cartCount === 1 ? "item" : "items"}
                </h2>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-[#111111]">
                <ShoppingBag className="h-5 w-5" />
              </div>
            </div>

            <div className="min-h-[246px] py-4">
              {cartItems.map((item) => {
                const quantity = quantities.get(item.id) ?? 1;

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/10 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm font-medium text-white/50">
                        {quantity} x{" "}
                        {formatDemoAmount(item.amount[activeMarket.currency], marketCode)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!oneShotFlow ? (
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeItem(item.id)}
                          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                      ) : null}
                      <p className="min-w-20 text-right text-base font-semibold text-white">
                        {formatDemoAmount(
                          item.amount[activeMarket.currency] * quantity,
                          marketCode
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-sm font-semibold text-white/55">
                <span>Total</span>
                <span>{activeMarket.currency}</span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-4">
                <p className="text-4xl font-semibold tracking-normal text-white">
                  {formatDemoAmount(total, marketCode)}
                </p>
                {activeUseCase.recurring?.enabled ? (
                  <span className="pb-1 text-sm font-semibold text-white/50">
                    monthly
                  </span>
                ) : null}
              </div>

              {error ? (
                <p className="mt-4 rounded-lg border border-[#fca5a5]/30 bg-[#7f1d1d]/30 px-3 py-2 text-sm font-semibold text-[#fecaca]">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={isCheckingOut || cartCount === 0}
                onClick={() => void openCheckout()}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-[#111111] transition-colors hover:bg-[#e8f5e9] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCheckingOut ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                {isCheckingOut ? "Creating checkout" : activeUseCase.action}
                {!isCheckingOut ? <ArrowRight className="h-5 w-5" /> : null}
              </button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
