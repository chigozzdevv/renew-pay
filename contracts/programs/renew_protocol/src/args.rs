use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigureRouteArgs {
    pub route_id_hash: [u8; 32],
    pub chain_id: u64,
    pub asset_id_hash: [u8; 32],
    pub settlement_rail_hash: [u8; 32],
    pub privacy_rail_hash: [u8; 32],
    pub capabilities: u64,
    pub metadata_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateRouteArgs {
    pub enabled: bool,
    pub metadata_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettlementBatchArgs {
    pub route_id_hash: [u8; 32],
    pub batch_id_hash: [u8; 32],
    pub settlement_root: [u8; 32],
    pub gross_amount: u64,
    pub fee_amount: u64,
    pub net_amount: u64,
    pub item_count: u32,
    pub metadata_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PayoutBatchArgs {
    pub route_id_hash: [u8; 32],
    pub batch_id_hash: [u8; 32],
    pub payout_root: [u8; 32],
    pub amount: u64,
    pub item_count: u32,
    pub metadata_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RouteCheckpointArgs {
    pub route_id_hash: [u8; 32],
    pub checkpoint_id_hash: [u8; 32],
    pub checkpoint_root: [u8; 32],
    pub outstanding_amount: u64,
    pub item_count: u32,
    pub metadata_hash: [u8; 32],
}
