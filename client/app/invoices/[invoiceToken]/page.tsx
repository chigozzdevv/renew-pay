"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  completePublicInvoiceTestPayment,
  loadPublicInvoice,
  startPublicInvoicePayment,
  submitPublicInvoiceVerification,
  type PublicInvoiceRecord,
} from "@/lib/invoices";

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

export default function PublicInvoicePage() {
  const params = useParams<{ invoiceToken: string }>();
  const invoiceToken =
    typeof params?.invoiceToken === "string" ? params.invoiceToken : "";
  const [invoice, setInvoice] = useState<PublicInvoiceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationDraft, setVerificationDraft] = useState({
    phoneNumber: "",
    dateOfBirth: "",
    bvn: "",
    stateOfOrigin: "",
    stateOfResidence: "",
    lgaOfOrigin: "",
    lgaOfResidence: "",
    addressLine1: "",
    addressLine2: "",
    addressLine3: "",
    middleName: "",
    country: "NG",
  });

  async function refreshInvoice() {
    if (!invoiceToken) {
      return;
    }

    setIsLoading(true);

    try {
      const payload = await loadPublicInvoice(invoiceToken);
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
  }, [invoiceToken]);

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
    runner: () => Promise<PublicInvoiceRecord>,
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
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-black/6 bg-white px-6 py-10 shadow-[0_24px_90px_rgba(16,32,20,0.08)]">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[#1b1f1c]">
            Loading invoice
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[#5c655d]">
            Fetching invoice details and payment instructions.
          </p>
        </div>
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-[#d6b2ad] bg-[#fff6f5] px-6 py-10">
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[#1b1f1c]">
            Invoice unavailable
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[#6d4d47]">
            {errorMessage ?? "This invoice could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => void refreshInvoice()}
            className="mt-6 rounded-2xl bg-[#1b1f1c] px-5 py-3 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(217,246,188,0.35),transparent_42%),linear-gradient(180deg,#f4f7fb,#eef3f5)] px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-2xl border border-black/8 bg-white/88 px-4 py-3 text-sm font-semibold text-[#1b1f1c]"
          >
            Renew
          </Link>
          <button
            type="button"
            onClick={() => void refreshInvoice()}
            className="rounded-2xl border border-black/8 bg-white/88 px-4 py-3 text-sm font-semibold text-[#1b1f1c]"
          >
            Refresh
          </button>
        </div>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-black/6 bg-white px-6 py-6 shadow-[0_24px_90px_rgba(16,32,20,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5b665f]">
              Invoice {invoice.invoiceNumber}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#171b18]">
              {invoice.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#58635d]">
              Pay this invoice in local fiat. Renew handles verification, collection, and settlement.
            </p>

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

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(27,28,27,0.98),rgba(10,11,10,0.98))] px-6 py-6 text-white shadow-[0_24px_90px_rgba(5,12,8,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
              Payment
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
              {invoice.nextAction === "complete_verification"
                ? "Verify once"
                : invoice.nextAction === "create_payment"
                  ? "Generate instructions"
                  : invoice.nextAction === "show_payment_instructions" ||
                      invoice.nextAction === "complete_test_payment"
                    ? "Send payment"
                    : invoice.nextAction === "wait_for_settlement"
                      ? "Settlement in progress"
                      : invoice.status === "paid"
                        ? "Invoice paid"
                        : "Invoice state"}
            </h2>

            <div className="mt-4 space-y-3 text-sm leading-7 text-white/74">
              {message ? <p className="text-[#d9f6bc]">{message}</p> : null}
              {errorMessage ? <p className="text-[#ffb6aa]">{errorMessage}</p> : null}
              {invoice.verification?.instructions ? <p>{invoice.verification.instructions}</p> : null}
              {paymentReference ? (
                <p>
                  Reference: <span className="font-semibold text-white">{paymentReference}</span>
                </p>
              ) : null}
            </div>

            {invoice.nextAction === "complete_verification" ? (
              <div className="mt-5 space-y-3">
                <input
                  className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                  placeholder="Phone number"
                  value={verificationDraft.phoneNumber}
                  onChange={(event) =>
                    setVerificationDraft((current) => ({
                      ...current,
                      phoneNumber: event.target.value,
                    }))
                  }
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Date of birth (YYYY-MM-DD)"
                    value={verificationDraft.dateOfBirth}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        dateOfBirth: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="BVN"
                    value={verificationDraft.bvn}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        bvn: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="State of origin"
                    value={verificationDraft.stateOfOrigin}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        stateOfOrigin: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="LGA of origin"
                    value={verificationDraft.lgaOfOrigin}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        lgaOfOrigin: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="State of residence"
                    value={verificationDraft.stateOfResidence}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        stateOfResidence: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="LGA of residence"
                    value={verificationDraft.lgaOfResidence}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        lgaOfResidence: event.target.value,
                      }))
                    }
                  />
                </div>
                <input
                  className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                  placeholder="Address line 1"
                  value={verificationDraft.addressLine1}
                  onChange={(event) =>
                    setVerificationDraft((current) => ({
                      ...current,
                      addressLine1: event.target.value,
                    }))
                  }
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Address line 2 (optional)"
                    value={verificationDraft.addressLine2}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        addressLine2: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Middle name (optional)"
                    value={verificationDraft.middleName}
                    onChange={(event) =>
                      setVerificationDraft((current) => ({
                        ...current,
                        middleName: event.target.value,
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  disabled={isBusy === "verify"}
                  onClick={() =>
                    void runAction(
                      "verify",
                      () =>
                        submitPublicInvoiceVerification({
                          invoiceToken,
                          payload: verificationDraft,
                        }),
                      "Verification completed. Payment instructions are ready."
                    )
                  }
                  className="mt-2 inline-flex items-center justify-center rounded-2xl border border-[#d9f6bc]/18 bg-[#d9f6bc] px-5 py-3 text-sm font-semibold text-[#0c4a27]"
                >
                  {isBusy === "verify" ? "Verifying..." : "Verify and continue"}
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
                    () => startPublicInvoicePayment(invoiceToken),
                    "Payment instructions are ready."
                  )
                }
                className="mt-5 inline-flex items-center justify-center rounded-2xl border border-[#d9f6bc]/18 bg-[#d9f6bc] px-5 py-3 text-sm font-semibold text-[#0c4a27]"
              >
                {isBusy === "create-payment" ? "Preparing..." : "Get payment instructions"}
              </button>
            ) : null}

            {(invoice.nextAction === "show_payment_instructions" ||
              invoice.nextAction === "complete_test_payment" ||
              invoice.nextAction === "wait_for_settlement" ||
              invoice.status === "paid") && (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/46">
                    Bank transfer details
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-white/76">
                    <p>
                      Bank:{" "}
                      <span className="font-semibold text-white">
                        {invoice.paymentInstructions?.bankTransfer?.bankName ?? "Pending"}
                      </span>
                    </p>
                    <p>
                      Account name:{" "}
                      <span className="font-semibold text-white">
                        {invoice.paymentInstructions?.bankTransfer?.accountName ?? "Pending"}
                      </span>
                    </p>
                    <p>
                      Account number:{" "}
                      <span className="font-semibold text-white">
                        {invoice.paymentInstructions?.bankTransfer?.accountNumber ?? "Pending"}
                      </span>
                    </p>
                    <p>
                      Amount:{" "}
                      <span className="font-semibold text-white">
                        {formatCurrencyAmount(
                          invoice.paymentInstructions?.billingCurrency ?? invoice.billingCurrency,
                          invoice.paymentInstructions?.localAmount ?? invoice.totals.localAmount
                        )}
                      </span>
                    </p>
                  </div>
                </div>

                {invoice.charge?.failureCode ? (
                  <div className="rounded-2xl border border-[#603029] bg-[#2d1613] px-4 py-4 text-sm leading-7 text-[#ffb6aa]">
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
                        () => completePublicInvoiceTestPayment(invoiceToken),
                        "Sandbox payment completed."
                      )
                    }
                    className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/6 px-5 py-3 text-sm font-semibold text-white"
                  >
                    {isBusy === "complete-test-payment"
                      ? "Completing..."
                      : "Complete sandbox payment"}
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
