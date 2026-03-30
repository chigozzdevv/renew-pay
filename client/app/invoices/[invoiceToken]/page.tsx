"use client";

import { createRenewInvoiceClient, type RenewPublicInvoiceRecord } from "@renew.sh/sdk/core";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function formatCurrencyAmount(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleString();
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong.";
}

function getActionTitle(invoice: RenewPublicInvoiceRecord) {
  if (invoice.nextAction === "wait_for_settlement") {
    return "Settlement in progress";
  }

  if (invoice.status === "paid") {
    return "Payment complete";
  }

  return "Make payment";
}

function getVerificationButtonLabel(invoice: RenewPublicInvoiceRecord, isBusy: boolean) {
  const requiredFields = invoice.verification?.requiredFields ?? [];

  if (isBusy) {
    if (requiredFields.includes("verificationMethod")) {
      return "Continuing...";
    }

    if (requiredFields.includes("phone")) {
      return "Confirming...";
    }

    if (requiredFields.includes("otp")) {
      return "Verifying...";
    }

    return "Submitting...";
  }

  if (requiredFields.includes("verificationMethod")) {
    return "Continue";
  }

  if (requiredFields.includes("phone")) {
    return "Continue";
  }

  if (requiredFields.includes("otp")) {
    return "Verify";
  }

  return "Get payment details";
}

