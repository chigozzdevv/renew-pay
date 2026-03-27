use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::{
    args::FxQuoteSnapshotArgs,
    constants::{CHARGE_SEED, CONFIG_SEED, CYCLE_SEED, LEDGER_SEED, MERCHANT_SEED, SUBSCRIPTION_SEED},
    errors::RenewError,
    events::{ChargeFailed, ChargeRecorded, SettlementCredited},
    state::{
        ChargeReceipt, ChargeSourceKind, ChargeStatus, Config, CycleMarker, Merchant,
        MerchantLedger, Subscription,
    },
    utils::{calculate_protocol_fee, transfer_from_settlement_source, transfer_with_merchant_authority},
    validation::{
        assert_chargeable, expected_usdc_amount, is_nonzero_id, register_charge_failure,
        validate_fx_quote_snapshot,
    },
};

#[allow(clippy::too_many_arguments)]
pub fn record_subscription_charge_success(
    ctx: Context<RecordSubscriptionChargeSuccess>,
    external_charge_ref_hash: [u8; 32],
    billing_period_start: i64,
    local_amount: u64,
    fx_quote: FxQuoteSnapshotArgs,
    usage_units: u64,
    usdc_amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        is_nonzero_id(&external_charge_ref_hash),
        RenewError::InvalidIdentifier
    );
    require!(local_amount > 0, RenewError::InvalidAmount);
    require!(fx_quote.fx_rate_in_micros > 0, RenewError::InvalidFxRate);
    require!(usdc_amount > 0, RenewError::InvalidAmount);
    validate_fx_quote_snapshot(&fx_quote)?;
    require!(
        ctx.accounts.merchant.billing_enabled,
        RenewError::BillingDisabled
    );

    let subscription = &mut ctx.accounts.subscription;
    assert_chargeable(subscription, billing_period_start, now)?;

    let expected_amount = expected_usdc_amount(subscription, usage_units)?;
    require!(
        expected_amount == usdc_amount,
        RenewError::ChargeAmountMismatch
    );

    let fee_amount = calculate_protocol_fee(usdc_amount, ctx.accounts.config.protocol_fee_bps)?;
    let net_amount = usdc_amount
        .checked_sub(fee_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;

    transfer_from_settlement_source(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts
            .settlement_source_token_account
            .to_account_info(),
        ctx.accounts.merchant_vault.to_account_info(),
        ctx.accounts.settlement_authority.to_account_info(),
        usdc_amount,
    )?;

    if fee_amount > 0 {
        transfer_with_merchant_authority(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.merchant_vault.to_account_info(),
            ctx.accounts.fee_vault.to_account_info(),
            ctx.accounts.merchant.to_account_info(),
            &ctx.accounts.merchant.merchant_id,
            ctx.accounts.merchant.bump,
            fee_amount,
        )?;
    }

    let ledger = &mut ctx.accounts.ledger;
    ledger.available_balance = ledger
        .available_balance
        .checked_add(net_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    ledger.total_settled = ledger
        .total_settled
        .checked_add(net_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    ledger.last_settlement_at = now;

    subscription.last_charge_at = now;
    subscription.next_charge_at = billing_period_start
        .checked_add(subscription.billing_interval_seconds as i64)
        .ok_or(RenewError::ArithmeticOverflow)?;
    subscription.retry_count = 0;
    subscription.retry_available_at = 0;

    let receipt = &mut ctx.accounts.charge_receipt;
    receipt.merchant = ctx.accounts.merchant.key();
    receipt.source_kind = ChargeSourceKind::Subscription;
    receipt.subscription = Some(subscription.key());
    receipt.commercial_ref_hash = None;
    receipt.external_charge_ref_hash = external_charge_ref_hash;
    receipt.failure_code_hash = None;
    receipt.settlement_source = ctx.accounts.settlement_source_token_account.key();
    receipt.local_amount = local_amount;
    receipt.fx_rate_in_micros = fx_quote.fx_rate_in_micros;
    receipt.fx_quote_ref_hash = Some(fx_quote.fx_quote_ref_hash);
    receipt.fx_provider_ref_hash = Some(fx_quote.fx_provider_ref_hash);
    receipt.quote_generated_at = fx_quote.quote_generated_at;
    receipt.quote_expires_at = fx_quote.quote_expires_at;
    receipt.usdc_amount = usdc_amount;
    receipt.fee_amount = fee_amount;
    receipt.usage_units = usage_units;
    receipt.billing_period_start = billing_period_start;
    receipt.processed_at = now;
    receipt.status = ChargeStatus::Executed;
    receipt.bump = ctx.bumps.charge_receipt;

    let cycle_marker = &mut ctx.accounts.cycle_marker;
    cycle_marker.subscription = subscription.key();
    cycle_marker.billing_period_start = billing_period_start;
    cycle_marker.bump = ctx.bumps.cycle_marker;

    emit!(ChargeRecorded {
        merchant: ctx.accounts.merchant.key(),
        source_kind: ChargeSourceKind::Subscription,
        subscription: Some(subscription.key()),
        commercial_ref_hash: None,
        external_charge_ref_hash,
        local_amount,
        fx_rate_in_micros: fx_quote.fx_rate_in_micros,
        fx_quote_ref_hash: fx_quote.fx_quote_ref_hash,
        fx_provider_ref_hash: fx_quote.fx_provider_ref_hash,
        usdc_amount,
        fee_amount,
        usage_units,
        billing_period_start,
    });

    Ok(())
}

pub fn record_subscription_charge_failure(
    ctx: Context<RecordSubscriptionChargeFailure>,
    external_charge_ref_hash: [u8; 32],
    billing_period_start: i64,
    failure_code_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        is_nonzero_id(&external_charge_ref_hash),
        RenewError::InvalidIdentifier
    );
    require!(
        is_nonzero_id(&failure_code_hash),
        RenewError::InvalidFailureCode
    );
    require!(
        ctx.accounts.merchant.billing_enabled,
        RenewError::BillingDisabled
    );

    let subscription = &mut ctx.accounts.subscription;
    assert_chargeable(subscription, billing_period_start, now)?;
    register_charge_failure(subscription, now)?;

    let receipt = &mut ctx.accounts.charge_receipt;
    receipt.merchant = ctx.accounts.merchant.key();
    receipt.source_kind = ChargeSourceKind::Subscription;
    receipt.subscription = Some(subscription.key());
    receipt.commercial_ref_hash = None;
    receipt.external_charge_ref_hash = external_charge_ref_hash;
    receipt.failure_code_hash = Some(failure_code_hash);
    receipt.settlement_source = Pubkey::default();
    receipt.local_amount = subscription.local_amount_snapshot;
    receipt.fx_rate_in_micros = 0;
    receipt.fx_quote_ref_hash = None;
    receipt.fx_provider_ref_hash = None;
    receipt.quote_generated_at = 0;
    receipt.quote_expires_at = 0;
    receipt.usdc_amount = 0;
    receipt.fee_amount = 0;
    receipt.usage_units = 0;
    receipt.billing_period_start = billing_period_start;
    receipt.processed_at = now;
    receipt.status = ChargeStatus::Failed;
    receipt.bump = ctx.bumps.charge_receipt;

    emit!(ChargeFailed {
        merchant: ctx.accounts.merchant.key(),
        source_kind: ChargeSourceKind::Subscription,
        subscription: Some(subscription.key()),
        commercial_ref_hash: None,
        external_charge_ref_hash,
        failure_code_hash,
        billing_period_start,
        retry_count: subscription.retry_count,
        status: subscription.status,
    });

    Ok(())
}

pub fn record_invoice_settlement(
    ctx: Context<RecordInvoiceSettlement>,
    external_charge_ref_hash: [u8; 32],
    commercial_ref_hash: [u8; 32],
    local_amount: u64,
    fx_quote: FxQuoteSnapshotArgs,
    usdc_amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        is_nonzero_id(&external_charge_ref_hash),
        RenewError::InvalidIdentifier
    );
    require!(
        is_nonzero_id(&commercial_ref_hash),
        RenewError::InvalidIdentifier
    );
    require!(local_amount > 0, RenewError::InvalidAmount);
    require!(fx_quote.fx_rate_in_micros > 0, RenewError::InvalidFxRate);
    require!(usdc_amount > 0, RenewError::InvalidAmount);
    validate_fx_quote_snapshot(&fx_quote)?;

    let fee_amount = calculate_protocol_fee(usdc_amount, ctx.accounts.config.protocol_fee_bps)?;
    let net_amount = usdc_amount
        .checked_sub(fee_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;

    transfer_from_settlement_source(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts
            .settlement_source_token_account
            .to_account_info(),
        ctx.accounts.merchant_vault.to_account_info(),
        ctx.accounts.settlement_authority.to_account_info(),
        usdc_amount,
    )?;

    if fee_amount > 0 {
        transfer_with_merchant_authority(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.merchant_vault.to_account_info(),
            ctx.accounts.fee_vault.to_account_info(),
            ctx.accounts.merchant.to_account_info(),
            &ctx.accounts.merchant.merchant_id,
            ctx.accounts.merchant.bump,
            fee_amount,
        )?;
    }

    let ledger = &mut ctx.accounts.ledger;
    ledger.available_balance = ledger
        .available_balance
        .checked_add(net_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    ledger.total_settled = ledger
        .total_settled
        .checked_add(net_amount)
        .ok_or(RenewError::ArithmeticOverflow)?;
    ledger.last_settlement_at = now;

    let receipt = &mut ctx.accounts.charge_receipt;
    receipt.merchant = ctx.accounts.merchant.key();
    receipt.source_kind = ChargeSourceKind::Invoice;
    receipt.subscription = None;
    receipt.commercial_ref_hash = Some(commercial_ref_hash);
    receipt.external_charge_ref_hash = external_charge_ref_hash;
    receipt.failure_code_hash = None;
    receipt.settlement_source = ctx.accounts.settlement_source_token_account.key();
    receipt.local_amount = local_amount;
    receipt.fx_rate_in_micros = fx_quote.fx_rate_in_micros;
    receipt.fx_quote_ref_hash = Some(fx_quote.fx_quote_ref_hash);
    receipt.fx_provider_ref_hash = Some(fx_quote.fx_provider_ref_hash);
    receipt.quote_generated_at = fx_quote.quote_generated_at;
    receipt.quote_expires_at = fx_quote.quote_expires_at;
    receipt.usdc_amount = usdc_amount;
    receipt.fee_amount = fee_amount;
    receipt.usage_units = 0;
    receipt.billing_period_start = now;
    receipt.processed_at = now;
    receipt.status = ChargeStatus::Executed;
    receipt.bump = ctx.bumps.charge_receipt;

    emit!(SettlementCredited {
        merchant: ctx.accounts.merchant.key(),
        source_kind: ChargeSourceKind::Invoice,
        commercial_ref_hash: Some(commercial_ref_hash),
        external_charge_ref_hash,
        local_amount,
        fx_rate_in_micros: fx_quote.fx_rate_in_micros,
        fx_quote_ref_hash: fx_quote.fx_quote_ref_hash,
        fx_provider_ref_hash: fx_quote.fx_provider_ref_hash,
        usdc_amount,
        fee_amount,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(external_charge_ref_hash: [u8; 32], billing_period_start: i64)]
pub struct RecordSubscriptionChargeSuccess<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.settlement_authority == settlement_authority.key()
            @ RenewError::Unauthorized
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub settlement_authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump
    )]
    pub merchant: Box<Account<'info, Merchant>>,
    #[account(
        mut,
        seeds = [LEDGER_SEED, merchant.merchant_id.as_ref()],
        bump = ledger.bump,
        constraint = ledger.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub ledger: Box<Account<'info, MerchantLedger>>,
    #[account(
        mut,
        seeds = [
            SUBSCRIPTION_SEED,
            merchant.merchant_id.as_ref(),
            subscription.subscription_ref_hash.as_ref()
        ],
        bump = subscription.bump,
        constraint = subscription.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub subscription: Box<Account<'info, Subscription>>,
    #[account(
        init,
        payer = settlement_authority,
        space = 8 + ChargeReceipt::LEN,
        seeds = [
            CHARGE_SEED,
            merchant.merchant_id.as_ref(),
            external_charge_ref_hash.as_ref()
        ],
        bump
    )]
    pub charge_receipt: Box<Account<'info, ChargeReceipt>>,
    #[account(
        init,
        payer = settlement_authority,
        space = 8 + CycleMarker::LEN,
        seeds = [
            CYCLE_SEED,
            subscription.subscription_ref_hash.as_ref(),
            &billing_period_start.to_le_bytes()
        ],
        bump
    )]
    pub cycle_marker: Box<Account<'info, CycleMarker>>,
    #[account(
        mut,
        address = merchant.vault_token_account,
        constraint = merchant_vault.mint == config.settlement_mint @ RenewError::SettlementMintMismatch
    )]
    pub merchant_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        address = config.fee_vault,
        constraint = fee_vault.mint == config.settlement_mint @ RenewError::SettlementMintMismatch
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = settlement_source_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch,
        constraint = settlement_source_token_account.owner == settlement_authority.key()
            @ RenewError::Unauthorized
    )]
    pub settlement_source_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_charge_ref_hash: [u8; 32], _billing_period_start: i64)]
