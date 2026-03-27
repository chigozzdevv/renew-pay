use anchor_lang::prelude::*;

use crate::state::BillingMode;

#[account]
pub struct Plan {
    pub merchant: Pubkey,
    pub plan_code_hash: [u8; 32],
    pub fixed_amount: u64,
    pub usage_rate: u64,
    pub billing_interval_seconds: u64,
    pub trial_period_seconds: u64,
    pub retry_window_seconds: u64,
    pub max_retry_count: u8,
    pub billing_mode: BillingMode,
    pub active: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl Plan {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 1;
}
