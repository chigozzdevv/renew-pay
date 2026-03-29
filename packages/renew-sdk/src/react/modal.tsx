"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import type { RenewCheckoutClient } from "../clients/checkout-client.js";
import type {
  RenewCheckoutMarketQuote,
  RenewCheckoutSession,
  SubmitCheckoutCustomerInput,
} from "../types/checkout.js";
import {
  useRenewCheckoutSession,
  type UseRenewCheckoutSessionOptions,
} from "./use-session.js";

type FormState = {
  name: string;
  email: string;
  market: string;
};

type VerificationFormState = {
  phoneNumber: string;
  dateOfBirth: string;
  bvn: string;
  stateOfOrigin: string;
  stateOfResidence: string;
  lgaOfOrigin: string;
  lgaOfResidence: string;
  addressLine1: string;
};

const modalStyles = `
.renew-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 14, 10, 0.46);
}

.renew-modal__dialog {
  width: min(100%, 540px);
  max-height: min(92vh, 960px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 32px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 246, 0.96));
  box-shadow: 0 40px 120px rgba(10, 20, 13, 0.22);
  color: #102114;
  font-family: inherit;
}

.renew-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid #dce4dc;
}

.renew-modal__eyebrow {
  margin: 0 0 8px;
  color: #0c4a27;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.32em;
  text-transform: uppercase;
}

.renew-modal__title {
  margin: 0;
  font-size: clamp(1.65rem, 4vw, 2.35rem);
  font-weight: 700;
  line-height: 0.98;
  letter-spacing: -0.05em;
  color: #102114;
}

.renew-modal__subtitle,
.renew-modal__copy,
.renew-modal__field-copy,
.renew-modal__muted {
  margin: 0;
  color: #5b6f5f;
}

.renew-modal__subtitle {
  font-size: 14px;
  line-height: 1.6;
}

.renew-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid #dce4dc;
  background: #ffffff;
  color: #102114;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease;
}

.renew-modal__close:hover {
  border-color: #0c4a27;
  color: #0c4a27;
}

.renew-modal__body {
  display: block;
  max-height: calc(min(92vh, 960px) - 101px);
  overflow-y: auto;
}

.renew-modal__primary {
  padding: 24px;
}

.renew-modal__section-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.04em;
  color: inherit;
}

.renew-modal__copy {
  max-width: 640px;
  font-size: 14px;
  line-height: 1.7;
}

.renew-modal__stack {
  display: grid;
  gap: 16px;
}

.renew-modal__grid {
  display: grid;
  gap: 14px;
}

.renew-modal__field {
  display: grid;
  gap: 8px;
}

.renew-modal__label {
  font-size: 14px;
  font-weight: 700;
  color: #102114;
}

.renew-modal__input,
.renew-modal__select {
  width: 100%;
  height: 48px;
  border-radius: 18px;
  border: 1px solid #dce4dc;
  background: #ffffff;
  padding: 0 16px;
  color: #102114;
  font: inherit;
  outline: none;
  transition: border-color 160ms ease;
  box-sizing: border-box;
}

.renew-modal__input:focus,
.renew-modal__select:focus {
  border-color: #0c4a27;
}

.renew-modal__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 24px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  cursor: pointer;
  transition: background 160ms ease, opacity 160ms ease, transform 160ms ease;
}

.renew-modal__button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.renew-modal__button--brand {
  background: #0c4a27;
  color: #d9f6bc;
}

.renew-modal__button--brand:hover:not(:disabled) {
  background: #093a1e;
}

.renew-modal__meta-grid {
  display: grid;
  gap: 16px;
}

.renew-modal__card,
.renew-modal__instruction-card,
.renew-modal__state-card {
  border-radius: 24px;
  box-sizing: border-box;
}

.renew-modal__card {
  border: 1px solid #dce4dc;
  background: #ffffff;
  padding: 16px;
}

.renew-modal__instruction-card {
  border: 1px solid #dce4dc;
  background: #ffffff;
  padding: 20px;
}

.renew-modal__state-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
}

.renew-modal__card-label,
.renew-modal__state-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.renew-modal__card-label {
  color: #5b6f5f;
}

.renew-modal__state-label {
  color: rgba(255, 255, 255, 0.55);
}

.renew-modal__card-value {
  margin: 12px 0 0;
  color: #102114;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.renew-modal__card-value--lg {
  font-size: 32px;
}

.renew-modal__card-value--md {
  font-size: 18px;
  letter-spacing: -0.04em;
}

.renew-modal__state-value {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.03em;
}

.renew-modal__session-id {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.7);
  word-break: break-all;
}

.renew-modal__error {
  margin-top: 20px;
  border: 1px solid #fecaca;
  border-radius: 20px;
  background: #fef2f2;
  padding: 12px 16px;
  color: #b91c1c;
  font-size: 14px;
}

.renew-modal__secondary-title {
  margin: 0;
  color: #d9f6bc;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.32em;
  text-transform: uppercase;
}

.renew-modal__secondary-stack {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

@media (min-width: 640px) {
  .renew-modal__header,
  .renew-modal__primary,
  .renew-modal__secondary {
    padding-left: 32px;
    padding-right: 32px;
  }

  .renew-modal__grid--two,
  .renew-modal__meta-grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .renew-modal__overlay {
    align-items: center;
  }
}
`;

