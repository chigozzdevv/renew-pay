use anchor_lang::prelude::*;

use crate::state::{BillingMode, ChargeSourceKind, SubscriptionStatus};

#[event]
pub struct MerchantCreated {
    pub merchant: Pubkey,
    pub merchant_id: [u8; 32],
    pub authority: Pubkey,
    pub payout_token_account: Pubkey,
    pub vault_token_account: Pubkey,
}

#[event]
pub struct MerchantAuthorityUpdated {
    pub merchant: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct MerchantBillingUpdated {
    pub merchant: Pubkey,
    pub billing_enabled: bool,
}

#[event]
pub struct PayoutDestinationUpdateRequested {
    pub merchant: Pubkey,
    pub current_payout_token_account: Pubkey,
    pub pending_payout_token_account: Pubkey,
    pub ready_at: i64,
}

#[event]
pub struct PayoutDestinationUpdateCancelled {
    pub merchant: Pubkey,
    pub cancelled_payout_token_account: Pubkey,
}

#[event]
pub struct PayoutDestinationUpdated {
    pub merchant: Pubkey,
    pub payout_token_account: Pubkey,
}

#[event]
pub struct PlanCreated {
    pub merchant: Pubkey,
    pub plan: Pubkey,
    pub plan_code_hash: [u8; 32],
    pub billing_mode: BillingMode,
    pub fixed_amount: u64,
    pub usage_rate: u64,
    pub active: bool,
}

#[event]
pub struct PlanUpdated {
    pub merchant: Pubkey,
    pub plan: Pubkey,
    pub billing_mode: BillingMode,
    pub fixed_amount: u64,
    pub usage_rate: u64,
    pub active: bool,
}

#[event]
pub struct SubscriptionCreated {
    pub merchant: Pubkey,
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscription_ref_hash: [u8; 32],
    pub customer_ref_hash: [u8; 32],
    pub next_charge_at: i64,
    pub billing_mode: BillingMode,
}

#[event]
pub struct SubscriptionMandateUpdated {
    pub merchant: Pubkey,
    pub subscription: Pubkey,
    pub mandate_hash: [u8; 32],
}

#[event]
pub struct SubscriptionStatusChanged {
    pub merchant: Pubkey,
    pub subscription: Pubkey,
    pub status: SubscriptionStatus,
}

#[event]
pub struct ChargeRecorded {
    pub merchant: Pubkey,
    pub source_kind: ChargeSourceKind,
    pub subscription: Option<Pubkey>,
    pub commercial_ref_hash: Option<[u8; 32]>,
    pub external_charge_ref_hash: [u8; 32],
    pub local_amount: u64,
    pub fx_rate_in_micros: u64,
    pub fx_quote_ref_hash: [u8; 32],
    pub fx_provider_ref_hash: [u8; 32],
    pub usdc_amount: u64,
    pub fee_amount: u64,
    pub usage_units: u64,
    pub billing_period_start: i64,
}

#[event]
pub struct ChargeFailed {
    pub merchant: Pubkey,
    pub source_kind: ChargeSourceKind,
    pub subscription: Option<Pubkey>,
    pub commercial_ref_hash: Option<[u8; 32]>,
    pub external_charge_ref_hash: [u8; 32],
    pub failure_code_hash: [u8; 32],
    pub billing_period_start: i64,
    pub retry_count: u8,
    pub status: SubscriptionStatus,
}

#[event]
pub struct SettlementCredited {
    pub merchant: Pubkey,
    pub source_kind: ChargeSourceKind,
    pub commercial_ref_hash: Option<[u8; 32]>,
    pub external_charge_ref_hash: [u8; 32],
    pub local_amount: u64,
    pub fx_rate_in_micros: u64,
    pub fx_quote_ref_hash: [u8; 32],
    pub fx_provider_ref_hash: [u8; 32],
    pub usdc_amount: u64,
    pub fee_amount: u64,
}

#[event]
pub struct MerchantWithdrawn {
    pub merchant: Pubkey,
    pub payout_token_account: Pubkey,
    pub amount: u64,
    pub remaining_available_balance: u64,
}

#[event]
pub struct ProtocolFeesWithdrawn {
    pub fee_collector_token_account: Pubkey,
    pub amount: u64,
}

pub fn emit_subscription_status_changed(
    merchant: Pubkey,
    subscription: Pubkey,
    status: SubscriptionStatus,
) {
    emit!(SubscriptionStatusChanged {
        merchant,
        subscription,
        status,
    });
}
