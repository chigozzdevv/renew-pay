"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { useEffect } from "react";

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

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[28rem] items-center justify-center rounded-[2rem] border border-[color:var(--line)] bg-white p-8",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="inline-flex h-14 w-14 animate-spin items-center justify-center rounded-full border border-[color:var(--line)] bg-[#f8f8fb] text-[color:var(--ink)]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none">
            <path
              d="M12 3.5V6.1M12 17.9V20.5M20.5 12H17.9M6.1 12H3.5M18.01 5.99L16.17 7.83M7.83 16.17L5.99 18.01M18.01 18.01L16.17 16.17M7.83 7.83L5.99 5.99"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
        <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--muted)]">
          {label}
        </p>
      </div>
    </div>
  );
}

export function InlineLoading({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-sm text-[color:var(--muted)]", className)}>
      <span className="inline-flex h-5 w-5 animate-spin items-center justify-center rounded-full border border-[color:var(--line)] bg-[#f8f8fb] text-[color:var(--ink)]">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
          <path
            d="M12 3.5V6.1M12 17.9V20.5M20.5 12H17.9M6.1 12H3.5M18.01 5.99L16.17 7.83M7.83 16.17L5.99 18.01M18.01 18.01L16.17 16.17M7.83 7.83L5.99 5.99"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
      <span className="font-medium tracking-[-0.02em]">{label}</span>
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
        "self-start rounded-[2rem] border border-[color:var(--line)] bg-white p-5 shadow-[0_18px_70px_rgba(16,32,20,0.04)] sm:p-6",
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
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div
      className="rounded-[1.6rem] border border-[color:var(--line)] bg-white p-4 text-[color:var(--ink)]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em]">
        {value}
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
              : "border border-[color:var(--line)] bg-[#f5f4ef] text-[color:var(--brand)]"
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
          ? "border-[#111111] bg-[#111111] text-white hover:bg-[#333333]"
          : tone === "danger"
            ? "border-[#dcb7b0] bg-[#fff7f6] text-[#922f25]"
            : tone === "darkBrand"
              ? "border-white/12 bg-white text-[#111111] shadow-[0_12px_30px_rgba(255,255,255,0.08)] hover:bg-[#f2f1eb]"
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
      <div
        className="mt-2 min-w-0 break-all text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)] [overflow-wrap:anywhere]"
        title={typeof value === "string" ? value : undefined}
      >
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
            className="inline-flex items-center gap-1 transition-colors hover:text-white/80"
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
          "hidden gap-3 rounded-2xl border border-[color:var(--line)] bg-[#f8f8fb] px-4 py-3 md:grid",
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
          ? "border-black/10 bg-[#f8f8fb] shadow-[0_4px_20px_rgba(17,17,17,0.04)]"
          : "border-[color:var(--line)] bg-white hover:border-black/10 hover:bg-[#fafafd]",
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
        "h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#111111]",
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
        "h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)] outline-none transition-colors focus:border-[#111111]",
        className
      )}
    >
      {children}
    </select>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const widthClass =
    size === "sm"
      ? "w-[min(100%,420px)]"
      : size === "lg"
        ? "w-[min(100%,680px)]"
        : size === "xl"
          ? "w-[min(100%,860px)]"
          : "w-[min(100%,540px)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#0a0b0a]/40 backdrop-blur-sm"
      />
      <div
        className={cn(
          "relative flex max-h-[min(92vh,780px)] flex-col rounded-[2rem] border border-[color:var(--line)] bg-white shadow-[0_40px_120px_rgba(0,0,0,0.12)]",
          widthClass,
        )}
      >
        <div className="shrink-0 border-b border-[color:var(--line)] px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-[-0.04em] text-[color:var(--ink)]">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-[color:var(--muted)]">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] transition-colors hover:bg-black/4 hover:text-[color:var(--ink)]"
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[color:var(--line)] px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