const hiddenButtonStyle: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
};

export type RenewCheckoutModalProps = {
  readonly isOpen: boolean;
  readonly client: RenewCheckoutClient;
  readonly session: RenewCheckoutSession | null;
  readonly clientSecret?: string | null;
  readonly onClose: () => void;
  readonly onSessionChange?: UseRenewCheckoutSessionOptions["onSessionChange"];
  readonly onSettled?: UseRenewCheckoutSessionOptions["onSettled"];
  readonly onFailed?: UseRenewCheckoutSessionOptions["onFailed"];
};

function getSupportedMarkets(session: RenewCheckoutSession | null) {
  return Array.isArray(session?.plan?.supportedMarkets)
    ? session.plan.supportedMarkets
    : [];
}

function getPlanName(session: RenewCheckoutSession | null) {
  const value = session?.plan?.name;
  return typeof value === "string" && value.trim() ? value : "Renew plan";
}

function getPlanUsdAmount(session: RenewCheckoutSession | null) {
  const value = session?.plan?.usdAmount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPlanBillingIntervalDays(session: RenewCheckoutSession | null) {
  const value = session?.plan?.billingIntervalDays;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function createInitialFormState(session: RenewCheckoutSession | null): FormState {
  return {
    name: session?.customer?.name ?? "",
    email: session?.customer?.email ?? "",
    market: session?.customer?.market ?? getSupportedMarkets(session)[0] ?? "NGN",
  };
}

function createInitialVerificationState(): VerificationFormState {
  return {
    phoneNumber: "",
    dateOfBirth: "",
    bvn: "",
    stateOfOrigin: "",
    stateOfResidence: "",
    lgaOfOrigin: "",
    lgaOfResidence: "",
    addressLine1: "",
  };
}

function formatInterval(days: number) {
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }

  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }

  return `${days} days`;
}

function humanizeValue(value: string) {
  return value.replace(/_/g, " ");
}

function getPrimarySectionContent(session: RenewCheckoutSession) {
  if (session.nextAction === "wait_for_charge") {
    return {
      title: "Subscription scheduled",
      copy: "Payment details will appear when the first charge is due.",
    };
  }

  return {
    title: "Payment instructions",
    copy: "Use these details to complete the payment.",
  };
}

