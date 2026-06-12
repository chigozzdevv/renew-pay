"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { checkout } from "@renew.sh/sdk";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/shared/header";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { fetchApi } from "@/lib/api";
import {
  playgroundMarkets,
  playgroundUseCases,
  formatPlaygroundAmount,
  getPlaygroundItems,
  getPlaygroundMarket,
  getPlaygroundUseCase,
  getPlaygroundVariant,
  type PlaygroundUseCase,
} from "@/lib/playground-catalog";
import { cn } from "@/lib/utils";

type PlaygroundCollectionResponse = {
  readonly checkoutUrl: string;
};

function getDefaultItemIds(useCaseId: PlaygroundUseCase, variantId: string) {
  const useCase = getPlaygroundUseCase(useCaseId);
  const items = getPlaygroundItems(useCase, variantId);

  return items[0] ? [items[0].id] : [];
}

export default function PlaygroundPage() {
  const [useCaseId, setUseCaseId] = useState<PlaygroundUseCase>("ecommerce");
  const activeUseCase = getPlaygroundUseCase(useCaseId);
  const [variantId, setVariantId] = useState(activeUseCase.variants[0].id);
  const activeVariant = getPlaygroundVariant(activeUseCase, variantId);
  const [marketCode, setMarketCode] = useState("NG");
  const activeMarket = getPlaygroundMarket(marketCode);
  const items = useMemo(
    () => getPlaygroundItems(activeUseCase, activeVariant.id),
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

      return next;
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
      const { data } = await fetchApi<PlaygroundCollectionResponse>("/playground/collections", {
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
    <div className="page-shell flex min-h-screen flex-col bg-[#e8f5e9] text-[#111111]">
      <Suspense fallback={null}>
        <Header tone="hero" />
      </Suspense>

      <main className="flex-1">
        <section className="pb-16 pt-8 sm:pb-20 sm:pt-10 lg:pb-24 lg:pt-12">
          <Container>
            <Reveal offset={28}>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_1px_380px] lg:gap-10">
                <div className="min-w-0">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {playgroundUseCases.map((useCase) => (
                        <button
                          key={useCase.id}
                          type="button"
                          onClick={() => setUseCaseId(useCase.id)}
                          className={cn(
                            "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                            useCase.id === useCaseId
                              ? "bg-[#111111] text-white"
                              : "bg-white/60 text-[#5e6761] hover:bg-white"
                          )}
                        >
                          {useCase.label}
                        </button>
                      ))}
                    </div>

                    <label className="relative inline-flex w-[78px] items-center justify-end">
                      <span className="sr-only">
                        Currency
                      </span>
                      <select
                        value={marketCode}
                        aria-label="Currency"
                        onChange={(event) => setMarketCode(event.target.value)}
                        className="h-10 w-full appearance-none bg-transparent py-0 pl-1 pr-6 text-right text-base font-semibold text-[#111111] outline-none transition-colors focus:text-[#2f6f4e]"
                      >
                        {playgroundMarkets.map((market) => (
                          <option key={market.code} value={market.code}>
                            {market.currency}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-[#5f6b63]" />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {activeUseCase.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setVariantId(variant.id)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                          variant.id === activeVariant.id
                            ? "bg-[#d9ead8] text-[#24583d]"
                            : "text-[#66706a] hover:bg-white/60"
                        )}
                      >
                        {variant.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-8 divide-y divide-black/8">
                    {items.map((item) => {
                      const quantity = quantities.get(item.id) ?? 0;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => addItem(item.id)}
                          className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-5 py-5 text-left transition-colors hover:bg-white/40"
                        >
                          <span className="flex min-w-0 items-center gap-4">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/70 text-sm font-bold text-[#2f6f4e]">
                              {item.name.slice(0, 1)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-lg font-semibold text-[#111111]">
                                {item.name}
                              </span>
                              <span className="mt-1 block truncate text-sm font-medium text-[#6b746d]">
                                {item.detail}
                              </span>
                            </span>
                          </span>

                          <span className="flex items-center gap-4">
                            <span className="text-right text-lg font-semibold text-[#111111]">
                              {formatPlaygroundAmount(
                                item.amount[activeMarket.currency],
                                marketCode
                              )}
                            </span>
                            <span
                              className={cn(
                                "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors",
                                quantity > 0
                                  ? "bg-[#111111] text-white"
                                  : "bg-white/70 text-[#66706a] group-hover:bg-[#111111] group-hover:text-white"
                              )}
                            >
                              {quantity > 0 ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  {quantity}
                                </>
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="hidden bg-black/8 lg:block" />

                <aside className="self-start rounded-lg bg-[#111111] p-5 text-white shadow-[0_20px_80px_rgba(20,35,25,0.12)] lg:sticky lg:top-24">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white/55">
                        {activeUseCase.title}
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                        {cartCount} {cartCount === 1 ? "item" : "items"}
                      </h2>
                    </div>
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-[#111111]">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="min-h-[180px] py-5">
                    {cartItems.length > 0 ? (
                      <div className="divide-y divide-white/10">
                        {cartItems.map((item) => {
                          const quantity = quantities.get(item.id) ?? 1;

                          return (
                            <div
                              key={item.id}
                              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-white">
                                  {item.name}
                                </p>
                                <p className="mt-1 text-sm font-medium text-white/50">
                                  {formatPlaygroundAmount(
                                    item.amount[activeMarket.currency],
                                    marketCode
                                  )}
                                </p>
                              </div>
                              <div className="grid justify-items-end gap-2">
                                {!oneShotFlow ? (
                                  <div className="inline-flex items-center rounded-full bg-white/10 p-1">
                                    <button
                                      type="button"
                                      aria-label={`Remove ${item.name}`}
                                      onClick={() => removeItem(item.id)}
                                      className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white hover:text-[#111111]"
                                    >
                                      <Minus className="h-4 w-4" />
                                    </button>
                                    <span className="min-w-7 text-center text-sm font-bold text-white">
                                      {quantity}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={`Add ${item.name}`}
                                      onClick={() => addItem(item.id)}
                                      className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white hover:text-[#111111]"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : null}
                                <p className="text-right text-base font-semibold text-white">
                                  {formatPlaygroundAmount(
                                    item.amount[activeMarket.currency] * quantity,
                                    marketCode
                                  )}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-white/15 text-sm font-semibold text-white/45">
                        Select an item
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between text-sm font-semibold text-white/55">
                      <span>Total</span>
                      <span>{activeMarket.currency}</span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-4">
                      <p className="text-4xl font-semibold tracking-normal text-white">
                        {formatPlaygroundAmount(total, marketCode)}
                      </p>
                      {activeUseCase.recurring?.enabled ? (
                        <span className="pb-1 text-sm font-semibold text-white/50">
                          monthly
                        </span>
                      ) : null}
                    </div>

                    {error ? (
                      <p className="mt-4 rounded-lg bg-[#7f1d1d]/35 px-3 py-2 text-sm font-semibold text-[#fecaca]">
                        {error}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      disabled={isCheckingOut || cartCount === 0}
                      onClick={() => void openCheckout()}
                      className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-[#111111] transition-colors hover:bg-[#e8f5e9] disabled:cursor-not-allowed disabled:opacity-60"
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
              </div>
            </Reveal>
          </Container>
        </section>
      </main>

      <Footer tone="hero" />
    </div>
  );
}
