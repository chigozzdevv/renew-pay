use anchor_lang::prelude::*;

#[account]
pub struct RouteConfig {
    pub route_id_hash: [u8; 32],
    pub chain_id: u64,
    pub asset_id_hash: [u8; 32],
    pub settlement_rail_hash: [u8; 32],
    pub privacy_rail_hash: [u8; 32],
    pub capabilities: u64,
    pub enabled: bool,
    pub total_settlement_committed: u64,
    pub total_fee_committed: u64,
    pub total_payout_committed: u64,
    pub outstanding_amount: u64,
    pub last_checkpoint_root: [u8; 32],
    pub last_checkpoint_amount: u64,
    pub last_checkpoint_at: i64,
    pub metadata_hash: [u8; 32],
    pub created_by: Pubkey,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl RouteConfig {
    pub const LEN: usize =
        32 + 8 + 32 + 32 + 32 + 8 + 1 + 8 + 8 + 8 + 8 + 32 + 8 + 8 + 32 + 32 + 8 + 8 + 1;
}
