#![allow(dead_code)]

pub mod harness;

pub use harness::Harness;
use renew_protocol::FxQuoteSnapshotArgs;

pub const MERCHANT_ID: [u8; 32] = [0x11; 32];
pub const PLAN_CODE_HASH: [u8; 32] = [0x22; 32];
pub const SUBSCRIPTION_REF_HASH: [u8; 32] = [0x33; 32];
pub const CUSTOMER_REF_HASH: [u8; 32] = [0x44; 32];
pub const MANDATE_HASH: [u8; 32] = [0x55; 32];
pub const EXTERNAL_CHARGE_HASH: [u8; 32] = [0x66; 32];
pub const FAILURE_CHARGE_HASH_A: [u8; 32] = [0x77; 32];
pub const FAILURE_CHARGE_HASH_B: [u8; 32] = [0x78; 32];
pub const FAILURE_CODE_HASH: [u8; 32] = [0x88; 32];
pub const BILLING_CURRENCY: [u8; 8] = *b"NGN\0\0\0\0\0";
pub const METADATA_HASH: [u8; 32] = [0x99; 32];
pub const FX_QUOTE_REF_HASH: [u8; 32] = [0x9a; 32];
pub const FX_PROVIDER_REF_HASH: [u8; 32] = [0x9b; 32];
pub const SETTLEMENT_CREDIT_HASH: [u8; 32] = [0xab; 32];
pub const INVOICE_REF_HASH: [u8; 32] = [0xac; 32];
pub const FIXED_USDC_AMOUNT: u64 = 10_000_000;
pub const PROTOCOL_FEE_BPS: u16 = 250;
pub const EXPECTED_FEE_AMOUNT: u64 = 250_000;
pub const EXPECTED_NET_AMOUNT: u64 = FIXED_USDC_AMOUNT - EXPECTED_FEE_AMOUNT;
pub const LOCAL_AMOUNT: u64 = 7_500_000_000;
pub const FX_RATE_IN_MICROS: u64 = 1_250_000;
pub const QUOTE_GENERATED_AT: i64 = 1_730_000_000;
pub const QUOTE_EXPIRES_AT: i64 = 1_730_000_900;

pub fn fx_quote_snapshot() -> FxQuoteSnapshotArgs {
    FxQuoteSnapshotArgs {
        fx_rate_in_micros: FX_RATE_IN_MICROS,
        fx_quote_ref_hash: FX_QUOTE_REF_HASH,
        fx_provider_ref_hash: FX_PROVIDER_REF_HASH,
        quote_generated_at: QUOTE_GENERATED_AT,
        quote_expires_at: QUOTE_EXPIRES_AT,
    }
}
