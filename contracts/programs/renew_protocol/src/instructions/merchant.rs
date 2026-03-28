use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{
        CONFIG_SEED, LEDGER_SEED, MERCHANT_SEED, MERCHANT_VAULT_SEED,
    },
    errors::RenewError,
    events::{
        MerchantAuthorityUpdated, MerchantBillingUpdated, MerchantCreated,
        PayoutDestinationUpdateCancelled, PayoutDestinationUpdateRequested,
        PayoutDestinationUpdated,
    },
    state::{Config, Merchant, MerchantLedger},
    utils::{clear_pending_payout_destination_update, create_program_token_account, prepare_payout_destination_update},
    validation::is_nonzero_id,
};

pub fn create_merchant(
    ctx: Context<CreateMerchant>,
    merchant_id: [u8; 32],
    metadata_hash: [u8; 32],
) -> Result<()> {
    require!(is_nonzero_id(&merchant_id), RenewError::InvalidIdentifier);

    create_program_token_account(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.merchant_vault.to_account_info(),
        ctx.accounts.settlement_mint.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.merchant.key(),
        &[MERCHANT_VAULT_SEED, merchant_id.as_ref(), &[ctx.bumps.merchant_vault]],
    )?;

    let merchant = &mut ctx.accounts.merchant;
    merchant.merchant_id = merchant_id;
    merchant.authority = ctx.accounts.authority.key();
    merchant.payout_token_account = ctx.accounts.payout_token_account.key();
    merchant.pending_payout_token_account = None;
    merchant.metadata_hash = metadata_hash;
    merchant.billing_enabled = true;
    merchant.payout_change_ready_at = 0;
    merchant.vault_token_account = ctx.accounts.merchant_vault.key();
    merchant.bump = ctx.bumps.merchant;

    let ledger = &mut ctx.accounts.ledger;
    ledger.merchant = merchant.key();
    ledger.available_balance = 0;
    ledger.total_settled = 0;
    ledger.total_withdrawn = 0;
    ledger.last_settlement_at = 0;
    ledger.bump = ctx.bumps.ledger;

    emit!(MerchantCreated {
        merchant: merchant.key(),
        merchant_id,
        authority: merchant.authority,
        payout_token_account: merchant.payout_token_account,
        vault_token_account: merchant.vault_token_account,
    });

    Ok(())
}

pub fn update_merchant_authority(
    ctx: Context<MerchantAuthorityOnly>,
    new_authority: Pubkey,
) -> Result<()> {
    require!(
        new_authority != Pubkey::default(),
        RenewError::InvalidAuthority
    );

    let previous_authority = ctx.accounts.merchant.authority;
    ctx.accounts.merchant.authority = new_authority;

    emit!(MerchantAuthorityUpdated {
        merchant: ctx.accounts.merchant.key(),
        previous_authority,
        new_authority,
    });

    Ok(())
}

pub fn set_merchant_billing_enabled(
    ctx: Context<SetMerchantBillingEnabled>,
    billing_enabled: bool,
) -> Result<()> {
    ctx.accounts.merchant.billing_enabled = billing_enabled;

    emit!(MerchantBillingUpdated {
        merchant: ctx.accounts.merchant.key(),
        billing_enabled,
    });

    Ok(())
}

pub fn request_payout_destination_update(
    ctx: Context<RequestPayoutDestinationUpdate>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let merchant = &mut ctx.accounts.merchant;

    prepare_payout_destination_update(
        merchant,
        ctx.accounts.new_payout_token_account.key(),
        ctx.accounts.config.payout_change_delay_seconds,
        now,
    )?;

    emit!(PayoutDestinationUpdateRequested {
        merchant: merchant.key(),
        current_payout_token_account: merchant.payout_token_account,
        pending_payout_token_account: merchant
            .pending_payout_token_account
            .ok_or(RenewError::NoPendingPayoutDestination)?,
        ready_at: merchant.payout_change_ready_at,
    });

    Ok(())
}

pub fn cancel_payout_destination_update(ctx: Context<MerchantAuthorityOnly>) -> Result<()> {
    let merchant = &mut ctx.accounts.merchant;
    let cancelled_payout_token_account = clear_pending_payout_destination_update(merchant)?;

    emit!(PayoutDestinationUpdateCancelled {
        merchant: merchant.key(),
        cancelled_payout_token_account,
    });

    Ok(())
}

pub fn confirm_payout_destination_update(ctx: Context<MerchantAuthorityOnly>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let merchant = &mut ctx.accounts.merchant;
    let pending = merchant
        .pending_payout_token_account
        .ok_or(RenewError::NoPendingPayoutDestination)?;

    require!(
        now >= merchant.payout_change_ready_at,
        RenewError::PayoutChangeNotReady
    );

    merchant.payout_token_account = pending;
    merchant.pending_payout_token_account = None;
    merchant.payout_change_ready_at = 0;

    emit!(PayoutDestinationUpdated {
        merchant: merchant.key(),
        payout_token_account: merchant.payout_token_account,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(merchant_id: [u8; 32])]
pub struct CreateMerchant<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = config.settlement_mint @ RenewError::SettlementMintMismatch)]
    pub settlement_mint: Account<'info, Mint>,
    #[account(
        constraint = payout_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch
    )]
    pub payout_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + Merchant::LEN,
        seeds = [MERCHANT_SEED, merchant_id.as_ref()],
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        init,
        payer = payer,
        space = 8 + MerchantLedger::LEN,
        seeds = [LEDGER_SEED, merchant_id.as_ref()],
        bump
    )]
    pub ledger: Account<'info, MerchantLedger>,
    #[account(
        seeds = [MERCHANT_VAULT_SEED, merchant_id.as_ref()],
        bump,
        mut
    )]
    /// CHECK: PDA token account is created and initialized by the program via create_program_token_account.
    pub merchant_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MerchantAuthorityOnly<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
}

#[derive(Accounts)]
pub struct SetMerchantBillingEnabled<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump
    )]
    pub merchant: Account<'info, Merchant>,
}

#[derive(Accounts)]
pub struct RequestPayoutDestinationUpdate<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        constraint = new_payout_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch
    )]
    pub new_payout_token_account: Account<'info, TokenAccount>,
}
