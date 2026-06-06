"use client";

import Link from "next/link";
import { Check, Copy, Info } from "lucide-react";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Logo } from "@/components/shared/logo";
import {
  confirmPublicCheckoutOtp,
  confirmPublicCheckoutPhone,
  loadPublicPaymentBanks,
  loadPublicPayment,
  selectPublicCheckoutKycMethod,
  startPublicCheckoutKyc,
  startPublicPayment,
  submitPublicCheckoutCustomer,
  type PublicCheckoutBank,
  type PublicPayment,
} from "@/lib/public-payments";

function formatAmount(value: number, currency: string) {
  const locale =
    {
      GHS: "en-GH",
      KES: "en-KE",
      NGN: "en-NG",
    }[currency] ?? "en";

  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);
  const symbol = parts.find((part) => part.type === "currency")?.value ?? currency;
  const amount = parts
    .filter((part) => part.type !== "currency")
    .map((part) => part.value)
    .join("")
    .replace(/\s+/g, "")
    .trim();

  return { symbol, amount };
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function formatRecurringFrequency(payment: PublicPayment) {
  if (!payment.recurring.enabled || !payment.recurring.interval) {
    return null;
  }

  const count = payment.recurring.intervalCount ?? 1;
  const unit =
    count === 1
      ? payment.recurring.interval
      : `${payment.recurring.interval}s`;

  return count === 1 ? `/ ${unit}` : `/ ${count} ${unit}`;
}

function formatMethodLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function methodNeedsBankDetails(value: string) {
  return value.toLowerCase().includes("bank");
}

function MerchantLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-2xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#272b25] text-sm font-semibold text-white">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M7.5 10V8a4.5 4.5 0 0 1 9 0v2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M6.75 10h10.5A1.75 1.75 0 0 1 19 11.75v6.5A1.75 1.75 0 0 1 17.25 20H6.75A1.75 1.75 0 0 1 5 18.25v-6.5A1.75 1.75 0 0 1 6.75 10Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PoweredByRenew() {
  return (
    <Link
      href="/"
      aria-label="Powered by Renew"
      className="mx-auto flex w-fit items-center gap-1.5 text-[0.68rem] font-medium text-[#7a7f73]"
    >
      <span>Powered by</span>
      <Logo size="micro" />
    </Link>
  );
}

