#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

pub mod args;
pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;
pub mod validation;

pub use args::*;
pub use errors::*;
pub use events::*;
pub use instructions::{
    AdminOnly, CreateMerchant, CreatePlan, CreateSubscription, InitializeConfig,
    MerchantAuthorityOnly, MerchantSubscriptionAuthority, RecordInvoiceSettlement,
    RecordSubscriptionChargeFailure, RecordSubscriptionChargeSuccess,
    RequestPayoutDestinationUpdate, SetMerchantBillingEnabled, UpdateFeeCollectorDestination,
    UpdatePlan, WithdrawMerchantBalance, WithdrawProtocolFees,
};
pub(crate) use instructions::admin::{
    __client_accounts_admin_only, __client_accounts_initialize_config,
    __client_accounts_update_fee_collector_destination, __client_accounts_withdraw_protocol_fees,
};
pub(crate) use instructions::merchant::{
    __client_accounts_create_merchant, __client_accounts_merchant_authority_only,
    __client_accounts_request_payout_destination_update,
    __client_accounts_set_merchant_billing_enabled,
};
pub(crate) use instructions::plans::{
    __client_accounts_create_plan, __client_accounts_update_plan,
};
pub(crate) use instructions::settlement::{
    __client_accounts_record_invoice_settlement,
    __client_accounts_record_subscription_charge_failure,
    __client_accounts_record_subscription_charge_success,
};
pub(crate) use instructions::subscriptions::{
    __client_accounts_create_subscription,
    __client_accounts_merchant_subscription_authority,
};
pub(crate) use instructions::treasury::__client_accounts_withdraw_merchant_balance;
pub use state::{
    BillingMode, ChargeReceipt, ChargeSourceKind, ChargeStatus, Config, CycleMarker, Merchant,
    MerchantLedger, Plan, Subscription, SubscriptionStatus,
};

declare_id!("BvDY6tUDwfsfVSVenC9fPg4ohNMuYm2kFiePSysWJyua");

#[program]
pub mod renew_protocol {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        settlement_authority: Pubkey,
        protocol_fee_bps: u16,
        payout_change_delay_seconds: i64,
    ) -> Result<()> {
        instructions::admin::initialize_config(
            ctx,
            settlement_authority,
            protocol_fee_bps,
            payout_change_delay_seconds,
        )
    }

    pub fn update_protocol_fee(ctx: Context<AdminOnly>, protocol_fee_bps: u16) -> Result<()> {
        instructions::admin::update_protocol_fee(ctx, protocol_fee_bps)
    }

    pub fn update_settlement_authority(
        ctx: Context<AdminOnly>,
        settlement_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::update_settlement_authority(ctx, settlement_authority)
    }

    pub fn update_fee_collector_destination(
        ctx: Context<UpdateFeeCollectorDestination>,
    ) -> Result<()> {
        instructions::admin::update_fee_collector_destination(ctx)
    }

    pub fn update_payout_change_delay(
        ctx: Context<AdminOnly>,
        payout_change_delay_seconds: i64,
    ) -> Result<()> {
        instructions::admin::update_payout_change_delay(ctx, payout_change_delay_seconds)
    }

    pub fn create_merchant(
        ctx: Context<CreateMerchant>,
        merchant_id: [u8; 32],
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        instructions::merchant::create_merchant(ctx, merchant_id, metadata_hash)
    }

    pub fn update_merchant_authority(
        ctx: Context<MerchantAuthorityOnly>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::merchant::update_merchant_authority(ctx, new_authority)
    }

    pub fn set_merchant_billing_enabled(
        ctx: Context<SetMerchantBillingEnabled>,
        billing_enabled: bool,
    ) -> Result<()> {
        instructions::merchant::set_merchant_billing_enabled(ctx, billing_enabled)
    }

    pub fn request_payout_destination_update(
        ctx: Context<RequestPayoutDestinationUpdate>,
    ) -> Result<()> {
        instructions::merchant::request_payout_destination_update(ctx)
    }

    pub fn cancel_payout_destination_update(ctx: Context<MerchantAuthorityOnly>) -> Result<()> {
        instructions::merchant::cancel_payout_destination_update(ctx)
    }

    pub fn confirm_payout_destination_update(ctx: Context<MerchantAuthorityOnly>) -> Result<()> {
        instructions::merchant::confirm_payout_destination_update(ctx)
    }

    pub fn create_plan(
        ctx: Context<CreatePlan>,
        plan_code_hash: [u8; 32],
        args: PlanTermsArgs,
    ) -> Result<()> {
        instructions::plans::create_plan(ctx, plan_code_hash, args)
    }

    pub fn update_plan(ctx: Context<UpdatePlan>, args: PlanTermsArgs, active: bool) -> Result<()> {
        instructions::plans::update_plan(ctx, args, active)
    }

    pub fn create_subscription(
        ctx: Context<CreateSubscription>,
        subscription_ref_hash: [u8; 32],
        args: SubscriptionArgs,
    ) -> Result<()> {
        instructions::subscriptions::create_subscription(ctx, subscription_ref_hash, args)
    }

    pub fn update_subscription_mandate(
        ctx: Context<MerchantSubscriptionAuthority>,
        mandate_hash: [u8; 32],
    ) -> Result<()> {
        instructions::subscriptions::update_subscription_mandate(ctx, mandate_hash)
    }

    pub fn pause_subscription(ctx: Context<MerchantSubscriptionAuthority>) -> Result<()> {
        instructions::subscriptions::pause_subscription(ctx)
    }

    pub fn resume_subscription(
        ctx: Context<MerchantSubscriptionAuthority>,
        next_charge_at: Option<i64>,
    ) -> Result<()> {
        instructions::subscriptions::resume_subscription(ctx, next_charge_at)
    }

    pub fn cancel_subscription(ctx: Context<MerchantSubscriptionAuthority>) -> Result<()> {
        instructions::subscriptions::cancel_subscription(ctx)
    }

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
        instructions::settlement::record_subscription_charge_success(
            ctx,
            external_charge_ref_hash,
            billing_period_start,
            local_amount,
            fx_quote,
            usage_units,
            usdc_amount,
        )
    }

    pub fn record_subscription_charge_failure(
        ctx: Context<RecordSubscriptionChargeFailure>,
        external_charge_ref_hash: [u8; 32],
        billing_period_start: i64,
        failure_code_hash: [u8; 32],
    ) -> Result<()> {
        instructions::settlement::record_subscription_charge_failure(
            ctx,
            external_charge_ref_hash,
            billing_period_start,
            failure_code_hash,
        )
    }

    pub fn record_invoice_settlement(
        ctx: Context<RecordInvoiceSettlement>,
        external_charge_ref_hash: [u8; 32],
        commercial_ref_hash: [u8; 32],
        local_amount: u64,
        fx_quote: FxQuoteSnapshotArgs,
        usdc_amount: u64,
    ) -> Result<()> {
        instructions::settlement::record_invoice_settlement(
            ctx,
            external_charge_ref_hash,
            commercial_ref_hash,
            local_amount,
            fx_quote,
            usdc_amount,
        )
    }

    pub fn withdraw(ctx: Context<WithdrawMerchantBalance>, amount: u64) -> Result<()> {
        instructions::treasury::withdraw(ctx, amount)
    }

    pub fn withdraw_protocol_fees(ctx: Context<WithdrawProtocolFees>, amount: u64) -> Result<()> {
        instructions::admin::withdraw_protocol_fees(ctx, amount)
    }
}