export default function PublicInvoicePage() {
  const params = useParams<{ invoiceToken: string }>();
  const invoiceToken =
    typeof params?.invoiceToken === "string" ? params.invoiceToken : "";
  const invoiceClient = useMemo(
    () =>
      createRenewInvoiceClient({
        apiOrigin: process.env.NEXT_PUBLIC_API_BASE_URL,
      }),
    []
  );

  const [invoice, setInvoice] = useState<RenewPublicInvoiceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationDraft, setVerificationDraft] = useState({
    bvn: "",
    verificationMethod: "",
    phone: "",
    otp: "",
  });

  async function refreshInvoice() {
    if (!invoiceToken) {
      return;
    }

    setIsLoading(true);

    try {
      const payload = await invoiceClient.getInvoice(invoiceToken);
      setInvoice(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshInvoice();
  }, [invoiceClient, invoiceToken]);

  useEffect(() => {
    if (!message && !errorMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  const paymentReference = useMemo(
    () => invoice?.paymentInstructions?.reference ?? invoice?.charge?.externalChargeId ?? null,
    [invoice]
  );

  async function runAction(
    key: string,
    runner: () => Promise<RenewPublicInvoiceRecord>,
    successMessage?: string
  ) {
    setIsBusy(key);
    setMessage(null);
    setErrorMessage(null);

    try {
      const payload = await runner();
      setInvoice(payload);
      if (successMessage) {
        setMessage(successMessage);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(null);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#e8f5e9] px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-black/6 bg-white px-6 py-10 shadow-[0_24px_90px_rgba(16,32,20,0.08)]">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[#1b1f1c]">
            Loading invoice
          </h1>
        </div>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="min-h-screen bg-[#e8f5e9] px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-[#d6b2ad] bg-[#fff6f5] px-6 py-10">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[#1b1f1c]">
            Invoice unavailable
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#6d4d47]">
            {errorMessage ?? "This invoice could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => void refreshInvoice()}
            className="mt-6 rounded-2xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const requiredFields = invoice.verification?.requiredFields ?? [];
  const requiresVerificationMethod = requiredFields.includes("verificationMethod");
  const requiresPhone = requiredFields.includes("phone");
  const requiresOtp = requiredFields.includes("otp");
  const isVerificationActionDisabled =
    isBusy === "verify" ||
    (requiresVerificationMethod
      ? !verificationDraft.verificationMethod.trim()
      : requiresPhone
        ? !verificationDraft.phone.trim()
        : requiresOtp
          ? !verificationDraft.otp.trim()
          : !verificationDraft.bvn.trim());

  return (
    <main className="min-h-screen bg-[#e8f5e9] px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-black/8 bg-white/88 px-4 py-3 text-sm font-semibold text-[#1b1f1c]">
            {invoice.brand.logoUrl ? (
              <img
                src={invoice.brand.logoUrl}
                alt={invoice.brand.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-xs font-semibold text-white">
                {invoice.brand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span>{invoice.brand.name}</span>
          </div>

          <button
            type="button"
            onClick={() => void refreshInvoice()}
            className="rounded-2xl border border-black/8 bg-white/88 px-4 py-3 text-sm font-semibold text-[#1b1f1c]"
          >
            Refresh
          </button>
        </div>

        <section className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="rounded-[2rem] border border-black/6 bg-white px-6 py-6 shadow-[0_24px_90px_rgba(16,32,20,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b665f]">
              Invoice {invoice.invoiceNumber}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#171b18]">
              {invoice.title}
            </h1>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-black/6 bg-[#f7faf5] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#627066]">
                  Customer
                </p>
                <p className="mt-2 text-sm font-semibold text-[#171b18]">{invoice.customerName}</p>
                <p className="mt-1 text-sm text-[#58635d]">{invoice.customerEmail}</p>
              </div>
              <div className="rounded-2xl border border-black/6 bg-[#f7faf5] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#627066]">
                  Amount
                </p>
                <p className="mt-2 text-sm font-semibold text-[#171b18]">
                  {formatCurrencyAmount(invoice.billingCurrency, invoice.totals.localAmount)}
                </p>
                <p className="mt-1 text-sm text-[#58635d]">
                  {invoice.totals.usdcAmount.toFixed(2)} USDC settlement
                </p>
              </div>
              <div className="rounded-2xl border border-black/6 bg-[#f7faf5] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#627066]">
                  Due date
                </p>
                <p className="mt-2 text-sm font-semibold text-[#171b18]">
                  {formatDate(invoice.dueDate)}
                </p>
              </div>
              <div className="rounded-2xl border border-black/6 bg-[#f7faf5] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#627066]">
                  Status
                </p>
                <p className="mt-2 text-sm font-semibold capitalize text-[#171b18]">
                  {invoice.status.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            {invoice.note ? (
              <div className="mt-5 rounded-2xl border border-black/6 bg-[#f7faf5] px-4 py-4 text-sm leading-7 text-[#58635d]">
                {invoice.note}
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {invoice.lineItems.map((item, index) => (
                <div
                  key={`${invoice.invoiceNumber}-item-${index}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-black/6 bg-white px-4 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#171b18]">{item.description}</p>
                    <p className="mt-1 text-sm text-[#58635d]">
                      {item.quantity} × ${item.unitAmountUsd.toFixed(2)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#171b18]">
                    ${item.totalAmountUsd.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-black/6 bg-white px-6 py-6 text-center shadow-[0_24px_90px_rgba(16,32,20,0.08)]">
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-[#171b18]">
              {getActionTitle(invoice)}
            </h2>

            <div className="mt-4 space-y-3 text-sm leading-7 text-[#58635d]">
              {message ? <p className="text-[#0c4a27]">{message}</p> : null}
              {errorMessage ? <p className="text-[#a74736]">{errorMessage}</p> : null}
              {paymentReference ? (
                <p>
                  Reference: <span className="font-semibold text-[#171b18]">{paymentReference}</span>
                </p>
              ) : null}
            </div>

            {invoice.nextAction === "complete_verification" ? (
              <div className="mt-5 space-y-3 text-left">
                {requiresVerificationMethod ? (
                  <div className="space-y-2">
                    {(invoice.verification?.verificationMethods ?? []).map((entry) => {
                      const isSelected = verificationDraft.verificationMethod === entry.method;

                      return (
                        <button
                          key={entry.method}
                          type="button"
                          onClick={() =>
                            setVerificationDraft((current) => ({
                              ...current,
                              verificationMethod: entry.method,
                            }))
                          }
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            isSelected
                              ? "border-[#0c4a27] bg-[#eef7eb] text-[#171b18]"
                              : "border-black/8 bg-[#f7faf5] text-[#171b18]"
                          }`}
                        >
                          <span className="block text-sm font-semibold capitalize">
                            {entry.method.replace(/_/g, " ")}
                          </span>
                          {entry.hint ? (
                            <span className="mt-1 block text-sm text-[#58635d]">{entry.hint}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-[#171b18]">
                      {requiresPhone
                        ? "Phone number"
                        : requiresOtp
                          ? "Verification code"
                          : "BVN"}
                    </span>
                    <input
                      className="w-full rounded-2xl border border-black/8 bg-[#f7faf5] px-4 py-3 text-sm text-[#171b18] outline-none"
                      placeholder={
                        requiresPhone
                          ? "Phone number"
                          : requiresOtp
                            ? "Verification code"
                            : "BVN"
                      }
                      value={
                        requiresPhone
                          ? verificationDraft.phone
                          : requiresOtp
                            ? verificationDraft.otp
                            : verificationDraft.bvn
                      }
                      onChange={(event) =>
                        setVerificationDraft((current) => ({
                          ...current,
                          ...(requiresPhone
                            ? { phone: event.target.value }
                            : requiresOtp
                              ? { otp: event.target.value }
                              : { bvn: event.target.value }),
                        }))
                      }
                    />
                  </label>
                )}

                <button
                  type="button"
                  disabled={isVerificationActionDisabled}
                  onClick={() =>
                    void runAction(
                      "verify",
                      () =>
                        invoiceClient.submitVerification(
                          invoiceToken,
                          requiresVerificationMethod
                            ? { verificationMethod: verificationDraft.verificationMethod }
                            : requiresPhone
                              ? { phone: verificationDraft.phone }
                              : requiresOtp
                                ? { otp: verificationDraft.otp }
                                : { bvn: verificationDraft.bvn }
                        ),
                      requiresOtp ? "Payment details are ready." : undefined
                    )
                  }
                  className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white"
                >
                  {getVerificationButtonLabel(invoice, isBusy === "verify")}
                </button>
              </div>
            ) : null}

            {invoice.nextAction === "create_payment" ? (
              <button
                type="button"
                disabled={isBusy === "create-payment"}
                onClick={() =>
                  void runAction(
                    "create-payment",
                    () => invoiceClient.startPayment(invoiceToken),
                    "Payment details are ready."
                  )
                }
                className="mt-5 inline-flex items-center justify-center rounded-2xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white"
              >
                {isBusy === "create-payment" ? "Preparing..." : "Make payment"}
              </button>
            ) : null}

            {(invoice.nextAction === "show_payment_instructions" ||
              invoice.nextAction === "complete_test_payment" ||
              invoice.nextAction === "wait_for_settlement" ||
              invoice.status === "paid") && (
              <div className="mt-5 space-y-3 text-left">
                <div className="rounded-2xl border border-black/6 bg-[#f7faf5] px-4 py-4">
                  <div className="space-y-2 text-sm text-[#58635d]">
                    <p>
                      Bank:{" "}
                      <span className="font-semibold text-[#171b18]">
                        {invoice.paymentInstructions?.bankTransfer?.bankName ?? "Pending"}
                      </span>
                    </p>
                    <p>
                      Account name:{" "}
                      <span className="font-semibold text-[#171b18]">
                        {invoice.paymentInstructions?.bankTransfer?.accountName ?? "Pending"}
                      </span>
                    </p>
                    <p>
                      Account number:{" "}
                      <span className="font-semibold text-[#171b18]">
                        {invoice.paymentInstructions?.bankTransfer?.accountNumber ?? "Pending"}
                      </span>
                    </p>
                    <p>
                      Amount:{" "}
                      <span className="font-semibold text-[#171b18]">
                        {formatCurrencyAmount(
                          invoice.paymentInstructions?.billingCurrency ?? invoice.billingCurrency,
                          invoice.paymentInstructions?.localAmount ?? invoice.totals.localAmount
                        )}
                      </span>
                    </p>
                  </div>
                </div>

                {invoice.charge?.failureCode ? (
                  <div className="rounded-2xl border border-[#e8c0b8] bg-[#fff5f2] px-4 py-4 text-sm leading-7 text-[#a74736]">
                    {invoice.charge.failureCode}
                  </div>
                ) : null}

                {invoice.testMode.canCompletePayment ? (
                  <button
                    type="button"
                    disabled={isBusy === "complete-test-payment"}
                    onClick={() =>
                      void runAction(
                        "complete-test-payment",
                        () => invoiceClient.completeTestPayment(invoiceToken),
                        "Payment completed."
                      )
                    }
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white"
                  >
                    {isBusy === "complete-test-payment" ? "Processing..." : "I have paid"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
