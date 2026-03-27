use anchor_lang::prelude::*;

#[account]
pub struct CycleMarker {
    pub subscription: Pubkey,
    pub billing_period_start: i64,
    pub bump: u8,
}

impl CycleMarker {
    pub const LEN: usize = 32 + 8 + 1;
}
