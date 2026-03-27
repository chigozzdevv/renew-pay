use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ChargeStatus {
    Executed,
    Failed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ChargeSourceKind {
    Subscription,
    Invoice,
}

#[account]
pub struct ChargeReceipt {
    pub merchant: Pubkey,
    pub source_kind: ChargeSourceKind,
    pub subscription: Option<Pubkey>,
    pub commercial_ref_hash: Option<[u8; 32]>,
    pub external_charge_ref_hash: [u8; 32],
    pub failure_code_hash: Option<[u8; 32]>,
    pub settlement_source: Pubkey,
    pub local_amount: u64,
    pub fx_rate_in_micros: u64,
    pub fx_quote_ref_hash: Option<[u8; 32]>,
    pub fx_provider_ref_hash: Option<[u8; 32]>,
    pub quote_generated_at: i64,
    pub quote_expires_at: i64,
    pub usdc_amount: u64,
    pub fee_amount: u64,
    pub usage_units: u64,
    pub billing_period_start: i64,
    pub processed_at: i64,
    pub status: ChargeStatus,
    pub bump: u8,
}

impl ChargeReceipt {
    pub const LEN: usize =
        32 + 1 + 33 + 33 + 32 + 33 + 32 + 8 + 8 + 33 + 33 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}
