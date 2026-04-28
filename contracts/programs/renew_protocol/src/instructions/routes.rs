use anchor_lang::prelude::*;

use crate::{
    args::{ConfigureRouteArgs, UpdateRouteArgs},
    constants::{CONFIG_SEED, ROUTE_CONFIG_SEED},
    errors::RenewError,
    events::{RouteConfigured, RouteUpdated},
    state::{Config, RouteConfig},
};

fn require_nonzero_hash(value: &[u8; 32], error: RenewError) -> Result<()> {
    if !value.iter().any(|byte| *byte != 0) {
        return Err(error.into());
    }

    Ok(())
}

pub fn configure_route(ctx: Context<ConfigureRoute>, args: ConfigureRouteArgs) -> Result<()> {
    require_nonzero_hash(&args.route_id_hash, RenewError::InvalidRoute)?;
    require_nonzero_hash(&args.asset_id_hash, RenewError::InvalidIdentifier)?;
    require_nonzero_hash(&args.settlement_rail_hash, RenewError::InvalidIdentifier)?;
    require!(args.chain_id > 0, RenewError::InvalidRoute);

    let now = Clock::get()?.unix_timestamp;
    let route = &mut ctx.accounts.route;
    route.route_id_hash = args.route_id_hash;
    route.chain_id = args.chain_id;
    route.asset_id_hash = args.asset_id_hash;
    route.settlement_rail_hash = args.settlement_rail_hash;
    route.privacy_rail_hash = args.privacy_rail_hash;
    route.capabilities = args.capabilities;
    route.enabled = true;
    route.total_settlement_committed = 0;
    route.total_fee_committed = 0;
    route.total_payout_committed = 0;
    route.outstanding_amount = 0;
    route.last_checkpoint_root = [0; 32];
    route.last_checkpoint_amount = 0;
    route.last_checkpoint_at = 0;
    route.metadata_hash = args.metadata_hash;
    route.created_by = ctx.accounts.admin.key();
    route.created_at = now;
    route.updated_at = now;
    route.bump = ctx.bumps.route;

    let config = &mut ctx.accounts.config;
    config.route_count = config
        .route_count
        .checked_add(1)
        .ok_or(RenewError::ArithmeticOverflow)?;

    emit!(RouteConfigured {
        route: route.key(),
        route_id_hash: args.route_id_hash,
        chain_id: args.chain_id,
        asset_id_hash: args.asset_id_hash,
        settlement_rail_hash: args.settlement_rail_hash,
        privacy_rail_hash: args.privacy_rail_hash,
        capabilities: args.capabilities,
        metadata_hash: args.metadata_hash,
        configured_by: ctx.accounts.admin.key(),
        configured_at: now,
    });

    Ok(())
}

pub fn update_route(ctx: Context<UpdateRoute>, args: UpdateRouteArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let route = &mut ctx.accounts.route;
    route.enabled = args.enabled;
    route.metadata_hash = args.metadata_hash;
    route.updated_at = now;

    emit!(RouteUpdated {
        route: route.key(),
        route_id_hash: route.route_id_hash,
        enabled: args.enabled,
        metadata_hash: args.metadata_hash,
        updated_by: ctx.accounts.admin.key(),
        updated_at: now,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: ConfigureRouteArgs)]
pub struct ConfigureRoute<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + RouteConfig::LEN,
        seeds = [ROUTE_CONFIG_SEED, args.route_id_hash.as_ref()],
        bump
    )]
    pub route: Account<'info, RouteConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRoute<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [ROUTE_CONFIG_SEED, route.route_id_hash.as_ref()],
        bump = route.bump
    )]
    pub route: Account<'info, RouteConfig>,
}
