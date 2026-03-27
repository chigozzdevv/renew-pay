use anchor_lang::prelude::*;

#[account]
pub struct Merchant {
    pub merchant_id: [u8; 32],
    pub authority: Pubkey,
    pub payout_token_account: Pubkey,
    pub pending_payout_token_account: Option<Pubkey>,
    pub metadata_hash: [u8; 32],
    pub billing_enabled: bool,
    pub payout_change_ready_at: i64,
    pub vault_token_account: Pubkey,
    pub bump: u8,
}

impl Merchant {
    pub const LEN: usize = 32 + 32 + 32 + 33 + 32 + 1 + 8 + 32 + 1;
}

#[account]
pub struct MerchantLedger {
    pub merchant: Pubkey,
    pub available_balance: u64,
    pub total_settled: u64,
    pub total_withdrawn: u64,
    pub last_settlement_at: i64,
    pub bump: u8,
}

impl MerchantLedger {
    pub const LEN: usize = 32 + 8 + 8 + 8 + 8 + 1;
}