pub struct RecordSubscriptionChargeFailure<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.settlement_authority == settlement_authority.key()
            @ RenewError::Unauthorized
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub settlement_authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump
    )]
    pub merchant: Box<Account<'info, Merchant>>,
    #[account(
        mut,
        seeds = [
            SUBSCRIPTION_SEED,
            merchant.merchant_id.as_ref(),
            subscription.subscription_ref_hash.as_ref()
        ],
        bump = subscription.bump,
        constraint = subscription.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub subscription: Box<Account<'info, Subscription>>,
    #[account(
        init,
        payer = settlement_authority,
        space = 8 + ChargeReceipt::LEN,
        seeds = [
            CHARGE_SEED,
            merchant.merchant_id.as_ref(),
            external_charge_ref_hash.as_ref()
        ],
        bump
    )]
    pub charge_receipt: Box<Account<'info, ChargeReceipt>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_charge_ref_hash: [u8; 32])]
pub struct RecordInvoiceSettlement<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.settlement_authority == settlement_authority.key()
            @ RenewError::Unauthorized
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub settlement_authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump
    )]
    pub merchant: Box<Account<'info, Merchant>>,
    #[account(
        mut,
        seeds = [LEDGER_SEED, merchant.merchant_id.as_ref()],
        bump = ledger.bump,
        constraint = ledger.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub ledger: Box<Account<'info, MerchantLedger>>,
    #[account(
        init,
        payer = settlement_authority,
        space = 8 + ChargeReceipt::LEN,
        seeds = [
            CHARGE_SEED,
            merchant.merchant_id.as_ref(),
            external_charge_ref_hash.as_ref()
        ],
        bump
    )]
    pub charge_receipt: Box<Account<'info, ChargeReceipt>>,
    #[account(
        mut,
        address = merchant.vault_token_account,
        constraint = merchant_vault.mint == config.settlement_mint @ RenewError::SettlementMintMismatch
    )]
    pub merchant_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        address = config.fee_vault,
        constraint = fee_vault.mint == config.settlement_mint @ RenewError::SettlementMintMismatch
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = settlement_source_token_account.mint == config.settlement_mint
            @ RenewError::SettlementMintMismatch,
        constraint = settlement_source_token_account.owner == settlement_authority.key()
            @ RenewError::Unauthorized
    )]
    pub settlement_source_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
