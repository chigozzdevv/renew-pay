use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
    pub route_count: u64,
    pub commitment_count: u64,
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

impl Default for Config {
    fn default() -> Self {
        Self {
            admin: Pubkey::default(),
            operator: Pubkey::default(),
            pauser: Pubkey::default(),
            route_count: 0,
            commitment_count: 0,
            paused: false,
            bump: 0,
        }
    }
}
