#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BatchStatus {
    Pending,
    Held,
    Released,
    Resolved,
    Refunded,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultConfig {
    pub admin: Address,
    pub operator: Address,
    pub token: Address,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct SettlementBatch {
    pub merchant: Address,
    pub amount: i128,
    pub release_at: u64,
    pub status: BatchStatus,
    pub metadata_hash: BytesN<32>,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Batch(BytesN<32>),
}

#[contractevent]
pub struct Deposit {
    #[topic]
    pub batch_id: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
pub struct Hold {
    #[topic]
    pub batch_id: BytesN<32>,
}

#[contractevent]
pub struct Release {
    #[topic]
    pub batch_id: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
pub struct Resolve {
    #[topic]
    pub batch_id: BytesN<32>,
    pub merchant_amount: i128,
}

#[contractevent]
pub struct Refund {
    #[topic]
    pub batch_id: BytesN<32>,
    pub amount: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Paused = 3,
    InvalidAmount = 4,
    InvalidReleaseTime = 5,
    BatchExists = 6,
    BatchMissing = 7,
    BatchNotPending = 8,
    BatchNotHeld = 9,
    ReleaseTooEarly = 10,
    InvalidResolution = 11,
}

#[contract]
pub struct RenewSettlementVault;

fn config(env: &Env) -> VaultConfig {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
}

fn require_admin(env: &Env) -> VaultConfig {
    let config = config(env);
    config.admin.require_auth();
    config
}

fn require_operator(env: &Env) -> VaultConfig {
    let config = config(env);
    config.operator.require_auth();
    if config.paused {
        panic_with_error!(env, VaultError::Paused);
    }
    config
}

fn batch_key(batch_id: BytesN<32>) -> DataKey {
    DataKey::Batch(batch_id)
}

fn get_batch_or_error(env: &Env, batch_id: &BytesN<32>) -> SettlementBatch {
    env.storage()
        .persistent()
        .get(&batch_key(batch_id.clone()))
        .unwrap_or_else(|| panic_with_error!(env, VaultError::BatchMissing))
}

fn put_batch(env: &Env, batch_id: &BytesN<32>, batch: &SettlementBatch) {
    env.storage()
        .persistent()
        .set(&batch_key(batch_id.clone()), batch);
}

#[contractimpl]
impl RenewSettlementVault {
    pub fn initialize(env: Env, admin: Address, operator: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, VaultError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &VaultConfig {
                admin,
                operator,
                token,
                paused: false,
            },
        );
    }

    pub fn set_operator(env: Env, operator: Address) {
        let mut config = require_admin(&env);
        config.operator = operator;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    pub fn set_paused(env: Env, paused: bool) {
        let mut config = require_admin(&env);
        config.paused = paused;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    pub fn deposit(
        env: Env,
        batch_id: BytesN<32>,
        merchant: Address,
        amount: i128,
        release_at: u64,
        metadata_hash: BytesN<32>,
    ) {
        let config = require_operator(&env);
        let now = env.ledger().timestamp();

        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        if release_at <= now {
            panic_with_error!(&env, VaultError::InvalidReleaseTime);
        }

        let key = batch_key(batch_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, VaultError::BatchExists);
        }

        token::Client::new(&env, &config.token).transfer(
            &config.operator,
            &env.current_contract_address(),
            &amount,
        );

        let batch = SettlementBatch {
            merchant,
            amount,
            release_at,
            status: BatchStatus::Pending,
            metadata_hash,
            created_at: now,
        };
        env.storage().persistent().set(&key, &batch);
        Deposit { batch_id, amount }.publish(&env);
    }

    pub fn hold(env: Env, batch_id: BytesN<32>) {
        require_operator(&env);
        let mut batch = get_batch_or_error(&env, &batch_id);

        if batch.status != BatchStatus::Pending {
            panic_with_error!(&env, VaultError::BatchNotPending);
        }

        batch.status = BatchStatus::Held;
        put_batch(&env, &batch_id, &batch);
        Hold { batch_id }.publish(&env);
    }

    pub fn release(env: Env, batch_id: BytesN<32>) {
        let config = require_operator(&env);
        let mut batch = get_batch_or_error(&env, &batch_id);

        if batch.status != BatchStatus::Pending {
            panic_with_error!(&env, VaultError::BatchNotPending);
        }

        if env.ledger().timestamp() < batch.release_at {
            panic_with_error!(&env, VaultError::ReleaseTooEarly);
        }

        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &batch.merchant,
            &batch.amount,
        );

        batch.status = BatchStatus::Released;
        put_batch(&env, &batch_id, &batch);
        Release {
            batch_id,
            amount: batch.amount,
        }
        .publish(&env);
    }

    pub fn resolve(
        env: Env,
        batch_id: BytesN<32>,
        merchant_amount: i128,
        recovery: Address,
        recovery_amount: i128,
    ) {
        let config = require_operator(&env);
        let mut batch = get_batch_or_error(&env, &batch_id);

        if batch.status != BatchStatus::Held && batch.status != BatchStatus::Pending {
            panic_with_error!(&env, VaultError::BatchNotHeld);
        }

        if merchant_amount < 0
            || recovery_amount < 0
            || merchant_amount + recovery_amount != batch.amount
        {
            panic_with_error!(&env, VaultError::InvalidResolution);
        }

        let token = token::Client::new(&env, &config.token);
        let vault = env.current_contract_address();

        if merchant_amount > 0 {
            token.transfer(&vault, &batch.merchant, &merchant_amount);
        }

        if recovery_amount > 0 {
            token.transfer(&vault, &recovery, &recovery_amount);
        }

        batch.status = BatchStatus::Resolved;
        put_batch(&env, &batch_id, &batch);
        Resolve {
            batch_id,
            merchant_amount,
        }
        .publish(&env);
    }

    pub fn refund(env: Env, batch_id: BytesN<32>, recovery: Address) {
        let config = require_operator(&env);
        let mut batch = get_batch_or_error(&env, &batch_id);

        if batch.status != BatchStatus::Held && batch.status != BatchStatus::Pending {
            panic_with_error!(&env, VaultError::BatchNotHeld);
        }

        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &recovery,
            &batch.amount,
        );

        batch.status = BatchStatus::Refunded;
        put_batch(&env, &batch_id, &batch);
        Refund {
            batch_id,
            amount: batch.amount,
        }
        .publish(&env);
    }

    pub fn get_batch(env: Env, batch_id: BytesN<32>) -> SettlementBatch {
        get_batch_or_error(&env, &batch_id)
    }

    pub fn get_config(env: Env) -> VaultConfig {
        config(&env)
    }
}
