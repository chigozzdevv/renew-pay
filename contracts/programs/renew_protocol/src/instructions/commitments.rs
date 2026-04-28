use anchor_lang::prelude::*;

use crate::{
    args::{PayoutBatchArgs, RouteCheckpointArgs, SettlementBatchArgs},
    constants::{
        CONFIG_SEED, PAYOUT_BATCH_SEED, ROUTE_CHECKPOINT_SEED, ROUTE_CONFIG_SEED,
        SETTLEMENT_BATCH_SEED,
    },
    errors::RenewError,
    events::{ProofCommitmentCreated, RouteCheckpointCommitted},
    state::{CommitmentKind, Config, ProofCommitment, RouteConfig},
};

fn require_nonzero_hash(value: &[u8; 32], error: RenewError) -> Result<()> {
    if !value.iter().any(|byte| *byte != 0) {
        return Err(error.into());
    }

    Ok(())
}

fn require_valid_item_count(item_count: u32) -> Result<()> {
    require!(item_count > 0, RenewError::InvalidItemCount);
    Ok(())
}

fn require_route_enabled(route: &RouteConfig) -> Result<()> {
    require!(route.enabled, RenewError::RouteDisabled);
    Ok(())
}

fn set_commitment(
    commitment: &mut ProofCommitment,
    kind: CommitmentKind,
    route_id_hash: [u8; 32],
    batch_id_hash: [u8; 32],
    root: [u8; 32],
    gross_amount: u64,
    fee_amount: u64,
    net_amount: u64,
    item_count: u32,
    metadata_hash: [u8; 32],
    committed_by: Pubkey,
    committed_at: i64,
    bump: u8,
) {
    commitment.kind = kind;
    commitment.route_id_hash = route_id_hash;
    commitment.batch_id_hash = batch_id_hash;
    commitment.root = root;
    commitment.gross_amount = gross_amount;
    commitment.fee_amount = fee_amount;
    commitment.net_amount = net_amount;
    commitment.item_count = item_count;
    commitment.metadata_hash = metadata_hash;
    commitment.committed_by = committed_by;
    commitment.committed_at = committed_at;
    commitment.bump = bump;
}

