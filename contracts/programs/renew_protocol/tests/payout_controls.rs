mod common;

use common::*;
use renew_protocol::{
    ChargeReceipt, ChargeSourceKind, ChargeStatus, Merchant, Subscription, SubscriptionStatus,
};
use serial_test::serial;

#[serial(integration)]
#[tokio::test]
async fn payout_change_and_retry_exhaustion_flow() {
    let mut harness = Harness::start().await;

    harness.initialize_config(PROTOCOL_FEE_BPS, 0).await;
    harness.create_merchant().await;

    let next_payout_ata = harness.create_token_account_for_merchant().await;

    harness.request_payout_destination_update(next_payout_ata).await;

    let merchant_with_pending: Merchant = harness.get_anchor_account(harness.merchant_pda).await;
    assert_eq!(
        merchant_with_pending.pending_payout_token_account,
        Some(next_payout_ata)
    );

    harness.cancel_payout_destination_update().await;

    let merchant_after_cancel: Merchant = harness.get_anchor_account(harness.merchant_pda).await;
    assert_eq!(merchant_after_cancel.pending_payout_token_account, None);

    harness.request_payout_destination_update(next_payout_ata).await;
    harness.confirm_payout_destination_update().await;

    let merchant_after_confirm: Merchant = harness.get_anchor_account(harness.merchant_pda).await;
    assert_eq!(merchant_after_confirm.payout_token_account, next_payout_ata);
    assert_eq!(merchant_after_confirm.pending_payout_token_account, None);

    harness.create_default_plan(2).await;
    harness.create_default_subscription().await;

    let subscription: Subscription = harness.get_anchor_account(harness.subscription_pda).await;
    let billing_period_start = subscription.next_charge_at;

    harness
        .record_subscription_charge_failure(
            FAILURE_CHARGE_HASH_A,
            billing_period_start,
            FAILURE_CODE_HASH,
        )
        .await;
    harness
        .record_subscription_charge_failure(
            FAILURE_CHARGE_HASH_B,
            billing_period_start,
            FAILURE_CODE_HASH,
        )
        .await;

    let updated_subscription: Subscription =
        harness.get_anchor_account(harness.subscription_pda).await;
    let failure_receipt: ChargeReceipt = harness
        .get_anchor_account(harness.charge_pda(FAILURE_CHARGE_HASH_B))
        .await;

    assert_eq!(updated_subscription.retry_count, 2);
    assert_eq!(updated_subscription.status, SubscriptionStatus::RetryExhausted);
    assert_eq!(updated_subscription.retry_available_at, 0);
    assert_eq!(failure_receipt.status, ChargeStatus::Failed);
    assert_eq!(failure_receipt.source_kind, ChargeSourceKind::Subscription);
    assert_eq!(failure_receipt.commercial_ref_hash, None);
    assert_eq!(failure_receipt.failure_code_hash, Some(FAILURE_CODE_HASH));
    assert_eq!(failure_receipt.fx_quote_ref_hash, None);
    assert_eq!(failure_receipt.fx_provider_ref_hash, None);
    assert_eq!(failure_receipt.quote_generated_at, 0);
    assert_eq!(failure_receipt.quote_expires_at, 0);
}
