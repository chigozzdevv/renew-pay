pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault-authority";
pub const FEE_VAULT_SEED: &[u8] = b"fee-vault";
pub const MERCHANT_SEED: &[u8] = b"merchant";
pub const MERCHANT_VAULT_SEED: &[u8] = b"merchant-vault";
pub const LEDGER_SEED: &[u8] = b"ledger";
pub const PLAN_SEED: &[u8] = b"plan";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";
pub const CHARGE_SEED: &[u8] = b"charge";
pub const CYCLE_SEED: &[u8] = b"cycle";

pub const MAX_PROTOCOL_FEE_BPS: u16 = 2_500;
pub const DEFAULT_PAYOUT_DELAY_SECONDS: i64 = 24 * 60 * 60;
