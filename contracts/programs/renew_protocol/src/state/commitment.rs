use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CommitmentKind {
    SettlementBatch,
    PayoutBatch,
    RouteCheckpoint,
}

#[account]
pub struct ProofCommitment {
    pub kind: CommitmentKind,
    pub route_id_hash: [u8; 32],
    pub batch_id_hash: [u8; 32],
    pub root: [u8; 32],
    pub gross_amount: u64,
    pub fee_amount: u64,
    pub net_amount: u64,
    pub item_count: u32,
    pub metadata_hash: [u8; 32],
    pub committed_by: Pubkey,
    pub committed_at: i64,
    pub bump: u8,
}

impl ProofCommitment {
    pub const LEN: usize = 1 + 32 + 32 + 32 + 8 + 8 + 8 + 4 + 32 + 32 + 8 + 1;
}
