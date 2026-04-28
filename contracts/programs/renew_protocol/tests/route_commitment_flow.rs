use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use renew_protocol::{
    accounts, instruction, CommitmentKind, Config, ConfigureRouteArgs, PayoutBatchArgs,
    ProofCommitment, RouteCheckpointArgs, RouteConfig, SettlementBatchArgs, UpdateRouteArgs,
};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use solana_system_interface::{instruction as system_instruction, program as system_program};

const ROUTE_ID: [u8; 32] = [0x10; 32];
const ASSET_ID: [u8; 32] = [0x20; 32];
const SETTLEMENT_RAIL: [u8; 32] = [0x30; 32];
const PRIVACY_RAIL_NONE: [u8; 32] = [0; 32];
const METADATA_HASH: [u8; 32] = [0x40; 32];
const UPDATED_METADATA_HASH: [u8; 32] = [0x41; 32];
const SETTLEMENT_BATCH_ID: [u8; 32] = [0x50; 32];
const SETTLEMENT_ROOT: [u8; 32] = [0x60; 32];
const PAYOUT_BATCH_ID: [u8; 32] = [0x70; 32];
const PAYOUT_ROOT: [u8; 32] = [0x80; 32];
const CHECKPOINT_ID: [u8; 32] = [0x90; 32];
const CHECKPOINT_ROOT: [u8; 32] = [0xA0; 32];

const SOLANA_CHAIN_ID: u64 = 1;
const CAPABILITY_PUBLIC_SETTLEMENT: u64 = 1 << 0;
const CAPABILITY_NON_FREEZABLE_ASSET: u64 = 1 << 1;
const GROSS_AMOUNT: u64 = 10_000_000;
const FEE_AMOUNT: u64 = 250_000;
const NET_AMOUNT: u64 = GROSS_AMOUNT - FEE_AMOUNT;
const PAYOUT_AMOUNT: u64 = 4_000_000;

#[tokio::test]
async fn route_commitments_track_asset_specific_totals() {
    let mut harness = Harness::start().await;

    harness.initialize_config().await;
    harness.configure_route().await;

    let config: Config = harness.get_anchor_account(harness.config_pda).await;
    let route: RouteConfig = harness.get_anchor_account(harness.route_pda()).await;
    assert_eq!(config.operator, harness.operator.pubkey());
    assert_eq!(config.pauser, harness.pauser.pubkey());
    assert_eq!(config.route_count, 1);
    assert_eq!(route.route_id_hash, ROUTE_ID);
    assert_eq!(route.chain_id, SOLANA_CHAIN_ID);
    assert_eq!(route.asset_id_hash, ASSET_ID);
    assert_eq!(route.settlement_rail_hash, SETTLEMENT_RAIL);
    assert_eq!(route.privacy_rail_hash, PRIVACY_RAIL_NONE);
    assert_eq!(
        route.capabilities,
        CAPABILITY_PUBLIC_SETTLEMENT | CAPABILITY_NON_FREEZABLE_ASSET
    );
    assert!(route.enabled);

    harness.commit_settlement_batch().await;

    let settlement_commitment: ProofCommitment = harness
        .get_anchor_account(harness.settlement_commitment_pda())
        .await;
    let route: RouteConfig = harness.get_anchor_account(harness.route_pda()).await;

    assert_eq!(settlement_commitment.kind, CommitmentKind::SettlementBatch);
    assert_eq!(settlement_commitment.route_id_hash, ROUTE_ID);
    assert_eq!(settlement_commitment.batch_id_hash, SETTLEMENT_BATCH_ID);
    assert_eq!(settlement_commitment.root, SETTLEMENT_ROOT);
    assert_eq!(settlement_commitment.gross_amount, GROSS_AMOUNT);
    assert_eq!(settlement_commitment.fee_amount, FEE_AMOUNT);
    assert_eq!(settlement_commitment.net_amount, NET_AMOUNT);
    assert_eq!(route.total_settlement_committed, GROSS_AMOUNT);
    assert_eq!(route.total_fee_committed, FEE_AMOUNT);
    assert_eq!(route.outstanding_amount, NET_AMOUNT);

    harness.commit_payout_batch().await;

    let payout_commitment: ProofCommitment = harness
        .get_anchor_account(harness.payout_commitment_pda())
        .await;
    let route: RouteConfig = harness.get_anchor_account(harness.route_pda()).await;

    assert_eq!(payout_commitment.kind, CommitmentKind::PayoutBatch);
    assert_eq!(payout_commitment.route_id_hash, ROUTE_ID);
    assert_eq!(payout_commitment.batch_id_hash, PAYOUT_BATCH_ID);
    assert_eq!(payout_commitment.root, PAYOUT_ROOT);
    assert_eq!(payout_commitment.net_amount, PAYOUT_AMOUNT);
    assert_eq!(route.total_payout_committed, PAYOUT_AMOUNT);
    assert_eq!(route.outstanding_amount, NET_AMOUNT - PAYOUT_AMOUNT);

    harness.commit_route_checkpoint().await;

    let checkpoint: ProofCommitment = harness
        .get_anchor_account(harness.checkpoint_commitment_pda())
        .await;
    let route: RouteConfig = harness.get_anchor_account(harness.route_pda()).await;
    let config: Config = harness.get_anchor_account(harness.config_pda).await;

    assert_eq!(checkpoint.kind, CommitmentKind::RouteCheckpoint);
    assert_eq!(checkpoint.route_id_hash, ROUTE_ID);
    assert_eq!(checkpoint.batch_id_hash, CHECKPOINT_ID);
    assert_eq!(checkpoint.root, CHECKPOINT_ROOT);
    assert_eq!(route.last_checkpoint_root, CHECKPOINT_ROOT);
    assert_eq!(route.last_checkpoint_amount, NET_AMOUNT - PAYOUT_AMOUNT);
    assert_eq!(route.outstanding_amount, NET_AMOUNT - PAYOUT_AMOUNT);
    assert_eq!(config.commitment_count, 3);
}