export function RenewCheckoutModal({
  isOpen,
  client,
  session,
  clientSecret,
  onClose,
  onSessionChange,
  onSettled,
  onFailed,
}: RenewCheckoutModalProps) {
  const [formState, setFormState] = useState<FormState>(
    createInitialFormState(session)
  );
  const [verificationState, setVerificationState] = useState<VerificationFormState>(
    createInitialVerificationState()
  );
  const [marketQuote, setMarketQuote] = useState<RenewCheckoutMarketQuote | null>(null);
  const [marketQuoteError, setMarketQuoteError] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const {
    session: currentSession,
    error,
    isSubmittingCustomer,
    isSubmittingVerification,
    isCompletingTestPayment,
    submitCustomer,
    submitVerification,
    completeTestPayment,
  } = useRenewCheckoutSession({
    client,
    initialSession: session,
    clientSecret,
    enabled: isOpen,
    onSessionChange,
    onSettled,
    onFailed,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormState(createInitialFormState(session));
    setVerificationState(createInitialVerificationState());
    setMarketQuote(null);
    setMarketQuoteError(null);
  }, [isOpen, session]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !currentSession || currentSession.status !== "settled") {
      return;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, currentSession?.status]);

  useEffect(() => {
    if (
      !isOpen ||
      !clientSecret ||
      !currentSession ||
      currentSession.nextAction !== "submit_customer" ||
      !formState.market
    ) {
      setMarketQuote(null);
      setMarketQuoteError(null);
      setIsLoadingQuote(false);
      return;
    }

    let cancelled = false;
    setIsLoadingQuote(true);
    setMarketQuoteError(null);

    void client
      .quoteMarket(currentSession.id, formState.market, {
        clientSecret,
      })
      .then((quote) => {
        if (!cancelled) {
          setMarketQuote(quote);
        }
      })
      .catch((quoteError) => {
        if (!cancelled) {
          setMarketQuote(null);
          setMarketQuoteError(
            quoteError instanceof Error ? quoteError.message : "Unable to load quote."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingQuote(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, clientSecret, currentSession, formState.market, isOpen]);

  if (!isOpen || !currentSession) {
    return null;
  }

  const paymentInstructions = currentSession.paymentInstructions;
  const supportedMarkets = getSupportedMarkets(currentSession);
  const planName = getPlanName(currentSession);
  const planUsdAmount = getPlanUsdAmount(currentSession);
  const billingIntervalDays = getPlanBillingIntervalDays(currentSession);
  const primarySection = getPrimarySectionContent(currentSession);
  const marketOptions =
    supportedMarkets.length > 0
      ? supportedMarkets
      : formState.market
        ? [formState.market]
        : [];

  const handleSubmitCustomer = async () => {
    const payload: SubmitCheckoutCustomerInput = {
      name: formState.name.trim(),
      email: formState.email.trim().toLowerCase(),
      market: formState.market,
      metadata: {
        source: "renew-sdk-checkout-modal",
      },
    };

    await submitCustomer(payload);
  };

  const handleSubmitVerification = async () => {
    await submitVerification({
      phoneNumber: verificationState.phoneNumber.trim(),
      dateOfBirth: verificationState.dateOfBirth.trim(),
      bvn: verificationState.bvn.trim(),
      stateOfOrigin: verificationState.stateOfOrigin.trim(),
      stateOfResidence: verificationState.stateOfResidence.trim(),
      lgaOfOrigin: verificationState.lgaOfOrigin.trim(),
      lgaOfResidence: verificationState.lgaOfResidence.trim(),
      addressLine1: verificationState.addressLine1.trim(),
      country: currentSession.verification?.country ?? "NG",
    });
  };

  return (
    <div
      className="renew-modal__overlay"
      onClick={onClose}
    >
      <style>{modalStyles}</style>
      <div
        className="renew-modal__dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="renew-modal__header">
          <div>
            <p className="renew-modal__eyebrow">Renew checkout</p>
            <div>
              <h2 className="renew-modal__title">{planName}</h2>
              <p className="renew-modal__subtitle">
                {planUsdAmount === null ? "Price pending" : `$${planUsdAmount.toFixed(2)}`}{" "}
                {billingIntervalDays === null ? null : (
                  <>
                    billed every {formatInterval(billingIntervalDays)}
                  </>
                )}
                {marketQuote ? ` · approx. ${marketQuote.localAmount.toFixed(2)} ${marketQuote.currency}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="renew-modal__close"
            style={hiddenButtonStyle}
            aria-label="Close checkout"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 18 18"
              fill="none"
              style={{ width: 16, height: 16 }}
            >
              <path d="M4 4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="renew-modal__body">
          <div className="renew-modal__primary">
            {currentSession.status === "settled" ? (
              <div className="renew-modal__stack" style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "#0c4a27",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d9f6bc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="renew-modal__section-title" style={{ marginTop: 20 }}>Payment complete</h3>
                <p className="renew-modal__copy" style={{ margin: "8px auto 0" }}>
                  The sandbox payment has been settled successfully. This modal will close shortly.
                </p>
              </div>
            ) : currentSession.status === "failed" ? (
              <div className="renew-modal__stack" style={{ textAlign: "center", padding: "40px 0" }}>
                <h3 className="renew-modal__section-title">Payment failed</h3>
                <p className="renew-modal__copy" style={{ margin: "8px auto 0" }}>
                  {currentSession.failureReason
                    ? `Reason: ${currentSession.failureReason}`
                    : "The payment could not be completed."}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="renew-modal__button renew-modal__button--brand"
                  style={{ ...hiddenButtonStyle, marginTop: 16 }}
                >
                  Close
                </button>
              </div>
            ) : currentSession.nextAction === "submit_customer" ? (
              <div className="renew-modal__stack">
                <div>
                  <h3 className="renew-modal__section-title">Start the checkout</h3>
                </div>

                <div className="renew-modal__grid renew-modal__grid--two">
                  <label className="renew-modal__field">
                    <span className="renew-modal__label">Name</span>
                    <input
                      value={formState.name}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="Ada Ventures"
                    />
                  </label>

                  <label className="renew-modal__field">
                    <span className="renew-modal__label">Email</span>
                    <input
                      type="email"
                      value={formState.email}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="finance@company.com"
                    />
                  </label>
                </div>

                <label className="renew-modal__field">
                  <span className="renew-modal__label">Billing market</span>
                  <select
                    value={formState.market}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        market: event.target.value,
                      }))
                    }
                    className="renew-modal__select"
                  >
                    {marketOptions.map((market) => (
                      <option key={market} value={market}>
                        {market}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="renew-modal__card">
                  <p className="renew-modal__card-label">Estimated local amount</p>
                  <p className="renew-modal__card-value renew-modal__card-value--md">
                    {marketQuote
                      ? `${marketQuote.localAmount.toFixed(2)} ${marketQuote.currency}`
                      : isLoadingQuote
                        ? "Loading quote..."
                        : "--"}
                  </p>
                  <p className="renew-modal__field-copy" style={{ marginTop: 8 }}>
                    {marketQuote
                      ? `${marketQuote.fxRate.toFixed(2)} ${marketQuote.currency} per USDC`
                      : marketQuoteError ?? "Quote will update when the billing market changes."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSubmitCustomer()}
                  disabled={
                    isSubmittingCustomer ||
                    !formState.name.trim() ||
                    !formState.email.trim() ||
                    !formState.market
                  }
                  className="renew-modal__button renew-modal__button--brand"
                  style={hiddenButtonStyle}
                >
                  {isSubmittingCustomer ? "Starting checkout..." : "Continue to payment"}
                </button>
              </div>
            ) : currentSession.nextAction === "complete_verification" ? (
              <div className="renew-modal__stack">
                <div>
                  <h3 className="renew-modal__section-title">Verify to get payment details</h3>
                  <p className="renew-modal__copy">
                    We need your details to create a billing account for you.
                  </p>
                </div>

                <div className="renew-modal__grid renew-modal__grid--two">
                  <label className="renew-modal__field">
                    <span className="renew-modal__label">Phone number</span>
                    <input
                      value={verificationState.phoneNumber}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          phoneNumber: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="+2348012345678"
                    />
                  </label>

                  <label className="renew-modal__field">
                    <span className="renew-modal__label">Date of birth</span>
                    <input
                      value={verificationState.dateOfBirth}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          dateOfBirth: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="1994-08-12"
                    />
                  </label>
                </div>

                <div className="renew-modal__grid renew-modal__grid--two">
                  <label className="renew-modal__field">
                    <span className="renew-modal__label">BVN</span>
                    <input
                      value={verificationState.bvn}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          bvn: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="Enter BVN"
                    />
                  </label>
                </div>

                <div className="renew-modal__grid renew-modal__grid--two">
                  <label className="renew-modal__field">
                    <span className="renew-modal__label">State of origin</span>
                    <input
                      value={verificationState.stateOfOrigin}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          stateOfOrigin: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="State of origin"
                    />
                  </label>

                  <label className="renew-modal__field">
                    <span className="renew-modal__label">State of residence</span>
                    <input
                      value={verificationState.stateOfResidence}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          stateOfResidence: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="State of residence"
                    />
                  </label>
                </div>

                <div className="renew-modal__grid renew-modal__grid--two">
                  <label className="renew-modal__field">
                    <span className="renew-modal__label">LGA of origin</span>
                    <input
                      value={verificationState.lgaOfOrigin}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          lgaOfOrigin: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="LGA of origin"
                    />
                  </label>

                  <label className="renew-modal__field">
                    <span className="renew-modal__label">LGA of residence</span>
                    <input
                      value={verificationState.lgaOfResidence}
                      onChange={(event) =>
                        setVerificationState((current) => ({
                          ...current,
                          lgaOfResidence: event.target.value,
                        }))
                      }
                      className="renew-modal__input"
                      placeholder="LGA of residence"
                    />
                  </label>
                </div>

                <label className="renew-modal__field">
                  <span className="renew-modal__label">Address line 1</span>
                  <input
                    value={verificationState.addressLine1}
                    onChange={(event) =>
                      setVerificationState((current) => ({
                        ...current,
                        addressLine1: event.target.value,
                      }))
                    }
                    className="renew-modal__input"
                    placeholder="Street address"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleSubmitVerification()}
                  disabled={
                    isSubmittingVerification ||
                    !verificationState.phoneNumber.trim() ||
                    !verificationState.dateOfBirth.trim() ||
                    !verificationState.bvn.trim() ||
                    !verificationState.stateOfOrigin.trim() ||
                    !verificationState.stateOfResidence.trim() ||
                    !verificationState.lgaOfOrigin.trim() ||
                    !verificationState.lgaOfResidence.trim() ||
                    !verificationState.addressLine1.trim()
                  }
                  className="renew-modal__button renew-modal__button--brand"
                  style={hiddenButtonStyle}
                >
                  {isSubmittingVerification
                    ? "Creating payment instructions..."
                    : "Get payment details"}
                </button>
              </div>
            ) : (
              <div className="renew-modal__stack">
                <div>
                  <h3 className="renew-modal__section-title">{primarySection.title}</h3>
                  <p className="renew-modal__copy">{primarySection.copy}</p>
                </div>

                {currentSession.nextAction === "wait_for_charge" ? (
                  <div className="renew-modal__instruction-card">
                    <div className="renew-modal__grid">
                      <div>
                        <p className="renew-modal__card-label">What happens next</p>
                        <p className="renew-modal__card-value renew-modal__card-value--md">
                          Payment details will appear when the first charge is due.
                        </p>
                      </div>

                      <div>
                        <p className="renew-modal__card-label">Current customer</p>
                        <p className="renew-modal__card-value renew-modal__card-value--md">
                          {currentSession.customer?.email ?? "Pending customer details"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="renew-modal__meta-grid renew-modal__meta-grid--two">
                      <div className="renew-modal__card">
                        <p className="renew-modal__card-label">Charge amount</p>
                        <p className="renew-modal__card-value renew-modal__card-value--lg">
                          {paymentInstructions?.localAmount?.toFixed(2) ?? "--"}{" "}
                          {paymentInstructions?.billingCurrency ?? ""}
                        </p>
                      </div>

                      <div className="renew-modal__card">
                        <p className="renew-modal__card-label">Reference</p>
                        <p className="renew-modal__card-value renew-modal__card-value--md">
                          {paymentInstructions?.reference ??
                            currentSession.charge?.externalChargeId ??
                            "--"}
                        </p>
                      </div>
                    </div>

                    <div className="renew-modal__instruction-card">
                      <div className="renew-modal__grid renew-modal__grid--two">
                        <div>
                          <p className="renew-modal__card-label">Account name</p>
                          <p className="renew-modal__card-value renew-modal__card-value--md">
                            {paymentInstructions?.bankTransfer?.accountName ?? "--"}
                          </p>
                        </div>

                        <div>
                          <p className="renew-modal__card-label">Bank</p>
                          <p className="renew-modal__card-value renew-modal__card-value--md">
                            {paymentInstructions?.bankTransfer?.bankName ?? "--"}
                          </p>
                        </div>

                        <div style={{ gridColumn: "1 / -1" }}>
                          <p className="renew-modal__card-label">Account number</p>
                          <p
                            className="renew-modal__card-value renew-modal__card-value--md"
                            style={{ letterSpacing: "0.08em" }}
                          >
                            {paymentInstructions?.bankTransfer?.accountNumber ?? "--"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {currentSession.nextAction === "redirect_to_provider" &&
                    paymentInstructions?.redirectUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = paymentInstructions.redirectUrl ?? "";
                        }}
                        className="renew-modal__button renew-modal__button--brand"
                        style={hiddenButtonStyle}
                      >
                        Continue to payment
                      </button>
                    ) : null}

                    {currentSession.testMode.canCompletePayment ? (
                      <button
                        type="button"
                        onClick={() => void completeTestPayment()}
                        disabled={isCompletingTestPayment}
                        className="renew-modal__button renew-modal__button--brand"
                        style={hiddenButtonStyle}
                      >
                        {isCompletingTestPayment
                          ? "Completing sandbox payment..."
                          : "Complete sandbox payment"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            )}

            {error ? (
              <div className="renew-modal__error">{error}</div>
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
}
