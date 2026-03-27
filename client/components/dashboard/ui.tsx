"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

export function PageState({
  title,
  message,
  tone = "neutral",
  action,
}: {
  title: string;
  message: string;
  tone?: "neutral" | "danger";
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border p-6",
        tone === "danger"
          ? "border-[#cfa7a0] bg-[#fff7f6]"
          : "border-[color:var(--line)] bg-white/82"
      )}
    >
      <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
        {title}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-7 text-[color:var(--muted)]">
        {message}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "self-start rounded-[2rem] border border-[color:var(--line)] bg-white/82 p-5 shadow-[0_18px_70px_rgba(16,32,20,0.04)] sm:p-6",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-[color:var(--ink)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm leading-7 text-[color:var(--muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className={cn(description ? "mt-5" : "mt-4")}>{children}</div>
    </div>
  );
}

export function DarkCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "self-start rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(27,28,27,0.98),rgba(10,11,10,0.98))] p-5 text-white shadow-[0_24px_90px_rgba(5,12,8,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.05em]">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 text-sm leading-7 text-white/70">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className={cn(description ? "mt-5" : "mt-4")}>{children}</div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "brand" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-[1.6rem] border p-4",
        tone === "brand"
          ? "border-[#0c4a27]/10 bg-[#0c4a27] text-[#d9f6bc]"
          : "border-[color:var(--line)] bg-white/82 text-[color:var(--ink)]"
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.16em]",
          tone === "brand" ? "text-[#d9f6bc]/76" : "text-[color:var(--muted)]"
        )}
      >
        {label}
      </p>
      <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em]">
        {value}
      </p>
      <p
        className={cn(
          "mt-2 text-sm leading-6",
          tone === "brand" ? "text-[#d9f6bc]/78" : "text-[color:var(--muted)]"
        )}
      >
        {note}
      </p>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        tone === "brand"
          ? "bg-[#0c4a27] text-[#d9f6bc]"
          : tone === "warning"
            ? "bg-[#fff1dc] text-[#8a4b0f]"
            : tone === "danger"
              ? "bg-[#fff0ef] text-[#a8382b]"
              : "border border-[color:var(--line)] bg-[#f8faf7] text-[color:var(--brand)]"
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  tone = "neutral",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?:
  | "neutral"
  | "brand"
  | "danger"
  | "darkNeutral"
  | "darkBrand"
  | "darkDanger";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold tracking-[-0.02em] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        tone === "brand"
          ? "border-[#0c4a27] bg-[#0c4a27] text-[#d9f6bc]"
          : tone === "danger"
            ? "border-[#dcb7b0] bg-[#fff7f6] text-[#922f25]"
            : tone === "darkBrand"
              ? "border-[#d9f6bc]/18 bg-[#d9f6bc] text-[#0c4a27] shadow-[0_12px_30px_rgba(217,246,188,0.16)] hover:bg-[#cfe8b0]"
              : tone === "darkDanger"
                ? "border-[#603029] bg-[#2d1613] text-[#ffb6aa] hover:bg-[#3a1d18]"
                : tone === "darkNeutral"
                  ? "border-white/12 bg-white/6 text-white hover:bg-white/10"
                  : "border-[color:var(--line)] bg-white text-[color:var(--ink)]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </p>
      <div className="mt-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
        {value}
      </div>
    </div>
  );
}

export function DarkField({
  label,
  value,
  href,
}: {
  label: string;
  value: ReactNode;
  href?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.04))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/46">
        {label}
      </p>
      <div
        className="mt-2 text-sm font-semibold tracking-[-0.02em] text-white truncate"
        title={typeof value === 'string' ? value : undefined}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-[#d9f6bc]"
          >
            {value}
            <svg
              className="h-3 w-3 opacity-60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </a>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export function Table({
  columns,
  children,
  bodyClassName,
}: {
  columns: string[];
  children: ReactNode;
  bodyClassName?: string;
}) {
  const columnClass =
    columns.length === 3
      ? "md:grid-cols-3"
      : columns.length === 4
        ? "md:grid-cols-4"
        : columns.length === 5
          ? "md:grid-cols-5"
          : "md:grid-cols-2";

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "hidden gap-3 rounded-2xl border border-[color:var(--line)] bg-[#edf7eb] px-4 py-3 md:grid",
          columnClass
        )}
      >
        {columns.map((column) => (
          <p
            key={column}
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand)]"
          >
            {column}
          </p>
        ))}
      </div>
      <div
        className={cn(
          "max-h-[26rem] overflow-y-auto pr-1 md:max-h-[30rem] xl:max-h-[32rem]",
          bodyClassName
        )}
      >
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function TableRow({
  children,
  columns,
  selected,
}: {
  children: ReactNode;
  columns: 3 | 4 | 5;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-[1.25rem] border px-4 py-4 transition-colors",
        selected
          ? "border-[#0c4a27]/30 bg-[#f4f8f1] shadow-[0_4px_20px_rgba(12,74,39,0.04)]"
          : "border-[color:var(--line)] bg-white hover:border-[#0c4a27]/20 hover:bg-[#fafcfe]",
        columns === 3
          ? "md:grid-cols-3"
          : columns === 4
            ? "md:grid-cols-4"
            : "md:grid-cols-5"
      )}
    >
      {children}
    </div>
  );
}

export function PaginationControls({
  page,
  total,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        className="text-sm font-semibold text-[color:var(--ink)] disabled:opacity-40"
        disabled={page <= 1}
        onClick={onPrevious}
      >
        Previous
      </button>
      <p className="text-sm text-[color:var(--muted)]">
        Page {page} of {totalPages} · {total} total
      </p>
      <button
        type="button"
        className="text-sm font-semibold text-[color:var(--ink)] disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#0c4a27]",
        className
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)] outline-none transition-colors focus:border-[#0c4a27]",
        className
      )}
    >
      {children}
    </select>
  );
}