#[tokio::test]
async fn disabled_routes_reject_new_commitments() {
    let mut harness = Harness::start().await;

    harness.initialize_config().await;
    harness.configure_route().await;
    harness.update_route(false).await;
    harness.expect_commit_settlement_batch_failure().await;

    let route: RouteConfig = harness.get_anchor_account(harness.route_pda()).await;
    assert!(!route.enabled);
    assert_eq!(route.total_settlement_committed, 0);
}

#[tokio::test]
async fn payout_batches_cannot_exceed_outstanding_route_amount() {
    let mut harness = Harness::start().await;

    harness.initialize_config().await;
    harness.configure_route().await;
    harness.expect_commit_payout_batch_failure().await;

    let route: RouteConfig = harness.get_anchor_account(harness.route_pda()).await;
    assert_eq!(route.total_payout_committed, 0);
    assert_eq!(route.outstanding_amount, 0);
}

struct Harness {
    context: ProgramTestContext,
    admin: Keypair,
    operator: Keypair,
    pauser: Keypair,
    config_pda: Pubkey,
}

impl Harness {
    async fn start() -> Self {
        let program_test = ProgramTest::new(
            "renew_protocol",
            renew_protocol::ID,
            processor!(program_test_processor()),
        );

        let mut context = program_test.start_with_context().await;
        let admin = Keypair::new();
        let operator = Keypair::new();
        let pauser = Keypair::new();

        for keypair in [&admin, &operator, &pauser] {
            fund_keypair(&mut context, keypair, 2_000_000_000).await;
        }

        Self {
            context,
            admin,
            operator,
            pauser,
            config_pda: pda(&[b"config"]),
        }
    }

