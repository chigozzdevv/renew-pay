"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BillingMarketCatalogEntry } from "@/lib/markets";

export function formatMarketOptionLabel(option: BillingMarketCatalogEntry) {
  const countrySummary =
    option.countries.length > 2
      ? `${option.countries.slice(0, 2).join(", ")} +${option.countries.length - 2}`
      : option.countries.join(", ");

  return countrySummary
    ? `${option.currency} · ${option.currencyName} · ${countrySummary}`
    : `${option.currency} · ${option.currencyName}`;
}

export function MarketMultiSelect({
  options,
  value,
  onChange,
  allLabel,
  allOptionLabel,
  placeholder = "Select markets",
  disabled = false,
}: {
  options: BillingMarketCatalogEntry[];
  value: string[];
  onChange: (value: string[]) => void;
  allLabel?: string;
  allOptionLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(value);
  const optionCodes = options.map((o) => o.currency);
  const allSelected =
    optionCodes.length > 0 && optionCodes.every((c) => selected.has(c));

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  function toggleCurrency(currency: string) {
    const next = new Set(selected);
    if (next.has(currency)) next.delete(currency);
    else next.add(currency);
    onChange(optionCodes.filter((c) => next.has(c)));
  }

  function toggleAll() {
    onChange(allSelected ? [] : optionCodes);
  }

  const label =
    value.length === 0
      ? placeholder
      : value.length === optionCodes.length
        ? allLabel ?? "All markets"
        : value.length === 1
          ? value[0]
          : `${value.length} markets selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setOpen((v) => !v);
          }
        }}
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-2xl border px-4 text-sm transition-colors disabled:cursor-not-allowed",
          open
            ? "border-[#0c4a27] bg-white text-[color:var(--ink)]"
            : "border-[color:var(--line)] bg-white text-[color:var(--ink)] hover:border-[#0c4a27]/40",
          value.length === 0 && "text-[color:var(--muted)]",
          disabled && "border-[color:var(--line)] bg-[#f8faf7] text-[color:var(--muted)] hover:border-[color:var(--line)]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate font-medium tracking-[-0.01em]">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {value.length > 0 && value.length < optionCodes.length ? (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#0c4a27] px-1 text-[10px] font-bold text-[#d9f6bc]">
              {value.length}
            </span>
          ) : null}
          <svg
            aria-hidden="true"
            viewBox="0 0 10 6"
            className={cn(
              "h-2.5 w-2.5 text-[color:var(--muted)] transition-transform duration-150",
              open && "rotate-180"
            )}
            fill="none"
          >
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white shadow-[0_12px_40px_rgba(12,74,39,0.10)]">
          {allLabel ? (
            <button
              type="button"
              onClick={toggleAll}
              className={cn(
                "flex w-full items-center gap-3 border-b border-[color:var(--line)] px-4 py-3 text-sm font-semibold transition-colors",
                allSelected
                  ? "bg-[#edf7eb] text-[color:var(--brand)]"
                  : "text-[color:var(--ink)] hover:bg-[#f4f7f1]"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  allSelected
                    ? "border-[#0c4a27] bg-[#0c4a27]"
                    : "border-[color:var(--line)]"
                )}
              >
                {allSelected ? (
                  <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 text-white" fill="none">
                    <path d="M1 4L3.8 7L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              {allOptionLabel ?? allLabel}
            </button>
          ) : null}

          <div className="max-h-56 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selected.has(option.currency);
              return (
                <button
                  key={option.currency}
                  type="button"
                  onClick={() => toggleCurrency(option.currency)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors last:rounded-b-2xl",
                    isSelected
                      ? "bg-[#edf7eb] text-[color:var(--brand)]"
                      : "text-[color:var(--ink)] hover:bg-[#f4f7f1]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isSelected
                        ? "border-[#0c4a27] bg-[#0c4a27]"
                        : "border-[color:var(--line)]"
                    )}
                  >
                    {isSelected ? (
                      <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 text-white" fill="none">
                        <path d="M1 4L3.8 7L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="font-semibold tracking-[-0.01em]">{option.currency}</span>
                  <span className="text-[color:var(--muted)]">{option.currencyName}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
