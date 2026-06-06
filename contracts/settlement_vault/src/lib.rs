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

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger, Register};

    struct VaultTest {
        env: Env,
        admin: Address,
        operator: Address,
        merchant: Address,
        recovery: Address,
        token_address: Address,
        contract_id: Address,
    }

    impl VaultTest {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();
            env.ledger().with_mut(|ledger| {
                ledger.timestamp = 1_000;
            });

            let admin = Address::generate(&env);
            let operator = Address::generate(&env);
            let merchant = Address::generate(&env);
            let recovery = Address::generate(&env);
            let token_admin = Address::generate(&env);
            let asset = env.register_stellar_asset_contract_v2(token_admin.clone());
            let token_address = asset.address();
            let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
            token_admin_client.mint(&operator, &10_000);

            let contract_id = RenewSettlementVault.register(&env, None, ());
            let vault = RenewSettlementVaultClient::new(&env, &contract_id);
            vault.initialize(&admin, &operator, &token_address);

            Self {
                env,
                admin,
                operator,
                merchant,
                recovery,
                token_address,
                contract_id,
            }
        }

        fn vault(&self) -> RenewSettlementVaultClient<'_> {
            RenewSettlementVaultClient::new(&self.env, &self.contract_id)
        }

        fn token(&self) -> token::TokenClient<'_> {
            token::TokenClient::new(&self.env, &self.token_address)
        }

        fn set_time(&self, timestamp: u64) {
            self.env.ledger().with_mut(|ledger| {
                ledger.timestamp = timestamp;
            });
        }

        fn deposit_default(&self, batch_id: BytesN<32>) {
            self.vault().deposit(
                &batch_id,
                &self.merchant,
                &1_000,
                &1_100,
                &metadata_hash(&self.env),
            );
        }
    }

    fn batch_id(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    fn metadata_hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[9; 32])
    }

    #[test]
    fn initialize_sets_config() {
        let fixture = VaultTest::new();
        let config = fixture.vault().get_config();

        assert_eq!(config.admin, fixture.admin);
        assert_eq!(config.operator, fixture.operator);
        assert_eq!(config.token, fixture.token_address);
        assert!(!config.paused);
    }

    #[test]
    fn deposit_locks_tokens_and_records_batch() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 1);

        fixture.deposit_default(batch_id.clone());

        let batch = fixture.vault().get_batch(&batch_id);
        assert_eq!(batch.merchant, fixture.merchant);
        assert_eq!(batch.amount, 1_000);
        assert_eq!(batch.release_at, 1_100);
        assert_eq!(batch.status, BatchStatus::Pending);
        assert_eq!(fixture.token().balance(&fixture.contract_id), 1_000);
        assert_eq!(fixture.token().balance(&fixture.operator), 9_000);
    }

    #[test]
    #[should_panic]
    fn release_before_release_at_fails() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 2);

        fixture.deposit_default(batch_id.clone());
        fixture.vault().release(&batch_id);
    }

    #[test]
    fn release_after_release_at_pays_merchant() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 3);

        fixture.deposit_default(batch_id.clone());
        fixture.set_time(1_100);
        fixture.vault().release(&batch_id);

        let batch = fixture.vault().get_batch(&batch_id);
        assert_eq!(batch.status, BatchStatus::Released);
        assert_eq!(fixture.token().balance(&fixture.merchant), 1_000);
        assert_eq!(fixture.token().balance(&fixture.contract_id), 0);
    }

    #[test]
    fn held_batch_can_be_resolved() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 4);

        fixture.deposit_default(batch_id.clone());
        fixture.vault().hold(&batch_id);
        fixture
            .vault()
            .resolve(&batch_id, &700, &fixture.recovery, &300);

        let batch = fixture.vault().get_batch(&batch_id);
        assert_eq!(batch.status, BatchStatus::Resolved);
        assert_eq!(fixture.token().balance(&fixture.merchant), 700);
        assert_eq!(fixture.token().balance(&fixture.recovery), 300);
        assert_eq!(fixture.token().balance(&fixture.contract_id), 0);
    }

    #[test]
    fn held_batch_can_be_refunded() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 5);

        fixture.deposit_default(batch_id.clone());
        fixture.vault().hold(&batch_id);
        fixture.vault().refund(&batch_id, &fixture.recovery);

        let batch = fixture.vault().get_batch(&batch_id);
        assert_eq!(batch.status, BatchStatus::Refunded);
        assert_eq!(fixture.token().balance(&fixture.merchant), 0);
        assert_eq!(fixture.token().balance(&fixture.recovery), 1_000);
        assert_eq!(fixture.token().balance(&fixture.contract_id), 0);
    }

    #[test]
    #[should_panic]
    fn pause_blocks_deposit() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 6);

        fixture.vault().set_paused(&true);
        fixture.deposit_default(batch_id);
    }

    #[test]
    #[should_panic]
    fn duplicate_batch_fails() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 7);

        fixture.deposit_default(batch_id.clone());
        fixture.deposit_default(batch_id);
    }

    #[test]
    #[should_panic]
    fn invalid_resolution_fails() {
        let fixture = VaultTest::new();
        let batch_id = batch_id(&fixture.env, 8);

        fixture.deposit_default(batch_id.clone());
        fixture.vault().hold(&batch_id);
        fixture
            .vault()
            .resolve(&batch_id, &600, &fixture.recovery, &300);
    }
}
