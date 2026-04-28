#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

pub mod args;
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use args::*;
pub use errors::*;
pub use events::*;
pub(crate) use instructions::admin::{
    __client_accounts_admin_only, __client_accounts_initialize_config, __client_accounts_set_paused,
};
pub(crate) use instructions::commitments::{
    __client_accounts_commit_payout_batch, __client_accounts_commit_route_checkpoint,
    __client_accounts_commit_settlement_batch,
};
pub(crate) use instructions::routes::{
    __client_accounts_configure_route, __client_accounts_update_route,
};
pub use instructions::{
    AdminOnly, CommitPayoutBatch, CommitRouteCheckpoint, CommitSettlementBatch, ConfigureRoute,
    InitializeConfig, SetPaused, UpdateRoute,
};
pub use state::{CommitmentKind, Config, ProofCommitment, RouteConfig};

declare_id!("fScJ66UUXwsb4ogdFgYSZfEG7piyhTi4z9gZZe931oh");

#[program]
pub mod renew_protocol {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        operator: Pubkey,
        pauser: Pubkey,
    ) -> Result<()> {
        instructions::admin::initialize_config(ctx, operator, pauser)
    }

    pub fn update_authorities(
        ctx: Context<AdminOnly>,
        operator: Option<Pubkey>,
        pauser: Option<Pubkey>,
    ) -> Result<()> {
        instructions::admin::update_authorities(ctx, operator, pauser)
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn configure_route(ctx: Context<ConfigureRoute>, args: ConfigureRouteArgs) -> Result<()> {
        instructions::routes::configure_route(ctx, args)
    }

    pub fn update_route(ctx: Context<UpdateRoute>, args: UpdateRouteArgs) -> Result<()> {
        instructions::routes::update_route(ctx, args)
    }

    pub fn commit_settlement_batch(
        ctx: Context<CommitSettlementBatch>,
        args: SettlementBatchArgs,
    ) -> Result<()> {
        instructions::commitments::commit_settlement_batch(ctx, args)
    }

    pub fn commit_payout_batch(
        ctx: Context<CommitPayoutBatch>,
        args: PayoutBatchArgs,
    ) -> Result<()> {
        instructions::commitments::commit_payout_batch(ctx, args)
    }

    pub fn commit_route_checkpoint(
        ctx: Context<CommitRouteCheckpoint>,
        args: RouteCheckpointArgs,
    ) -> Result<()> {
        instructions::commitments::commit_route_checkpoint(ctx, args)
    }
}
