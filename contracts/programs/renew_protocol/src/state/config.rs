use anchor_lang::prelude::*;

use crate::constants::DEFAULT_PAYOUT_DELAY_SECONDS;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub settlement_authority: Pubkey,
    pub settlement_mint: Pubkey,
    pub fee_vault: Pubkey,
    pub fee_collector_token_account: Pubkey,
    pub protocol_fee_bps: u16,
    pub payout_change_delay_seconds: i64,
    pub bump: u8,
    pub vault_authority_bump: u8,
}

impl Config {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 32 + 2 + 8 + 1 + 1;
}

impl Default for Config {
    fn default() -> Self {
        Self {
            admin: Pubkey::default(),
            settlement_authority: Pubkey::default(),
            settlement_mint: Pubkey::default(),
            fee_vault: Pubkey::default(),
            fee_collector_token_account: Pubkey::default(),
            protocol_fee_bps: 250,
            payout_change_delay_seconds: DEFAULT_PAYOUT_DELAY_SECONDS,
            bump: 0,
            vault_authority_bump: 0,
        }
    }
}
