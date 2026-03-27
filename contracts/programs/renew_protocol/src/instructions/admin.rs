use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{
        CONFIG_SEED, FEE_VAULT_SEED, MAX_PROTOCOL_FEE_BPS, VAULT_AUTHORITY_SEED,
    },
    errors::RenewError,
    events::ProtocolFeesWithdrawn,
    state::Config,
    utils::{create_program_token_account, transfer_with_vault_authority},
};

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    settlement_authority: Pubkey,
    protocol_fee_bps: u16,
    payout_change_delay_seconds: i64,
) -> Result<()> {
    require!(
        settlement_authority != Pubkey::default(),
        RenewError::InvalidAuthority
    );
    require!(
        protocol_fee_bps <= MAX_PROTOCOL_FEE_BPS,
        RenewError::InvalidProtocolFee
    );
    require!(
        payout_change_delay_seconds >= 0,
        RenewError::InvalidPayoutDelay
    );

    create_program_token_account(
        ctx.accounts.admin.to_account_info(),
        ctx.accounts.fee_vault.to_account_info(),
        ctx.accounts.settlement_mint.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.vault_authority.key(),
        &[FEE_VAULT_SEED, &[ctx.bumps.fee_vault]],
    )?;

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.settlement_authority = settlement_authority;
    config.settlement_mint = ctx.accounts.settlement_mint.key();
    config.fee_vault = ctx.accounts.fee_vault.key();
    config.fee_collector_token_account = ctx.accounts.fee_collector_token_account.key();
    config.protocol_fee_bps = protocol_fee_bps;
    config.payout_change_delay_seconds = payout_change_delay_seconds;
    config.bump = ctx.bumps.config;
    config.vault_authority_bump = ctx.bumps.vault_authority;

    Ok(())
}

pub fn update_protocol_fee(ctx: Context<AdminOnly>, protocol_fee_bps: u16) -> Result<()> {
    require!(
        protocol_fee_bps <= MAX_PROTOCOL_FEE_BPS,
        RenewError::InvalidProtocolFee
    );

    ctx.accounts.config.protocol_fee_bps = protocol_fee_bps;
    Ok(())
}

pub fn update_settlement_authority(
    ctx: Context<AdminOnly>,
    settlement_authority: Pubkey,
) -> Result<()> {
    require!(
        settlement_authority != Pubkey::default(),
        RenewError::InvalidAuthority
    );

    ctx.accounts.config.settlement_authority = settlement_authority;
    Ok(())
}

pub fn update_fee_collector_destination(
    ctx: Context<UpdateFeeCollectorDestination>,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.fee_collector_token_account.mint,
        ctx.accounts.config.settlement_mint,
        RenewError::SettlementMintMismatch
    );

    ctx.accounts.config.fee_collector_token_account = ctx.accounts.fee_collector_token_account.key();
    Ok(())
}

pub fn update_payout_change_delay(
    ctx: Context<AdminOnly>,
    payout_change_delay_seconds: i64,
) -> Result<()> {
    require!(
        payout_change_delay_seconds >= 0,
        RenewError::InvalidPayoutDelay
    );

    ctx.accounts.config.payout_change_delay_seconds = payout_change_delay_seconds;
    Ok(())
}

pub fn withdraw_protocol_fees(ctx: Context<WithdrawProtocolFees>, amount: u64) -> Result<()> {
    require!(amount > 0, RenewError::InvalidAmount);
    require!(
        ctx.accounts.fee_vault.amount >= amount,
        RenewError::InsufficientProtocolFees
    );

    transfer_with_vault_authority(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.fee_vault.to_account_info(),
        ctx.accounts.fee_collector_token_account.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        ctx.accounts.config.vault_authority_bump,
        amount,
    )?;

    emit!(ProtocolFeesWithdrawn {
        fee_collector_token_account: ctx.accounts.fee_collector_token_account.key(),
        amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(
        constraint = fee_collector_token_account.mint == settlement_mint.key()
            @ RenewError::SettlementMintMismatch
    )]
    pub fee_collector_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    /// CHECK: PDA authority for the shared settlement vaults.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        seeds = [FEE_VAULT_SEED],
        bump,
        mut
    )]
    /// CHECK: PDA token account is created and initialized by the program via create_program_token_account.
    pub fee_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateFeeCollectorDestination<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        constraint = fee_collector_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch
    )]
    pub fee_collector_token_account: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct WithdrawProtocolFees<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        mut,
        address = config.fee_vault,
        constraint = fee_vault.mint == config.settlement_mint @ RenewError::SettlementMintMismatch
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = config.fee_collector_token_account,
        constraint = fee_collector_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch
    )]
    pub fee_collector_token_account: Account<'info, TokenAccount>,
    /// CHECK: Shared PDA authority over the program vaults.
    #[account(seeds = [VAULT_AUTHORITY_SEED], bump = config.vault_authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}
