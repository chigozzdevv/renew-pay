"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

type FiatTickerProps = {
  currencies?: readonly {
    code: string;
    symbol: string;
  }[];
  codes?: readonly string[];
  className?: string;
};

const TYPING_DELAY_MS = 95;
const DELETING_DELAY_MS = 55;
const HOLD_DELAY_MS = 1200;
const NEXT_DELAY_MS = 240;

export function FiatTicker({
  currencies,
  codes,
  className,
}: FiatTickerProps) {
  const currencyList =
    currencies ??
    codes?.map((code) => ({
      code,
      symbol: "",
    })) ??
    [];

  const longestCode = currencyList.reduce(
    (longest, current) => (current.code.length > longest.length ? current.code : longest),
    "",
  );
  const longestSymbol = currencyList.reduce(
    (longest, current) => (current.symbol.length > longest.length ? current.symbol : longest),
    "",
  );
  const [index, setIndex] = useState(0);
  const [visibleText, setVisibleText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const currentCurrency = currencyList[index];
  const currentCode = currentCurrency?.code ?? "";
  const isSymbolVisible =
    Boolean(currentCurrency?.symbol) && !isDeleting && visibleText === currentCode;

  useEffect(() => {
    if (currencyList.length === 0 || !currentCurrency) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    if (!isDeleting && visibleText !== currentCode) {
      timeoutId = setTimeout(() => {
        setVisibleText(currentCode.slice(0, visibleText.length + 1));
      }, TYPING_DELAY_MS);
    } else if (!isDeleting && visibleText === currentCode) {
      timeoutId = setTimeout(() => {
        setIsDeleting(true);
      }, HOLD_DELAY_MS);
    } else if (isDeleting && visibleText.length > 0) {
      timeoutId = setTimeout(() => {
        setVisibleText(currentCode.slice(0, visibleText.length - 1));
      }, DELETING_DELAY_MS);
    } else {
      timeoutId = setTimeout(() => {
        setIsDeleting(false);
        setIndex((currentIndex) => (currentIndex + 1) % currencyList.length);
      }, NEXT_DELAY_MS);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [currencyList.length, currentCode, currentCurrency, index, isDeleting, visibleText]);

  if (currencyList.length === 0 || !currentCurrency) {
    return null;
  }

  return (
    <span className={`grid ${className ?? ""}`}>
      <span className="invisible col-start-1 row-start-1 inline-flex items-baseline">
        <span className="shrink-0">Bill in&nbsp;{longestCode}</span>
        <span className="ml-[0.18em] inline-block text-[0.28em] font-semibold tracking-[0.08em] opacity-65">
          {longestSymbol}
        </span>
      </span>
      <span className="col-start-1 row-start-1 inline-flex items-baseline">
        <span className="shrink-0">Bill in&nbsp;</span>
        <span>{visibleText}</span>
        <AnimatePresence initial={false} mode="wait">
          {isSymbolVisible ? (
            <motion.span
              key={currentCurrency.code}
              initial={{ opacity: 0, y: "0.14em" }}
              animate={{ opacity: 0.6, y: 0 }}
              exit={{ opacity: 0, y: "-0.12em" }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="ml-[0.18em] inline-block text-[0.28em] font-semibold tracking-[0.08em]"
            >
              {currentCurrency.symbol}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[0.9em] w-[0.06em] bg-[#111111] opacity-70 animate-[hero-caret_0.9s_steps(1,end)_infinite]"
        />
      </span>
    </span>
  );
}
