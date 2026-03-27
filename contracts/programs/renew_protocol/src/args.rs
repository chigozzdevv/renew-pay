use anchor_lang::prelude::*;

use crate::state::BillingMode;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PlanTermsArgs {
    pub fixed_amount: u64,
    pub usage_rate: u64,
    pub billing_interval_seconds: u64,
    pub trial_period_seconds: u64,
    pub retry_window_seconds: u64,
    pub max_retry_count: u8,
    pub billing_mode: BillingMode,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct SubscriptionArgs {
    pub customer_ref_hash: [u8; 32],
    pub billing_currency: [u8; 8],
    pub first_charge_at: Option<i64>,
    pub local_amount_snapshot: u64,
    pub mandate_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct FxQuoteSnapshotArgs {
    pub fx_rate_in_micros: u64,
    pub fx_quote_ref_hash: [u8; 32],
    pub fx_provider_ref_hash: [u8; 32],
    pub quote_generated_at: i64,
    pub quote_expires_at: i64,
}

impl Default for PlanTermsArgs {
    fn default() -> Self {
        Self {
            fixed_amount: 0,
            usage_rate: 0,
            billing_interval_seconds: 30 * 24 * 60 * 60,
            trial_period_seconds: 0,
            retry_window_seconds: 24 * 60 * 60,
            max_retry_count: 3,
            billing_mode: BillingMode::Fixed,
        }
    }
}
