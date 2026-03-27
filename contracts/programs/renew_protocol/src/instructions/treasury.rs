use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::{
    constants::{CONFIG_SEED, LEDGER_SEED, MERCHANT_SEED},
    errors::RenewError,
    events::MerchantWithdrawn,
    state::{Config, Merchant, MerchantLedger},
    utils::transfer_with_merchant_authority,
};

pub fn withdraw(ctx: Context<WithdrawMerchantBalance>, amount: u64) -> Result<()> {
    require!(amount > 0, RenewError::InvalidAmount);

    let ledger = &mut ctx.accounts.ledger;
    require!(
        ledger.available_balance >= amount,
        RenewError::InsufficientMerchantBalance
    );

    transfer_with_merchant_authority(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.merchant_vault.to_account_info(),
        ctx.accounts.payout_token_account.to_account_info(),
        ctx.accounts.merchant.to_account_info(),
        &ctx.accounts.merchant.merchant_id,
        ctx.accounts.merchant.bump,
        amount,
    )?;

    ledger.available_balance = ledger
        .available_balance
        .checked_sub(amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    ledger.total_withdrawn = ledger
        .total_withdrawn
        .checked_add(amount)
        .ok_or(RenewError::ArithmeticOverflow)?;

    emit!(MerchantWithdrawn {
        merchant: ctx.accounts.merchant.key(),
        payout_token_account: ctx.accounts.payout_token_account.key(),
        amount,
        remaining_available_balance: ledger.available_balance,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawMerchantBalance<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        mut,
        seeds = [LEDGER_SEED, merchant.merchant_id.as_ref()],
        bump = ledger.bump,
        constraint = ledger.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub ledger: Account<'info, MerchantLedger>,
    #[account(
        mut,
        address = merchant.vault_token_account,
        constraint = merchant_vault.mint == config.settlement_mint @ RenewError::SettlementMintMismatch
    )]
    pub merchant_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = merchant.payout_token_account,
        constraint = payout_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch
    )]
    pub payout_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
