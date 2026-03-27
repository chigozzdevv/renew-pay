use anchor_lang::prelude::*;

#[error_code]
pub enum RenewError {
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Billing is disabled for this merchant.")]
    BillingDisabled,
    #[msg("The charge amount does not match the subscription terms.")]
    ChargeAmountMismatch,
    #[msg("Invalid authority.")]
    InvalidAuthority,
    #[msg("Invalid amount.")]
    InvalidAmount,
    #[msg("Invalid failure code.")]
    InvalidFailureCode,
    #[msg("Invalid FX rate.")]
    InvalidFxRate,
    #[msg("Invalid identifier.")]
    InvalidIdentifier,
    #[msg("Invalid payout delay.")]
    InvalidPayoutDelay,
    #[msg("Invalid protocol fee.")]
    InvalidProtocolFee,
    #[msg("Invalid timestamp.")]
    InvalidTimestamp,
    #[msg("Insufficient merchant balance.")]
    InsufficientMerchantBalance,
    #[msg("Insufficient protocol fee balance.")]
    InsufficientProtocolFees,
    #[msg("Merchant account mismatch.")]
    MerchantMismatch,
    #[msg("No pending payout destination.")]
    NoPendingPayoutDestination,
    #[msg("A payout destination change is already pending.")]
    PayoutChangeAlreadyPending,
    #[msg("Payout change is not ready yet.")]
    PayoutChangeNotReady,
    #[msg("The payout destination is unchanged.")]
    PayoutDestinationUnchanged,
    #[msg("Plan is inactive.")]
    PlanInactive,
    #[msg("Retry limit reached.")]
    RetryLimitReached,
    #[msg("Settlement mint mismatch.")]
    SettlementMintMismatch,
    #[msg("Subscription is cancelled.")]
    SubscriptionCancelled,
    #[msg("Subscription is not chargeable.")]
    SubscriptionNotChargeable,
    #[msg("Unauthorized.")]
    Unauthorized,
}
