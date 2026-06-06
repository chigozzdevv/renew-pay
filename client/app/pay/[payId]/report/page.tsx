"use client";

import Link from "next/link";
import { Check, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  loadPublicPayment,
  submitPaymentIssue,
  uploadPaymentIssueFile,
  type PublicPayment,
  type PublicPaymentIssueFile,
} from "@/lib/public-payments";

const issueTypes = [
  { value: "paid_not_confirmed", label: "Paid but not confirmed" },
  { value: "wrong_amount", label: "Wrong amount" },
  { value: "duplicate_payment", label: "Duplicate payment" },
  { value: "refund_request", label: "Refund request" },
  { value: "other", label: "Other" },
];

function formatAmount(value: number, currency: string) {
  const locale =
    {
      GHS: "en-GH",
      KES: "en-KE",
      NGN: "en-NG",
    }[currency] ?? "en";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function MerchantLogo({ payment }: { payment: PublicPayment }) {
  if (payment.merchant.logoUrl) {
    return (
      <img
        src={payment.merchant.logoUrl}
        alt={payment.merchant.name}
        className="h-10 w-10 rounded-2xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#272b25] text-sm font-semibold text-white">
      {payment.merchant.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function PaymentReportPage() {
  const params = useParams<{ payId: string }>();
  const payId = typeof params?.payId === "string" ? params.payId : "";
  const [payment, setPayment] = useState<PublicPayment | null>(null);
  const [issueType, setIssueType] = useState(issueTypes[0].value);
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(payment && details.trim().length >= 8 && !isSubmitting),
    [details, isSubmitting, payment]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const nextPayment = await loadPublicPayment(payId);

        if (!cancelled) {
          setPayment(nextPayment);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!payment || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const uploadedFiles: PublicPaymentIssueFile[] = [];

      for (const file of files.slice(0, 4)) {
        uploadedFiles.push(await uploadPaymentIssueFile({ payId, file }));
      }

      await submitPaymentIssue({
        payId,
        issueType,
        details,
        reporterEmail: payment.customer.email,
        reporterName: payment.customer.name,
        files: uploadedFiles,
      });
      setIsSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send report.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f5f4ef] px-4 py-8 text-[#151713] sm:py-12">
      <section className="w-full max-w-[31rem] rounded-[1.75rem] border border-[#deded5] bg-white p-5 shadow-[0_18px_70px_rgba(20,27,20,0.08)] sm:p-7">
        {isLoading ? (
          <div className="py-16 text-center text-sm font-semibold text-[#6d746c]">
            Loading payment
          </div>
        ) : !payment ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-[#151713]">
              {error ?? "Payment unavailable."}
            </p>
          </div>
        ) : isSubmitted ? (
          <div className="py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#eef6ec] text-[#225c39]">
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </div>
            <p className="mt-5 text-lg font-semibold tracking-[-0.03em]">
              Report sent
            </p>
            <p className="mt-2 text-sm leading-6 text-[#6d746c]">
              We will email you with an update.
            </p>
            <Link
              href={`/pay/${payId}`}
              className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-[#272b25] px-5 text-sm font-semibold text-white"
            >
              Back to payment
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <MerchantLogo payment={payment} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {payment.merchant.name}
                  </p>
                  <p className="text-xs font-medium text-[#7a8076]">
                    Report payment
                  </p>
                </div>
              </div>
              <Link
                href={`/pay/${payId}`}
                className="text-xs font-semibold text-[#6d746c] hover:text-[#151713]"
              >
                Back
              </Link>
            </div>

            <div className="mt-8 text-center">
              <p className="text-[2.6rem] font-semibold leading-none tracking-[-0.06em] sm:text-[3.2rem]">
                {formatAmount(payment.amount, payment.currency)}
              </p>
              <p className="mt-2 text-sm font-medium text-[#6d746c]">
                {payment.description ?? payment.payId}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-semibold">Issue type</span>
                <select
                  value={issueType}
                  onChange={(event) => setIssueType(event.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-[#dcdee8] bg-white px-3.5 text-sm font-semibold outline-none focus:border-[#272b25]"
                >
                  {issueTypes.map((issue) => (
                    <option key={issue.value} value={issue.value}>
                      {issue.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold">Details</span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={5}
                  placeholder="Tell us what happened"
                  className="mt-2 w-full resize-none rounded-xl border border-[#dcdee8] bg-white px-3.5 py-3 text-sm font-medium leading-6 outline-none placeholder:text-[#8b9188] focus:border-[#272b25]"
                />
              </label>

              <div>
                <span className="text-sm font-semibold">Files</span>
                <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#cfd3ca] px-4 py-3 text-sm font-semibold text-[#4d564e] transition-colors hover:border-[#272b25] hover:text-[#151713]">
                  <Upload className="h-4 w-4" strokeWidth={2.2} />
                  Add files
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(event) =>
                      setFiles(Array.from(event.target.files ?? []).slice(0, 4))
                    }
                  />
                </label>
                {files.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {files.map((file) => (
                      <p
                        key={`${file.name}-${file.size}`}
                        className="truncate text-xs font-medium text-[#6d746c]"
                      >
                        {file.name}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-xl border border-[#ecd0cc] bg-[#fff6f5] px-4 py-3 text-sm font-medium text-[#9b3d31]">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="h-12 w-full rounded-xl bg-[#272b25] text-sm font-semibold text-white transition-colors hover:bg-[#343930] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSubmitting ? "Sending" : "Send report"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
