use anchor_lang::prelude::*;

use crate::{
    args::PlanTermsArgs,
    constants::{MERCHANT_SEED, PLAN_SEED},
    errors::RenewError,
    events::{PlanCreated, PlanUpdated},
    state::{Merchant, Plan},
    validation::{is_nonzero_id, validate_plan_terms},
};

pub fn create_plan(
    ctx: Context<CreatePlan>,
    plan_code_hash: [u8; 32],
    args: PlanTermsArgs,
) -> Result<()> {
    require!(
        ctx.accounts.merchant.billing_enabled,
        RenewError::BillingDisabled
    );
    require!(
        is_nonzero_id(&plan_code_hash),
        RenewError::InvalidIdentifier
    );

    validate_plan_terms(&args)?;

    let plan = &mut ctx.accounts.plan;
    plan.merchant = ctx.accounts.merchant.key();
    plan.plan_code_hash = plan_code_hash;
    plan.fixed_amount = args.fixed_amount;
    plan.usage_rate = args.usage_rate;
    plan.billing_interval_seconds = args.billing_interval_seconds;
    plan.trial_period_seconds = args.trial_period_seconds;
    plan.retry_window_seconds = args.retry_window_seconds;
    plan.max_retry_count = args.max_retry_count;
    plan.billing_mode = args.billing_mode;
    plan.active = true;
    plan.created_at = Clock::get()?.unix_timestamp;
    plan.bump = ctx.bumps.plan;

    emit!(PlanCreated {
        merchant: plan.merchant,
        plan: plan.key(),
        plan_code_hash,
        billing_mode: plan.billing_mode,
        fixed_amount: plan.fixed_amount,
        usage_rate: plan.usage_rate,
        active: plan.active,
    });

    Ok(())
}

pub fn update_plan(ctx: Context<UpdatePlan>, args: PlanTermsArgs, active: bool) -> Result<()> {
    validate_plan_terms(&args)?;

    let plan = &mut ctx.accounts.plan;
    plan.fixed_amount = args.fixed_amount;
    plan.usage_rate = args.usage_rate;
    plan.billing_interval_seconds = args.billing_interval_seconds;
    plan.trial_period_seconds = args.trial_period_seconds;
    plan.retry_window_seconds = args.retry_window_seconds;
    plan.max_retry_count = args.max_retry_count;
    plan.billing_mode = args.billing_mode;
    plan.active = active;

    emit!(PlanUpdated {
        merchant: plan.merchant,
        plan: plan.key(),
        billing_mode: plan.billing_mode,
        fixed_amount: plan.fixed_amount,
        usage_rate: plan.usage_rate,
        active: plan.active,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(plan_code_hash: [u8; 32])]
pub struct CreatePlan<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        init,
        payer = payer,
        space = 8 + Plan::LEN,
        seeds = [PLAN_SEED, merchant.merchant_id.as_ref(), plan_code_hash.as_ref()],
        bump
    )]
    pub plan: Account<'info, Plan>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlan<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [MERCHANT_SEED, merchant.merchant_id.as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key() @ RenewError::Unauthorized
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        mut,
        seeds = [PLAN_SEED, merchant.merchant_id.as_ref(), plan.plan_code_hash.as_ref()],
        bump = plan.bump,
        constraint = plan.merchant == merchant.key() @ RenewError::MerchantMismatch
    )]
    pub plan: Account<'info, Plan>,
}
