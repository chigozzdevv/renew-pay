mod common;

use common::*;
use renew_protocol::{
    ChargeReceipt, ChargeSourceKind, ChargeStatus, Merchant, MerchantLedger, Subscription,
};
use serial_test::serial;

#[serial(integration)]
#[tokio::test]
async fn end_to_end_charge_and_withdraw_flow() {
    let mut harness = Harness::start().await;

    harness.initialize_config(PROTOCOL_FEE_BPS, 0).await;
    harness.create_merchant().await;
    harness.create_default_plan(3).await;
    harness.create_default_subscription().await;

    let subscription: Subscription = harness.get_anchor_account(harness.subscription_pda).await;
    let billing_period_start = subscription.next_charge_at;

    harness.mint_to_settlement_source(FIXED_USDC_AMOUNT).await;

    harness
        .record_subscription_charge_success(
            EXTERNAL_CHARGE_HASH,
            billing_period_start,
            LOCAL_AMOUNT,
            fx_quote_snapshot(),
            0,
            FIXED_USDC_AMOUNT,
        )
        .await;

    let merchant: Merchant = harness.get_anchor_account(harness.merchant_pda).await;
    let ledger: MerchantLedger = harness.get_anchor_account(harness.ledger_pda).await;
    let receipt: ChargeReceipt = harness
        .get_anchor_account(harness.charge_pda(EXTERNAL_CHARGE_HASH))
        .await;
    let merchant_vault_amount = harness.token_amount(harness.merchant_vault).await;
    let fee_vault_amount = harness.token_amount(harness.fee_vault).await;

    assert_eq!(merchant.vault_token_account, harness.merchant_vault);
    assert_eq!(ledger.available_balance, EXPECTED_NET_AMOUNT);
    assert_eq!(ledger.total_settled, EXPECTED_NET_AMOUNT);
    assert_eq!(merchant_vault_amount, EXPECTED_NET_AMOUNT);
    assert_eq!(fee_vault_amount, EXPECTED_FEE_AMOUNT);
    assert_eq!(receipt.status, ChargeStatus::Executed);
    assert_eq!(receipt.source_kind, ChargeSourceKind::Subscription);
    assert_eq!(receipt.commercial_ref_hash, None);
    assert_eq!(receipt.local_amount, LOCAL_AMOUNT);
    assert_eq!(receipt.fx_rate_in_micros, FX_RATE_IN_MICROS);
    assert_eq!(receipt.fx_quote_ref_hash, Some(FX_QUOTE_REF_HASH));
    assert_eq!(receipt.fx_provider_ref_hash, Some(FX_PROVIDER_REF_HASH));
    assert_eq!(receipt.quote_generated_at, QUOTE_GENERATED_AT);
    assert_eq!(receipt.quote_expires_at, QUOTE_EXPIRES_AT);
    assert_eq!(receipt.fee_amount, EXPECTED_FEE_AMOUNT);
    assert_eq!(receipt.usdc_amount, FIXED_USDC_AMOUNT);

    harness.withdraw(EXPECTED_NET_AMOUNT).await;
    harness.withdraw_protocol_fees(EXPECTED_FEE_AMOUNT).await;

    let updated_ledger: MerchantLedger = harness.get_anchor_account(harness.ledger_pda).await;
    let payout_amount = harness.token_amount(harness.payout_ata).await;
    let fee_collector_amount = harness.token_amount(harness.fee_collector_ata).await;

    assert_eq!(updated_ledger.available_balance, 0);
    assert_eq!(updated_ledger.total_withdrawn, EXPECTED_NET_AMOUNT);
    assert_eq!(payout_amount, EXPECTED_NET_AMOUNT);
    assert_eq!(fee_collector_amount, EXPECTED_FEE_AMOUNT);
}
