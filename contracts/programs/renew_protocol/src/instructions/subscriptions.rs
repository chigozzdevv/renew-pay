use anchor_lang::prelude::*;

use crate::{
    args::SubscriptionArgs,
    constants::{MERCHANT_SEED, PLAN_SEED, SUBSCRIPTION_SEED},
    errors::RenewError,
    events::{emit_subscription_status_changed, SubscriptionCreated, SubscriptionMandateUpdated},
    state::{Merchant, Plan, Subscription, SubscriptionStatus},
    validation::{is_nonzero_currency, is_nonzero_id, set_subscription_status},
};

pub fn create_subscription(
    ctx: Context<CreateSubscription>,
    subscription_ref_hash: [u8; 32],
    args: SubscriptionArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        ctx.accounts.merchant.billing_enabled,
        RenewError::BillingDisabled
    );
    require!(ctx.accounts.plan.active, RenewError::PlanInactive);
    require!(
        is_nonzero_id(&subscription_ref_hash)
            && is_nonzero_id(&args.customer_ref_hash)
            && is_nonzero_id(&args.mandate_hash)
            && is_nonzero_currency(&args.billing_currency),
        RenewError::InvalidIdentifier
    );

    if let Some(first_charge_at) = args.first_charge_at {
        require!(first_charge_at >= now, RenewError::InvalidTimestamp);
    }

    let schedule_start = args
        .first_charge_at
        .unwrap_or(now + ctx.accounts.plan.trial_period_seconds as i64);

    let subscription = &mut ctx.accounts.subscription;
    subscription.merchant = ctx.accounts.merchant.key();
    subscription.plan = ctx.accounts.plan.key();
    subscription.subscription_ref_hash = subscription_ref_hash;
    subscription.customer_ref_hash = args.customer_ref_hash;
    subscription.mandate_hash = args.mandate_hash;
    subscription.billing_currency = args.billing_currency;
    subscription.status = SubscriptionStatus::Active;
    subscription.billing_mode = ctx.accounts.plan.billing_mode;
    subscription.fixed_amount = ctx.accounts.plan.fixed_amount;
    subscription.usage_rate = ctx.accounts.plan.usage_rate;
    subscription.local_amount_snapshot = args.local_amount_snapshot;
    subscription.billing_interval_seconds = ctx.accounts.plan.billing_interval_seconds;
    subscription.retry_window_seconds = ctx.accounts.plan.retry_window_seconds;
    subscription.max_retry_count = ctx.accounts.plan.max_retry_count;
    subscription.retry_count = 0;
    subscription.next_charge_at = schedule_start;
    subscription.last_charge_at = 0;
    subscription.retry_available_at = 0;
    subscription.created_at = now;
    subscription.bump = ctx.bumps.subscription;

    emit!(SubscriptionCreated {
        merchant: subscription.merchant,
        subscription: subscription.key(),
        plan: subscription.plan,
        subscription_ref_hash,
        customer_ref_hash: subscription.customer_ref_hash,
        next_charge_at: subscription.next_charge_at,
        billing_mode: subscription.billing_mode,
    });

    Ok(())
}

pub fn update_subscription_mandate(
    ctx: Context<MerchantSubscriptionAuthority>,
    mandate_hash: [u8; 32],
) -> Result<()> {
    require!(is_nonzero_id(&mandate_hash), RenewError::InvalidIdentifier);

    ctx.accounts.subscription.mandate_hash = mandate_hash;

    emit!(SubscriptionMandateUpdated {
        merchant: ctx.accounts.merchant.key(),
        subscription: ctx.accounts.subscription.key(),
        mandate_hash,
    });

    Ok(())
}

pub fn pause_subscription(ctx: Context<MerchantSubscriptionAuthority>) -> Result<()> {
    set_subscription_status(&mut ctx.accounts.subscription, SubscriptionStatus::Paused);
    emit_subscription_status_changed(
        ctx.accounts.merchant.key(),
        ctx.accounts.subscription.key(),
        ctx.accounts.subscription.status,
    );
    Ok(())
}

pub fn resume_subscription(
    ctx: Context<MerchantSubscriptionAuthority>,
    next_charge_at: Option<i64>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let subscription = &mut ctx.accounts.subscription;
    require!(
        ctx.accounts.merchant.billing_enabled,
        RenewError::BillingDisabled
    );
    require!(
        subscription.status != SubscriptionStatus::Cancelled,
        RenewError::SubscriptionCancelled
    );

    subscription.status = SubscriptionStatus::Active;
    subscription.next_charge_at = next_charge_at.unwrap_or(now);
    subscription.retry_count = 0;
    subscription.retry_available_at = 0;

    emit_subscription_status_changed(
        ctx.accounts.merchant.key(),
        ctx.accounts.subscription.key(),
        ctx.accounts.subscription.status,
    );

    Ok(())
}

pub fn cancel_subscription(ctx: Context<MerchantSubscriptionAuthority>) -> Result<()> {
    set_subscription_status(
        &mut ctx.accounts.subscription,
        SubscriptionStatus::Cancelled,
    );
    emit_subscription_status_changed(
        ctx.accounts.merchant.key(),
        ctx.accounts.subscription.key(),
        ctx.accounts.subscription.status,
    );
    Ok(())
}

#[derive(Accounts)]
#[instruction(subscription_ref_hash: [u8; 32])]
pub struct CreateSubscription<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        seeds = [PLAN_SEED, merchant.merchant_id.as_ref(), plan.plan_code_hash.as_ref()],
        bump = plan.bump,
        constraint = plan.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub plan: Account<'info, Plan>,
    #[account(
        init,
        payer = authority,
        space = 8 + Subscription::LEN,
        seeds = [
            SUBSCRIPTION_SEED,
            merchant.merchant_id.as_ref(),
            subscription_ref_hash.as_ref()
        ],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MerchantSubscriptionAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
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
    pub subscription: Account<'info, Subscription>,
}
