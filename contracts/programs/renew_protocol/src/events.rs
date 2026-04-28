use anchor_lang::prelude::*;

use crate::state::CommitmentKind;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct AuthoritiesUpdated {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct ProgramPauseUpdated {
    pub pauser: Pubkey,
    pub paused: bool,
}

#[event]
pub struct RouteConfigured {
    pub route: Pubkey,
    pub route_id_hash: [u8; 32],
    pub chain_id: u64,
    pub asset_id_hash: [u8; 32],
    pub settlement_rail_hash: [u8; 32],
    pub privacy_rail_hash: [u8; 32],
    pub capabilities: u64,
    pub metadata_hash: [u8; 32],
    pub configured_by: Pubkey,
    pub configured_at: i64,
}

#[event]
pub struct RouteUpdated {
    pub route: Pubkey,
    pub route_id_hash: [u8; 32],
    pub enabled: bool,
    pub metadata_hash: [u8; 32],
    pub updated_by: Pubkey,
    pub updated_at: i64,
}

#[event]
pub struct ProofCommitmentCreated {
    pub commitment: Pubkey,
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
}

#[event]
pub struct RouteCheckpointCommitted {
    pub commitment: Pubkey,
    pub route_id_hash: [u8; 32],
    pub checkpoint_id_hash: [u8; 32],
    pub checkpoint_root: [u8; 32],
    pub outstanding_amount: u64,
    pub item_count: u32,
    pub metadata_hash: [u8; 32],
    pub committed_by: Pubkey,
    pub committed_at: i64,
}