pub fn commit_settlement_batch(
    ctx: Context<CommitSettlementBatch>,
    args: SettlementBatchArgs,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, RenewError::ProgramPaused);
    require_route_enabled(&ctx.accounts.route)?;
    require_nonzero_hash(&args.batch_id_hash, RenewError::InvalidIdentifier)?;
    require_nonzero_hash(&args.settlement_root, RenewError::InvalidCommitmentRoot)?;
    require_valid_item_count(args.item_count)?;
    require!(args.gross_amount > 0, RenewError::InvalidAmount);
    require!(
        args.fee_amount
            .checked_add(args.net_amount)
            .ok_or(RenewError::ArithmeticOverflow)?
            == args.gross_amount,
        RenewError::AmountMismatch
    );

    let now = Clock::get()?.unix_timestamp;
    set_commitment(
        &mut ctx.accounts.commitment,
        CommitmentKind::SettlementBatch,
        args.route_id_hash,
        args.batch_id_hash,
        args.settlement_root,
        args.gross_amount,
        args.fee_amount,
        args.net_amount,
        args.item_count,
        args.metadata_hash,
        ctx.accounts.operator.key(),
        now,
        ctx.bumps.commitment,
    );

    let route = &mut ctx.accounts.route;
    route.total_settlement_committed = route
        .total_settlement_committed
        .checked_add(args.gross_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    route.total_fee_committed = route
        .total_fee_committed
        .checked_add(args.fee_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    route.outstanding_amount = route
        .outstanding_amount
        .checked_add(args.net_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    route.updated_at = now;

    let config = &mut ctx.accounts.config;
    config.commitment_count = config
        .commitment_count
        .checked_add(1)
        .ok_or(RenewError::ArithmeticOverflow)?;

    emit!(ProofCommitmentCreated {
        commitment: ctx.accounts.commitment.key(),
        kind: CommitmentKind::SettlementBatch,
        route_id_hash: args.route_id_hash,
        batch_id_hash: args.batch_id_hash,
        root: args.settlement_root,
        gross_amount: args.gross_amount,
        fee_amount: args.fee_amount,
        net_amount: args.net_amount,
        item_count: args.item_count,
        metadata_hash: args.metadata_hash,
        committed_by: ctx.accounts.operator.key(),
        committed_at: now,
    });

    Ok(())
}

pub fn commit_payout_batch(ctx: Context<CommitPayoutBatch>, args: PayoutBatchArgs) -> Result<()> {
    require!(!ctx.accounts.config.paused, RenewError::ProgramPaused);
    require_route_enabled(&ctx.accounts.route)?;
    require_nonzero_hash(&args.batch_id_hash, RenewError::InvalidIdentifier)?;
    require_nonzero_hash(&args.payout_root, RenewError::InvalidCommitmentRoot)?;
    require_valid_item_count(args.item_count)?;
    require!(args.amount > 0, RenewError::InvalidAmount);
    require!(
        ctx.accounts.route.outstanding_amount >= args.amount,
        RenewError::InsufficientOutstandingAmount
    );

    let now = Clock::get()?.unix_timestamp;
    set_commitment(
        &mut ctx.accounts.commitment,
        CommitmentKind::PayoutBatch,
        args.route_id_hash,
        args.batch_id_hash,
        args.payout_root,
        args.amount,
        0,
        args.amount,
        args.item_count,
        args.metadata_hash,
        ctx.accounts.operator.key(),
        now,
        ctx.bumps.commitment,
    );

    let route = &mut ctx.accounts.route;
    route.total_payout_committed = route
        .total_payout_committed
        .checked_add(args.amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    route.outstanding_amount = route
        .outstanding_amount
        .checked_sub(args.amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    route.updated_at = now;

    let config = &mut ctx.accounts.config;
    config.commitment_count = config
        .commitment_count
        .checked_add(1)
        .ok_or(RenewError::ArithmeticOverflow)?;

    emit!(ProofCommitmentCreated {
        commitment: ctx.accounts.commitment.key(),
        kind: CommitmentKind::PayoutBatch,
        route_id_hash: args.route_id_hash,
        batch_id_hash: args.batch_id_hash,
        root: args.payout_root,
        gross_amount: args.amount,
        fee_amount: 0,
        net_amount: args.amount,
        item_count: args.item_count,
        metadata_hash: args.metadata_hash,
        committed_by: ctx.accounts.operator.key(),
        committed_at: now,
    });

    Ok(())
}

pub fn commit_route_checkpoint(
    ctx: Context<CommitRouteCheckpoint>,
    args: RouteCheckpointArgs,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, RenewError::ProgramPaused);
    require_route_enabled(&ctx.accounts.route)?;
    require_nonzero_hash(&args.checkpoint_id_hash, RenewError::InvalidIdentifier)?;
    require_nonzero_hash(&args.checkpoint_root, RenewError::InvalidCommitmentRoot)?;
    require_valid_item_count(args.item_count)?;

    let now = Clock::get()?.unix_timestamp;
    set_commitment(
        &mut ctx.accounts.commitment,
        CommitmentKind::RouteCheckpoint,
        args.route_id_hash,
        args.checkpoint_id_hash,
        args.checkpoint_root,
        args.outstanding_amount,
        0,
        args.outstanding_amount,
        args.item_count,
        args.metadata_hash,
        ctx.accounts.operator.key(),
        now,
        ctx.bumps.commitment,
    );

    let route = &mut ctx.accounts.route;
    route.outstanding_amount = args.outstanding_amount;
    route.last_checkpoint_root = args.checkpoint_root;
    route.last_checkpoint_amount = args.outstanding_amount;
    route.last_checkpoint_at = now;
    route.updated_at = now;

    let config = &mut ctx.accounts.config;
    config.commitment_count = config
        .commitment_count
        .checked_add(1)
        .ok_or(RenewError::ArithmeticOverflow)?;

    emit!(RouteCheckpointCommitted {
        commitment: ctx.accounts.commitment.key(),
        route_id_hash: args.route_id_hash,
        checkpoint_id_hash: args.checkpoint_id_hash,
        checkpoint_root: args.checkpoint_root,
        outstanding_amount: args.outstanding_amount,
        item_count: args.item_count,
        metadata_hash: args.metadata_hash,
        committed_by: ctx.accounts.operator.key(),
        committed_at: now,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: SettlementBatchArgs)]
pub struct CommitSettlementBatch<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.operator == operator.key() @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [ROUTE_CONFIG_SEED, args.route_id_hash.as_ref()],
        bump = route.bump,
        constraint = route.route_id_hash == args.route_id_hash @ RenewError::InvalidRoute
    )]
    pub route: Account<'info, RouteConfig>,
    #[account(
        init,
        payer = operator,
        space = 8 + ProofCommitment::LEN,
        seeds = [SETTLEMENT_BATCH_SEED, args.route_id_hash.as_ref(), args.batch_id_hash.as_ref()],
        bump
    )]
    pub commitment: Account<'info, ProofCommitment>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: PayoutBatchArgs)]
pub struct CommitPayoutBatch<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.operator == operator.key() @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [ROUTE_CONFIG_SEED, args.route_id_hash.as_ref()],
        bump = route.bump,
        constraint = route.route_id_hash == args.route_id_hash @ RenewError::InvalidRoute
    )]
    pub route: Account<'info, RouteConfig>,
    #[account(
        init,
        payer = operator,
        space = 8 + ProofCommitment::LEN,
        seeds = [PAYOUT_BATCH_SEED, args.route_id_hash.as_ref(), args.batch_id_hash.as_ref()],
        bump
    )]
    pub commitment: Account<'info, ProofCommitment>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: RouteCheckpointArgs)]
pub struct CommitRouteCheckpoint<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.operator == operator.key() @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [ROUTE_CONFIG_SEED, args.route_id_hash.as_ref()],
        bump = route.bump,
        constraint = route.route_id_hash == args.route_id_hash @ RenewError::InvalidRoute
    )]
    pub route: Account<'info, RouteConfig>,
    #[account(
        init,
        payer = operator,
        space = 8 + ProofCommitment::LEN,
        seeds = [ROUTE_CHECKPOINT_SEED, args.route_id_hash.as_ref(), args.checkpoint_id_hash.as_ref()],
        bump
    )]
    pub commitment: Account<'info, ProofCommitment>,
    pub system_program: Program<'info, System>,
}