    async fn initialize_config(&mut self) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::InitializeConfig {
                admin: self.admin.pubkey(),
                config: self.config_pda,
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::InitializeConfig {
                operator: self.operator.pubkey(),
                pauser: self.pauser.pubkey(),
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.admin]).await;
    }

    async fn configure_route(&mut self) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::ConfigureRoute {
                config: self.config_pda,
                admin: self.admin.pubkey(),
                route: self.route_pda(),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::ConfigureRoute {
                args: ConfigureRouteArgs {
                    route_id_hash: ROUTE_ID,
                    chain_id: SOLANA_CHAIN_ID,
                    asset_id_hash: ASSET_ID,
                    settlement_rail_hash: SETTLEMENT_RAIL,
                    privacy_rail_hash: PRIVACY_RAIL_NONE,
                    capabilities: CAPABILITY_PUBLIC_SETTLEMENT | CAPABILITY_NON_FREEZABLE_ASSET,
                    metadata_hash: METADATA_HASH,
                },
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.admin]).await;
    }

    async fn update_route(&mut self, enabled: bool) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::UpdateRoute {
                config: self.config_pda,
                admin: self.admin.pubkey(),
                route: self.route_pda(),
            }
            .to_account_metas(None),
            data: instruction::UpdateRoute {
                args: UpdateRouteArgs {
                    enabled,
                    metadata_hash: UPDATED_METADATA_HASH,
                },
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.admin]).await;
    }

    async fn commit_settlement_batch(&mut self) {
        let ix = self.settlement_batch_ix();
        process_transaction(&mut self.context, ix, &[&self.operator]).await;
    }

    async fn expect_commit_settlement_batch_failure(&mut self) {
        let ix = self.settlement_batch_ix();
        process_transaction_should_fail(&mut self.context, ix, &[&self.operator]).await;
    }

    async fn commit_payout_batch(&mut self) {
        let ix = self.payout_batch_ix();
        process_transaction(&mut self.context, ix, &[&self.operator]).await;
    }

    async fn expect_commit_payout_batch_failure(&mut self) {
        let ix = self.payout_batch_ix();
        process_transaction_should_fail(&mut self.context, ix, &[&self.operator]).await;
    }

    async fn commit_route_checkpoint(&mut self) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::CommitRouteCheckpoint {
                config: self.config_pda,
                operator: self.operator.pubkey(),
                route: self.route_pda(),
                commitment: self.checkpoint_commitment_pda(),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::CommitRouteCheckpoint {
                args: RouteCheckpointArgs {
                    route_id_hash: ROUTE_ID,
                    checkpoint_id_hash: CHECKPOINT_ID,
                    checkpoint_root: CHECKPOINT_ROOT,
                    outstanding_amount: NET_AMOUNT - PAYOUT_AMOUNT,
                    item_count: 1,
                    metadata_hash: METADATA_HASH,
                },
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.operator]).await;
    }

    fn settlement_batch_ix(&self) -> Instruction {
        Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::CommitSettlementBatch {
                config: self.config_pda,
                operator: self.operator.pubkey(),
                route: self.route_pda(),
                commitment: self.settlement_commitment_pda(),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::CommitSettlementBatch {
                args: SettlementBatchArgs {
                    route_id_hash: ROUTE_ID,
                    batch_id_hash: SETTLEMENT_BATCH_ID,
                    settlement_root: SETTLEMENT_ROOT,
                    gross_amount: GROSS_AMOUNT,
                    fee_amount: FEE_AMOUNT,
                    net_amount: NET_AMOUNT,
                    item_count: 3,
                    metadata_hash: METADATA_HASH,
                },
            }
            .data(),
        }
    }

    fn payout_batch_ix(&self) -> Instruction {
        Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::CommitPayoutBatch {
                config: self.config_pda,
                operator: self.operator.pubkey(),
                route: self.route_pda(),
                commitment: self.payout_commitment_pda(),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::CommitPayoutBatch {
                args: PayoutBatchArgs {
                    route_id_hash: ROUTE_ID,
                    batch_id_hash: PAYOUT_BATCH_ID,
                    payout_root: PAYOUT_ROOT,
                    amount: PAYOUT_AMOUNT,
                    item_count: 2,
                    metadata_hash: METADATA_HASH,
                },
            }
            .data(),
        }
    }

    async fn get_anchor_account<T: AccountDeserialize>(&mut self, pubkey: Pubkey) -> T {
        let account = self
            .context
            .banks_client
            .get_account(pubkey)
            .await
            .unwrap()
            .unwrap();
        let mut data: &[u8] = &account.data;
        T::try_deserialize(&mut data).unwrap()
    }

    fn route_pda(&self) -> Pubkey {
        pda(&[b"route", ROUTE_ID.as_ref()])
    }

    fn settlement_commitment_pda(&self) -> Pubkey {
        pda(&[
            b"settlement-batch",
            ROUTE_ID.as_ref(),
            SETTLEMENT_BATCH_ID.as_ref(),
        ])
    }

    fn payout_commitment_pda(&self) -> Pubkey {
        pda(&[b"payout-batch", ROUTE_ID.as_ref(), PAYOUT_BATCH_ID.as_ref()])
    }

    fn checkpoint_commitment_pda(&self) -> Pubkey {
        pda(&[
            b"route-checkpoint",
            ROUTE_ID.as_ref(),
            CHECKPOINT_ID.as_ref(),
        ])
    }
}

type AnchorEntry =
    for<'a, 'b, 'info> fn(&'a Pubkey, &'info [AccountInfo<'info>], &'b [u8]) -> ProgramResult;
type ProgramTestEntry =
    for<'a, 'b, 'c, 'd> fn(&'a Pubkey, &'b [AccountInfo<'c>], &'d [u8]) -> ProgramResult;

fn program_test_processor() -> ProgramTestEntry {
    unsafe { std::mem::transmute::<AnchorEntry, ProgramTestEntry>(renew_protocol::entry) }
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &renew_protocol::ID).0
}

async fn fund_keypair(context: &mut ProgramTestContext, recipient: &Keypair, lamports: u64) {
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let transaction = Transaction::new_signed_with_payer(
        &[system_instruction::transfer(
            &context.payer.pubkey(),
            &recipient.pubkey(),
            lamports,
        )],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );

    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();
}

async fn process_transaction(
    context: &mut ProgramTestContext,
    instruction: Instruction,
    signers: &[&Keypair],
) {
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut all_signers: Vec<&Keypair> = Vec::with_capacity(signers.len() + 1);
    all_signers.push(&context.payer);
    all_signers.extend_from_slice(signers);

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&context.payer.pubkey()),
        &all_signers,
        blockhash,
    );

    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();
}

async fn process_transaction_should_fail(
    context: &mut ProgramTestContext,
    instruction: Instruction,
    signers: &[&Keypair],
) {
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut all_signers: Vec<&Keypair> = Vec::with_capacity(signers.len() + 1);
    all_signers.push(&context.payer);
    all_signers.extend_from_slice(signers);

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&context.payer.pubkey()),
        &all_signers,
        blockhash,
    );

    assert!(context
        .banks_client
        .process_transaction(transaction)
        .await
        .is_err());
}