function OrderItems({
  currency,
  items,
}: {
  currency: string;
  items: PublicPayment["items"];
}) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, 3);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className="mx-auto mt-4 w-full max-w-[19rem] text-left">
      <div className="space-y-1.5">
        {visibleItems.map((item, index) => {
          const formatted = formatAmount(item.amount, currency);

          return (
            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#151713]">{item.name}</p>
                {item.quantity > 1 ? (
                  <p className="mt-0.5 text-[0.68rem] font-medium text-[#7a7f73]">
                    Qty {item.quantity}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-xs font-semibold text-[#151713]">
                <span className="text-[#9a9f96]">{formatted.symbol}</span>
                {formatted.amount}
              </p>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 ? (
        <p className="mt-1.5 text-[0.68rem] font-medium text-[#7a7f73]">
          +{hiddenCount} more item{hiddenCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

function OrderSummary({
  currency,
  description,
  items,
}: {
  currency: string;
  description: string | null;
  items: PublicPayment["items"];
}) {
  if (items.length > 0) {
    return <OrderItems currency={currency} items={items} />;
  }

  if (!description) {
    return null;
  }

  return (
    <p className="mx-auto mt-4 max-w-[18rem] text-sm leading-6 text-[#66706a]">
      {description}
    </p>
  );
}

function CheckoutProgress({ activeIndex }: { activeIndex: number | null }) {
  if (activeIndex === null) {
    return null;
  }

  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;
        const isConnectorComplete = index < activeIndex;

        return (
          <div key={index} className="flex items-center">
            <span
              className={
                "flex h-[1.15rem] w-[1.15rem] items-center justify-center rounded-full text-[0.58rem] font-semibold transition-colors " +
                (isComplete
                  ? "bg-[#272b25] text-white"
                  : isActive
                    ? "border-2 border-[#272b25] text-[#272b25]"
                    : "border border-[#dcdee8] text-[#8a9088]")
              }
            >
              {isComplete ? (
                <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5">
                  <path
                    d="M3.5 8.5 6.5 11.5 12.5 4.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            {index < 3 ? (
              <span
                className={
                  "mx-px h-px w-1 rounded-full transition-colors " +
                  (isConnectorComplete ? "bg-[#272b25]" : "bg-[#dcdee8]")
                }
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FieldRow({
  label,
  value,
  copyable = false,
  copied = false,
  onCopy,
}: {
  label: string;
  value: string | null;
  copyable?: boolean;
  copied?: boolean;
  onCopy?: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dcdee8] px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[0.68rem] font-semibold uppercase tracking-normal text-[#8a9088]">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-semibold text-[#151713]">
          {value || "-"}
        </p>
      </div>
      {copyable && value ? (
        <button
          type="button"
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
          onClick={() => onCopy?.(value)}
          className="grid h-8 w-8 shrink-0 place-items-center text-[#151713] transition-transform active:scale-95"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#225c39]" strokeWidth={2.4} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2.2} />
          )}
        </button>
      ) : null}
    </div>
  );
}

function SuccessCheckmark() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <style>{`
        @keyframes renew-success-scale {
          0% { transform: scale(0.82); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes renew-success-stroke {
          100% { stroke-dashoffset: 0; }
        }

        .renew-success-mark {
          animation: renew-success-scale 180ms ease-out both;
        }

        .renew-success-circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: renew-success-stroke 520ms cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }

        .renew-success-check {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: renew-success-stroke 360ms cubic-bezier(0.65, 0, 0.45, 1) 420ms forwards;
        }
      `}</style>
      <svg
        aria-hidden="true"
        className="renew-success-mark h-20 w-20"
        fill="none"
        viewBox="0 0 64 64"
      >
        <circle
          className="renew-success-circle"
          cx="32"
          cy="32"
          r="25"
          stroke="#272b25"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <path
          className="renew-success-check"
          d="M20.5 33.5 28 41l16-18"
          stroke="#272b25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </svg>
      <p className="mt-5 text-base font-semibold text-[#151713]">Payment successful</p>
    </div>
  );
}

export default function PayPage() {
  const params = useParams<{ payId: string }>();
  const payId = typeof params?.payId === "string" ? params.payId : "";
  const checkoutContentRef = useRef<HTMLElement | null>(null);
  const [payment, setPayment] = useState<PublicPayment | null>(null);
  const [payerEmail, setPayerEmail] = useState("");
  const [payerName, setPayerName] = useState("");
  const [bvn, setBvn] = useState("");
  const [kesMobileNetwork, setKesMobileNetwork] = useState("");
  const [kesShortcode, setKesShortcode] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [banks, setBanks] = useState<PublicCheckoutBank[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  const [bankOptionsError, setBankOptionsError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [copiedBankField, setCopiedBankField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkoutState = payment?.checkout.state ?? "needs_customer";
  const isFinal =
    checkoutState === "paid" ||
    checkoutState === "failed" ||
    checkoutState === "cancelled";
  const verificationMethods = payment?.checkout.verification.methods ?? [];
  const selectedMethodNeedsBank = methodNeedsBankDetails(verificationMethod);
  const formattedAmount = payment ? formatAmount(payment.amount, payment.currency) : null;

  const canSubmit = useMemo(() => {
    if (isSubmitting || !payment || isFinal) {
      return false;
    }

    if (checkoutState === "needs_customer") {
      return payerEmail.trim().includes("@") && payerName.trim().length >= 2;
    }

    if (checkoutState === "needs_bvn") {
      return bvn.replace(/\D+/g, "").length === 11;
    }

    if (checkoutState === "needs_verification_method") {
      if (!verificationMethod) {
        return false;
      }

      return selectedMethodNeedsBank
        ? accountNumber.trim().length >= 5 && bankCode.trim().length >= 2
        : true;
    }

    if (checkoutState === "needs_phone") {
      return phone.trim().length >= 6;
    }

    if (checkoutState === "needs_otp") {
      return otp.trim().length >= 3;
    }

    return checkoutState === "ready_to_pay";
  }, [
    accountNumber,
    bankCode,
    bvn,
    checkoutState,
    isFinal,
    isSubmitting,
    otp,
    payerEmail,
    payerName,
    payment,
    phone,
    selectedMethodNeedsBank,
    verificationMethod,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const nextPayment = await loadPublicPayment(payId);

        if (!cancelled) {
          setPayment(nextPayment);
          setPayerEmail(nextPayment.customer.email ?? "");
          setPayerName(nextPayment.customer.name ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Payment unavailable.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [payId]);

  useEffect(() => {
    const sandbox = payment?.checkout.verification.sandbox;

    if (payment?.checkout.state === "needs_phone" && sandbox?.phone) {
      setPhone((current) => current || sandbox.phone || "");
    }

    if (payment?.checkout.state === "needs_otp" && sandbox?.otp) {
      setOtp((current) => current || sandbox.otp || "");
    }
  }, [payment]);

  useEffect(() => {
    if (!payment) {
      return;
    }

    const selected =
      payment.checkout.verification.selectedMethod ??
      payment.checkout.verification.methods[0]?.method ??
      "";

    if (!verificationMethod && selected) {
      setVerificationMethod(selected);
    }
  }, [payment, verificationMethod]);

  useEffect(() => {
    if (!payId || !selectedMethodNeedsBank) {
      setBanks([]);
      setBankCode("");
      setBankOptionsError(null);
      return;
    }

    let cancelled = false;

    async function loadBanks() {
      setIsLoadingBanks(true);
      setBankOptionsError(null);

      try {
        const nextBanks = await loadPublicPaymentBanks(payId);

        if (cancelled) {
          return;
        }

        setBanks(nextBanks);
        setBankCode((current) =>
          current && nextBanks.some((bank) => bank.code === current) ? current : ""
        );
      } catch {
        if (!cancelled) {
          setBanks([]);
          setBankOptionsError("Could not load banks.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingBanks(false);
        }
      }
    }

    void loadBanks();

    return () => {
      cancelled = true;
    };
  }, [payId, selectedMethodNeedsBank]);

  useEffect(() => {
    if (checkoutState !== "paid") {
      return;
    }

    const timer = window.setTimeout(() => {
      if (window.parent !== window) {
        window.parent.postMessage(
          {
            source: "renew.checkout",
            type: "success",
            payId,
          },
          "*"
        );
        return;
      }

      if (payment?.checkout.returnPage) {
        const returnUrl = new URL(payment.checkout.returnPage);
        returnUrl.searchParams.set("collection", payId);
        returnUrl.searchParams.set("status", "paid");
        window.location.href = returnUrl.toString();
      }
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [checkoutState, payId, payment?.checkout.returnPage]);

  useEffect(() => {
    if (!copiedBankField) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedBankField(null), 1200);

    return () => window.clearTimeout(timeout);
  }, [copiedBankField]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) {
      return;
    }

    const target = checkoutContentRef.current;

    if (!target) {
      return;
    }

    const publishHeight = () => {
      const height = Math.ceil(target.getBoundingClientRect().height);

      window.parent.postMessage(
        {
          source: "renew.checkout",
          type: "resize",
          height,
        },
        "*"
      );
    };

    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(target);

    const frame = window.requestAnimationFrame(publishHeight);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [checkoutState, error, isLoading, payment]);

  async function refreshPayment() {
    if (!payId) {
      return null;
    }

    setError(null);
    const nextPayment = await loadPublicPayment(payId);
    setPayment(nextPayment);

    return nextPayment;
  }

  async function handlePaymentConfirmation() {
    setIsConfirmingPayment(true);
    setError(null);

    try {
      const nextPayment = await refreshPayment();

      if (nextPayment && nextPayment.checkout.state !== "paid") {
        setError("Waiting for confirmation.");
      }
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : "Could not check payment status."
      );
    } finally {
      setIsConfirmingPayment(false);
    }
  }

  async function handleCopyBankDetail(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedBankField(field);
    } catch {
      setError("Could not copy the account detail.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || !payId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const nextPayment =
        checkoutState === "needs_customer"
          ? await submitPublicCheckoutCustomer({
              payId,
              email: payerEmail.trim(),
              name: payerName.trim(),
            })
          : checkoutState === "needs_bvn"
            ? await startPublicCheckoutKyc({
                payId,
                bvn: bvn.replace(/\D+/g, ""),
                kesMobileNetwork: kesMobileNetwork.trim() || undefined,
                kesShortcode: kesShortcode.trim() || undefined,
              })
            : checkoutState === "needs_verification_method"
              ? await selectPublicCheckoutKycMethod({
                  payId,
                  verificationMethod,
                  accountNumber: accountNumber.trim() || undefined,
                  bankCode: bankCode.trim() || undefined,
                })
              : checkoutState === "needs_phone"
                ? await confirmPublicCheckoutPhone({
                    payId,
                    phone: phone.trim(),
                  })
                : checkoutState === "needs_otp"
                  ? await confirmPublicCheckoutOtp({
                      payId,
                      otp: otp.trim(),
                    })
                  : await startPublicPayment({
                      payId,
                      payerEmail: payerEmail.trim() || undefined,
                      payerName: payerName.trim() || undefined,
                    });

      setPayment(nextPayment);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Checkout could not continue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const recurringFrequency = useMemo(
    () => (payment ? formatRecurringFrequency(payment) : null),
    [payment]
  );

  function checkoutStepIndex() {
    if (checkoutState === "needs_bvn" || checkoutState === "needs_verification_method") {
      return 0;
    }

    if (checkoutState === "needs_phone") {
      return 1;
    }

    if (checkoutState === "needs_otp") {
      return 2;
    }

    if (checkoutState === "show_bank_transfer" || checkoutState === "processing") {
      return 3;
    }

    return null;
  }

  function actionLabel() {
    if (isSubmitting) {
      return "Please wait";
    }

    if (checkoutState === "ready_to_pay" || checkoutState === "needs_customer") {
      return "Pay";
    }

    if (checkoutState === "needs_otp") {
      return "Verify";
    }

    if (checkoutState === "needs_bvn") {
      return "Verify and continue";
    }

    return "Continue";
  }

  function renderCheckoutBody() {
    if (!payment) {
      return null;
    }

    if (checkoutState === "paid") {
      return <SuccessCheckmark />;
    }

    if (checkoutState === "show_bank_transfer") {
      const bankTransfer = payment.checkout.bankTransfer;

      return (
        <div className="grid gap-5">
          <div className="space-y-3">
            <FieldRow label="Bank" value={bankTransfer?.bankName ?? null} />
            <FieldRow
              label="Account number"
              value={bankTransfer?.accountNumber ?? null}
              copyable
              copied={copiedBankField === "accountNumber"}
              onCopy={(value) => void handleCopyBankDetail("accountNumber", value)}
            />
            <FieldRow label="Account name" value={bankTransfer?.accountName ?? null} />
          </div>
          <div className="space-y-4">
            <button
              type="button"
              disabled={isConfirmingPayment}
              onClick={() => void handlePaymentConfirmation()}
              className="h-12 w-full rounded-xl border border-[#dcdee8] text-sm font-semibold text-[#151713] transition-colors hover:border-[#aeb4aa] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConfirmingPayment ? "Checking..." : "I've paid"}
            </button>
            <PoweredByRenew />
          </div>
        </div>
      );
    }

    if (checkoutState === "processing") {
      return (
        <div className="grid gap-5">
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => void refreshPayment()}
              className="h-12 w-full rounded-xl border border-[#dcdee8] text-sm font-semibold text-[#151713] transition-colors hover:border-[#aeb4aa]"
            >
              Waiting for payment
            </button>
            <PoweredByRenew />
          </div>
        </div>
      );
    }

    if (isFinal) {
      return (
        <div className="rounded-xl border border-[#dcdee8] px-4 py-3 text-center text-sm font-semibold capitalize text-[#151713]">
          {statusLabel(checkoutState)}
        </div>
      );
    }

    return (
      <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
        {checkoutState === "needs_customer" ? (
          <div className="space-y-5">
            <div className="text-left">
              <p className="text-sm font-semibold text-[#151713]">Your details</p>
              <p className="mt-1 text-xs leading-5 text-[#66706a]">
                Add the name and email for this payment.
              </p>
            </div>
            <input
              type="email"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
              placeholder="ada@example.com"
              className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
            />
            <input
              value={payerName}
              onChange={(event) => setPayerName(event.target.value)}
              placeholder="Ada Okafor"
              className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
            />
          </div>
        ) : null}

        {checkoutState === "needs_bvn" ? (
          <div className="space-y-5">
            <div className="text-left">
              <p className="text-sm font-semibold text-[#151713]">BVN</p>
            </div>
            <input
              aria-label="BVN"
              inputMode="numeric"
              value={bvn}
              onChange={(event) => setBvn(event.target.value)}
              placeholder="12345678901"
              className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
            />
            <p className="-mt-2 flex items-start gap-2 text-xs leading-5 text-[#66706a]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>
                We need this to verify your identity and create a payment account for you.
              </span>
            </p>
            {payment.currency === "KES" ? (
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={kesMobileNetwork}
                  onChange={(event) => setKesMobileNetwork(event.target.value)}
                  placeholder="Safaricom"
                  className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
                />
                <input
                  value={kesShortcode}
                  onChange={(event) => setKesShortcode(event.target.value)}
                  placeholder="123456"
                  className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {checkoutState === "needs_verification_method" ? (
          <div className="space-y-5">
            <div className="text-left">
              <p className="text-sm font-semibold text-[#151713]">Choose verification</p>
              <p className="mt-1 text-xs leading-5 text-[#66706a]">
                Select how you want to receive your verification code.
              </p>
            </div>
            <div className="space-y-2">
              {verificationMethods.map((method) => (
                <button
                  key={method.method}
                  type="button"
                  onClick={() => setVerificationMethod(method.method)}
                  className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    verificationMethod === method.method
                      ? "border-[#272b25]"
                      : "border-[#dcdee8] hover:border-[#aeb4aa]"
                  }`}
                >
                  <span className="block text-sm font-semibold text-[#151713]">
                    {formatMethodLabel(method.method)}
                  </span>
                  {method.hint ? (
                    <span className="mt-1 block text-xs font-medium text-[#747b72]">
                      {method.hint}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {selectedMethodNeedsBank ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    aria-label="Account number"
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={(event) => setAccountNumber(event.target.value)}
                    placeholder="1230042034"
                    className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
                  />
                  <select
                    aria-label="Bank"
                    value={bankCode}
                    disabled={isLoadingBanks || banks.length === 0}
                    onChange={(event) => setBankCode(event.target.value)}
                    className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium text-[#151713] outline-none transition-colors focus:border-[#8d9288] disabled:cursor-not-allowed disabled:text-[#8a9088]"
                  >
                    <option value="">
                      {isLoadingBanks
                        ? "Loading banks"
                        : banks.length > 0
                          ? "Select bank"
                          : "No banks"}
                    </option>
                    {banks.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>
                {bankOptionsError ? (
                  <p className="text-xs font-medium text-[#9a3a31]">{bankOptionsError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {checkoutState === "needs_phone" ? (
          <div className="space-y-5">
            <div className="text-left">
              <p className="text-sm font-semibold text-[#151713]">BVN verification</p>
              <p className="mt-1 text-xs leading-5 text-[#66706a]">
                Enter the phone number linked to your BVN.
              </p>
            </div>
            <input
              aria-label="Phone number"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="08030013843"
              className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
            />
          </div>
        ) : null}

        {checkoutState === "needs_otp" ? (
          <div className="space-y-5">
            <div className="text-left">
              <p className="text-sm font-semibold text-[#151713]">Verification code</p>
              <p className="mt-1 text-xs leading-5 text-[#66706a]">
                Enter the code sent by the payment provider.
              </p>
            </div>
            <input
              aria-label="OTP"
              inputMode="numeric"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="123456"
              className="h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-medium outline-none transition-colors focus:border-[#8d9288]"
            />
          </div>
        ) : null}

        <div className="space-y-4">
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-12 w-full rounded-xl bg-[#272b25] text-sm font-semibold text-white transition-colors hover:bg-[#343930] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center justify-center gap-2">
              {!isSubmitting ? <LockIcon /> : null}
              <span>{actionLabel()}</span>
            </span>
          </button>
          <PoweredByRenew />
        </div>
      </form>
    );
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-white text-[#111111]">
      <section ref={checkoutContentRef} className="flex w-full max-w-[30rem] flex-col">
        {isLoading ? (
          <div className="flex min-h-screen items-center justify-center text-sm font-medium text-[#66706a]">
            Loading
          </div>
        ) : error && !payment ? (
          <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-semibold text-[#111111]">Payment unavailable</p>
            <p className="mt-2 text-sm text-[#9a3a31]">{error}</p>
          </div>
        ) : payment ? (
          <>
            <div className="px-5 pt-4 sm:px-6">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <MerchantLogo logoUrl={payment.merchant.logoUrl} name={payment.merchant.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{payment.merchant.name}</p>
                    {payment.status !== "open" ? (
                      <p className="mt-0.5 text-xs font-medium capitalize text-[#66706a]">
                        {statusLabel(payment.status)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0">
                  <CheckoutProgress activeIndex={checkoutStepIndex()} />
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col px-5 pb-4 pt-6 sm:px-6">
              <div className="text-center">
                <p className="whitespace-nowrap font-display text-[2.65rem] font-medium leading-none tracking-normal text-[#151713] sm:text-[3rem]">
                  <span className="text-[#b7b7b7]">{formattedAmount?.symbol}</span>
                  <span>{formattedAmount?.amount}</span>
                  {recurringFrequency ? (
                    <span className="ml-2 align-baseline text-base font-medium text-[#7a7f73] sm:text-lg">
                      {recurringFrequency}
                    </span>
                  ) : null}
                </p>
                <OrderSummary
                  currency={payment.currency}
                  description={payment.description}
                  items={payment.items}
                />
              </div>

              <div className="mt-8 flex min-h-0 flex-1 flex-col">
                {renderCheckoutBody()}
                {error ? <p className="mt-3 text-sm text-[#9a3a31]">{error}</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
