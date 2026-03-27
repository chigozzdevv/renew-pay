use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BillingMode {
    Fixed,
    Metered,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SubscriptionStatus {
    Active,
    Paused,
    RetryExhausted,
    Cancelled,
}

#[account]
pub struct Subscription {
    pub merchant: Pubkey,
    pub plan: Pubkey,
    pub subscription_ref_hash: [u8; 32],
    pub customer_ref_hash: [u8; 32],
    pub mandate_hash: [u8; 32],
    pub billing_currency: [u8; 8],
    pub status: SubscriptionStatus,
    pub billing_mode: BillingMode,
    pub fixed_amount: u64,
    pub usage_rate: u64,
    pub local_amount_snapshot: u64,
    pub billing_interval_seconds: u64,
    pub retry_window_seconds: u64,
    pub max_retry_count: u8,
    pub retry_count: u8,
    pub next_charge_at: i64,
    pub last_charge_at: i64,
    pub retry_available_at: i64,
    pub created_at: i64,
    pub bump: u8,
}

impl Subscription {
    pub const LEN: usize =
        32 + 32 + 32 + 32 + 32 + 8 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 8 + 8 + 8 + 1;
}
