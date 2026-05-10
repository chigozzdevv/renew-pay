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
        "rounded-xl border p-5",
        tone === "danger"
          ? "border-[#cfa7a0] bg-[#fff7f6]"
          : "border-[color:var(--line)] bg-white/82"
      )}
    >
      <h2 className="font-display text-xl font-semibold text-[color:var(--ink)]">
        {title}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
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
        "flex min-h-[24rem] items-center justify-center rounded-xl border border-[color:var(--line)] bg-white p-8",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--soft)] text-[color:var(--ink)]">
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
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const hasHeader = Boolean(title || description || action);

  return (
    <div
      className={cn(
        "self-start rounded-xl border border-[color:var(--line)] bg-white p-4 shadow-[0_10px_36px_rgba(16,32,20,0.035)] sm:p-5",
        className
      )}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {title ? (
              <h2 className="font-display text-xl font-semibold text-[color:var(--ink)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1.5 text-sm leading-6 text-[color:var(--muted)]">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn(hasHeader && (description ? "mt-5" : "mt-4"))}>{children}</div>
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
        "self-start rounded-xl border border-white/10 bg-[#111111] p-4 text-white shadow-[0_20px_70px_rgba(5,12,8,0.2)] sm:p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">
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
    <div className="rounded-xl border border-[color:var(--line)] bg-white p-4 text-[color:var(--ink)]">
      <p className="text-xs font-medium text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold">
        {value}
      </p>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
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
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold capitalize",
        tone === "brand"
          ? "bg-[#e9f5ec] text-[#225c39]"
          : tone === "warning"
            ? "bg-[#fff6e7] text-[#76511a]"
            : tone === "danger"
              ? "bg-[#fff0ef] text-[#9a3a31]"
              : "border border-[color:var(--line)] bg-[color:var(--soft)] text-[color:var(--ink)]"
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
        "inline-flex items-center justify-center rounded-lg border px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
                  : "border-[color:var(--line)] bg-white text-[color:var(--ink)] hover:bg-[color:var(--soft)]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function RowActionButton({
  label,
  children,
  tone = "neutral",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "neutral" | "brand" | "danger";
}) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "brand"
          ? "border-[#111111] bg-[#111111] text-white hover:bg-[#333333]"
          : tone === "danger"
            ? "border-[#e0beb7] bg-[#fff8f7] text-[#922f25] hover:bg-[#ffefed]"
            : "border-[color:var(--line)] bg-white text-[color:var(--ink)] hover:bg-[color:var(--soft)]",
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
    <div className="rounded-lg border border-[color:var(--line)] bg-white px-4 py-3">
      <p className="text-xs font-medium text-[color:var(--muted)]">
        {label}
      </p>
      <div
        className="mt-2 min-w-0 break-all text-sm font-semibold text-[color:var(--ink)] [overflow-wrap:anywhere]"
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
    <div className="rounded-lg border border-white/10 bg-white/6 px-4 py-3">
      <p className="text-xs font-medium text-white/50">
        {label}
      </p>
      <div
        className="mt-2 truncate text-sm font-semibold text-white"
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
  gridClassName,
}: {
  columns: string[];
  children: ReactNode;
  bodyClassName?: string;
  gridClassName?: string;
}) {
  const columnClass =
    columns.length === 3
      ? "md:grid-cols-3"
      : columns.length === 4
        ? "md:grid-cols-4"
        : columns.length === 5
          ? "md:grid-cols-5"
          : columns.length === 6
            ? "md:grid-cols-6"
            : "md:grid-cols-2";

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "hidden gap-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--soft)] px-4 py-3 md:grid",
          gridClassName ?? columnClass
        )}
      >
        {columns.map((column) => (
          <p
            key={column}
            className="text-xs font-semibold text-[color:var(--muted)]"
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
  gridClassName,
}: {
  children: ReactNode;
  columns: 3 | 4 | 5 | 6;
  selected?: boolean;
  gridClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-lg border px-4 py-4 transition-colors",
        selected
          ? "border-black/10 bg-[color:var(--soft)] shadow-[0_4px_20px_rgba(17,17,17,0.04)]"
          : "border-[color:var(--line)] bg-white hover:border-black/10 hover:bg-[color:var(--soft)]",
        gridClassName ??
          (columns === 3
            ? "md:grid-cols-3"
            : columns === 4
              ? "md:grid-cols-4"
              : columns === 5
                ? "md:grid-cols-5"
                : "md:grid-cols-6")
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
        "h-10 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-sm font-medium text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#111111]",
        className
      )}
    />
  );
}

export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
}) {
  return (
    <div className={cn("relative", wrapperClassName ?? "w-full")}>
      <select
        {...props}
        className={cn(
          "h-10 w-full appearance-none rounded-lg border border-[color:var(--line)] bg-white px-3 pr-12 text-sm font-medium text-[color:var(--ink)] outline-none transition-colors focus:border-[#111111]",
          className
        )}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ink)]"
        fill="none"
      >
        <path
          d="M4 6L8 10L12 6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
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
          "relative flex max-h-[min(92vh,780px)] flex-col rounded-xl border border-[color:var(--line)] bg-white shadow-[0_40px_120px_rgba(0,0,0,0.12)]",
          widthClass,
        )}
      >
        <div className="shrink-0 border-b border-[color:var(--line)] px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-[color:var(--ink)]">
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
