mod common;

use common::*;
use renew_protocol::{ChargeReceipt, ChargeSourceKind, MerchantLedger};
use serial_test::serial;

#[serial(integration)]
#[tokio::test]
async fn one_off_settlement_credit_records_fx_quote_snapshot() {
    let mut harness = Harness::start().await;

    harness.initialize_config(PROTOCOL_FEE_BPS, 0).await;
    harness.create_merchant().await;
    harness.mint_to_settlement_source(FIXED_USDC_AMOUNT).await;

    harness
        .record_invoice_settlement(
            INVOICE_REF_HASH,
            SETTLEMENT_CREDIT_HASH,
            LOCAL_AMOUNT,
            fx_quote_snapshot(),
            FIXED_USDC_AMOUNT,
        )
        .await;

    let receipt: ChargeReceipt = harness
        .get_anchor_account(harness.charge_pda(SETTLEMENT_CREDIT_HASH))
        .await;
    let ledger: MerchantLedger = harness.get_anchor_account(harness.ledger_pda).await;

    assert_eq!(receipt.subscription, None);
    assert_eq!(receipt.source_kind, ChargeSourceKind::Invoice);
    assert_eq!(receipt.commercial_ref_hash, Some(INVOICE_REF_HASH));
    assert_eq!(receipt.local_amount, LOCAL_AMOUNT);
    assert_eq!(receipt.fx_rate_in_micros, FX_RATE_IN_MICROS);
    assert_eq!(receipt.fx_quote_ref_hash, Some(FX_QUOTE_REF_HASH));
    assert_eq!(receipt.fx_provider_ref_hash, Some(FX_PROVIDER_REF_HASH));
    assert_eq!(receipt.quote_generated_at, QUOTE_GENERATED_AT);
    assert_eq!(receipt.quote_expires_at, QUOTE_EXPIRES_AT);
    assert_eq!(receipt.usdc_amount, FIXED_USDC_AMOUNT);
    assert_eq!(ledger.available_balance, EXPECTED_NET_AMOUNT);
}
