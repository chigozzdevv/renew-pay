#![allow(dead_code)]

use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use renew_protocol::{
    accounts, instruction, Config, FxQuoteSnapshotArgs, PlanTermsArgs, SubscriptionArgs,
};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    instruction::Instruction,
    program_option::COption,
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use solana_system_interface::{instruction as system_instruction, program as system_program};
use spl_token::state::{Account as SplAccount, Mint as SplMint};

use super::{
    BILLING_CURRENCY, CUSTOMER_REF_HASH, FIXED_USDC_AMOUNT, MANDATE_HASH, MERCHANT_ID,
    METADATA_HASH, PLAN_CODE_HASH, SUBSCRIPTION_REF_HASH,
};

pub struct Harness {
    context: ProgramTestContext,
    admin: Keypair,
    merchant_authority: Keypair,
    settlement_authority: Keypair,
    mint_authority: Keypair,
    mint: Pubkey,
    pub config_pda: Pubkey,
    pub merchant_pda: Pubkey,
    pub ledger_pda: Pubkey,
    pub plan_pda: Pubkey,
    pub subscription_pda: Pubkey,
    pub fee_vault: Pubkey,
    pub merchant_vault: Pubkey,
    pub payout_ata: Pubkey,
    settlement_source_ata: Pubkey,
    pub fee_collector_ata: Pubkey,
}

impl Harness {
    pub async fn start() -> Self {
        let mut program_test = ProgramTest::new(
            "renew_protocol",
            renew_protocol::ID,
            processor!(program_test_processor()),
        );
        program_test.add_program(
            "spl_token",
            spl_token::id(),
            processor!(spl_token::processor::Processor::process),
        );

        let mut context = program_test.start_with_context().await;
        let admin = Keypair::new();
        let merchant_authority = Keypair::new();
        let settlement_authority = Keypair::new();
        let mint_authority = Keypair::new();

        fund_keypair(&mut context, &admin, 2_000_000_000).await;
        fund_keypair(&mut context, &merchant_authority, 2_000_000_000).await;
        fund_keypair(&mut context, &settlement_authority, 2_000_000_000).await;
        fund_keypair(&mut context, &mint_authority, 2_000_000_000).await;

        let mint = create_mint(&mut context, &mint_authority.pubkey(), 6).await;
        let payout_ata = create_token_account(&mut context, &merchant_authority, mint).await;
        let settlement_source_ata =
            create_token_account(&mut context, &settlement_authority, mint).await;
        let fee_collector_ata = create_token_account(&mut context, &admin, mint).await;

        let config_pda = config_pda();
        let merchant_pda = merchant_pda(MERCHANT_ID);
        let ledger_pda = ledger_pda(MERCHANT_ID);
        let plan_pda = plan_pda(MERCHANT_ID, PLAN_CODE_HASH);
        let subscription_pda = subscription_pda(MERCHANT_ID, SUBSCRIPTION_REF_HASH);
        let fee_vault = fee_vault_pda();
        let merchant_vault = merchant_vault_pda(MERCHANT_ID);

        Self {
            context,
            admin,
            merchant_authority,
            settlement_authority,
            mint_authority,
            mint,
            config_pda,
            merchant_pda,
            ledger_pda,
            plan_pda,
            subscription_pda,
            fee_vault,
            merchant_vault,
            payout_ata,
            settlement_source_ata,
            fee_collector_ata,
        }
    }

    pub async fn initialize_config(
        &mut self,
        protocol_fee_bps: u16,
        payout_change_delay_seconds: i64,
    ) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::InitializeConfig {
                admin: self.admin.pubkey(),
                settlement_mint: self.mint,
                fee_collector_token_account: self.fee_collector_ata,
                config: self.config_pda,
                vault_authority: vault_authority_pda(),
                fee_vault: self.fee_vault,
                system_program: system_program::id(),
                token_program: spl_token::id(),
            }
            .to_account_metas(None),
            data: instruction::InitializeConfig {
                settlement_authority: self.settlement_authority.pubkey(),
                protocol_fee_bps,
                payout_change_delay_seconds,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.admin]).await;

        let config: Config = self.get_anchor_account(self.config_pda).await;
        assert_eq!(config.settlement_authority, self.settlement_authority.pubkey());
        assert_eq!(config.settlement_mint, self.mint);
        assert_eq!(config.fee_vault, self.fee_vault);
        assert_eq!(config.fee_collector_token_account, self.fee_collector_ata);
    }

    pub async fn create_merchant(&mut self) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::CreateMerchant {
                config: self.config_pda,
                authority: self.merchant_authority.pubkey(),
                payer: self.merchant_authority.pubkey(),
                settlement_mint: self.mint,
                payout_token_account: self.payout_ata,
                merchant: self.merchant_pda,
                ledger: self.ledger_pda,
                merchant_vault: self.merchant_vault,
                system_program: system_program::id(),
                token_program: spl_token::id(),
            }
            .to_account_metas(None),
            data: instruction::CreateMerchant {
                merchant_id: MERCHANT_ID,
                metadata_hash: METADATA_HASH,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn create_default_plan(&mut self, max_retry_count: u8) {
        self.create_plan(PlanTermsArgs {
            fixed_amount: FIXED_USDC_AMOUNT,
            usage_rate: 0,
            billing_interval_seconds: 30 * 24 * 60 * 60,
            trial_period_seconds: 0,
            retry_window_seconds: 0,
            max_retry_count,
            billing_mode: renew_protocol::BillingMode::Fixed,
        })
        .await;
    }

    pub async fn create_default_subscription(&mut self) {
        self.create_subscription(SubscriptionArgs {
            customer_ref_hash: CUSTOMER_REF_HASH,
            billing_currency: BILLING_CURRENCY,
            first_charge_at: None,
            local_amount_snapshot: FIXED_USDC_AMOUNT,
            mandate_hash: MANDATE_HASH,
        })
        .await;
    }

    pub async fn create_plan(&mut self, args: PlanTermsArgs) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::CreatePlan {
                authority: self.merchant_authority.pubkey(),
                payer: self.merchant_authority.pubkey(),
                merchant: self.merchant_pda,
                plan: self.plan_pda,
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::CreatePlan {
                plan_code_hash: PLAN_CODE_HASH,
                args,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn create_subscription(&mut self, args: SubscriptionArgs) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::CreateSubscription {
                authority: self.merchant_authority.pubkey(),
                payer: self.merchant_authority.pubkey(),
                merchant: self.merchant_pda,
                plan: self.plan_pda,
                subscription: self.subscription_pda,
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::CreateSubscription {
                subscription_ref_hash: SUBSCRIPTION_REF_HASH,
                args,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn record_subscription_charge_success(
        &mut self,
        external_charge_ref_hash: [u8; 32],
        billing_period_start: i64,
        local_amount: u64,
        fx_quote: FxQuoteSnapshotArgs,
        usage_units: u64,
        usdc_amount: u64,
    ) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::RecordSubscriptionChargeSuccess {
                config: self.config_pda,
                settlement_authority: self.settlement_authority.pubkey(),
                merchant: self.merchant_pda,
                ledger: self.ledger_pda,
                subscription: self.subscription_pda,
                charge_receipt: self.charge_pda(external_charge_ref_hash),
                cycle_marker: cycle_pda(SUBSCRIPTION_REF_HASH, billing_period_start),
                merchant_vault: self.merchant_vault,
                fee_vault: self.fee_vault,
                settlement_source_token_account: self.settlement_source_ata,
                token_program: spl_token::id(),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::RecordSubscriptionChargeSuccess {
                external_charge_ref_hash,
                billing_period_start,
                local_amount,
                fx_quote,
                usage_units,
                usdc_amount,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.settlement_authority]).await;
    }

    pub async fn record_subscription_charge_failure(
        &mut self,
        external_charge_ref_hash: [u8; 32],
        billing_period_start: i64,
        failure_code_hash: [u8; 32],
    ) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::RecordSubscriptionChargeFailure {
                config: self.config_pda,
                settlement_authority: self.settlement_authority.pubkey(),
                merchant: self.merchant_pda,
                subscription: self.subscription_pda,
                charge_receipt: self.charge_pda(external_charge_ref_hash),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::RecordSubscriptionChargeFailure {
                external_charge_ref_hash,
                billing_period_start,
                failure_code_hash,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.settlement_authority]).await;
    }

    pub async fn record_invoice_settlement(
        &mut self,
        commercial_ref_hash: [u8; 32],
        external_charge_ref_hash: [u8; 32],
        local_amount: u64,
        fx_quote: FxQuoteSnapshotArgs,
        usdc_amount: u64,
    ) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::RecordInvoiceSettlement {
                config: self.config_pda,
                settlement_authority: self.settlement_authority.pubkey(),
                merchant: self.merchant_pda,
                ledger: self.ledger_pda,
                charge_receipt: self.charge_pda(external_charge_ref_hash),
                merchant_vault: self.merchant_vault,
                fee_vault: self.fee_vault,
                settlement_source_token_account: self.settlement_source_ata,
                token_program: spl_token::id(),
                system_program: system_program::id(),
            }
            .to_account_metas(None),
            data: instruction::RecordInvoiceSettlement {
                external_charge_ref_hash,
                commercial_ref_hash,
                local_amount,
                fx_quote,
                usdc_amount,
            }
            .data(),
        };

        process_transaction(&mut self.context, ix, &[&self.settlement_authority]).await;
    }

    pub async fn withdraw(&mut self, amount: u64) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::WithdrawMerchantBalance {
                config: self.config_pda,
                authority: self.merchant_authority.pubkey(),
                merchant: self.merchant_pda,
                ledger: self.ledger_pda,
                merchant_vault: self.merchant_vault,
                payout_token_account: self.payout_ata,
                token_program: spl_token::id(),
            }
            .to_account_metas(None),
            data: instruction::Withdraw { amount }.data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn withdraw_protocol_fees(&mut self, amount: u64) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::WithdrawProtocolFees {
                config: self.config_pda,
                admin: self.admin.pubkey(),
                fee_vault: self.fee_vault,
                fee_collector_token_account: self.fee_collector_ata,
                vault_authority: vault_authority_pda(),
                token_program: spl_token::id(),
            }
            .to_account_metas(None),
            data: instruction::WithdrawProtocolFees { amount }.data(),
        };

        process_transaction(&mut self.context, ix, &[&self.admin]).await;
    }

    pub async fn request_payout_destination_update(&mut self, new_payout_token_account: Pubkey) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::RequestPayoutDestinationUpdate {
                config: self.config_pda,
                authority: self.merchant_authority.pubkey(),
                merchant: self.merchant_pda,
                new_payout_token_account,
            }
            .to_account_metas(None),
            data: instruction::RequestPayoutDestinationUpdate {}.data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn cancel_payout_destination_update(&mut self) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::MerchantAuthorityOnly {
                authority: self.merchant_authority.pubkey(),
                merchant: self.merchant_pda,
            }
            .to_account_metas(None),
            data: instruction::CancelPayoutDestinationUpdate {}.data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn confirm_payout_destination_update(&mut self) {
        let ix = Instruction {
            program_id: renew_protocol::ID,
            accounts: accounts::MerchantAuthorityOnly {
                authority: self.merchant_authority.pubkey(),
                merchant: self.merchant_pda,
            }
            .to_account_metas(None),
            data: instruction::ConfirmPayoutDestinationUpdate {}.data(),
        };

        process_transaction(&mut self.context, ix, &[&self.merchant_authority]).await;
    }

    pub async fn mint_to_settlement_source(&mut self, amount: u64) {
        let ix = spl_token::instruction::mint_to(
            &spl_token::id(),
            &self.mint,
            &self.settlement_source_ata,
            &self.mint_authority.pubkey(),
            &[],
            amount,
        )
        .unwrap();

        process_transaction(&mut self.context, ix, &[&self.mint_authority]).await;
    }

    pub async fn create_token_account_for_merchant(&mut self) -> Pubkey {
        create_token_account(&mut self.context, &self.merchant_authority, self.mint).await
    }

    pub async fn get_anchor_account<T: AccountDeserialize>(&mut self, pubkey: Pubkey) -> T {
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

    pub async fn token_amount(&mut self, pubkey: Pubkey) -> u64 {
        let account = self
            .context
            .banks_client
            .get_account(pubkey)
            .await
            .unwrap()
            .unwrap();
        SplAccount::unpack(&account.data).unwrap().amount
    }

    pub fn charge_pda(&self, external_charge_ref_hash: [u8; 32]) -> Pubkey {
        charge_pda(MERCHANT_ID, external_charge_ref_hash)
    }
}

type AnchorEntry = for<'a, 'b, 'info> fn(
    &'a Pubkey,
    &'info [AccountInfo<'info>],
    &'b [u8],
) -> ProgramResult;
type ProgramTestEntry = for<'a, 'b, 'c, 'd> fn(
    &'a Pubkey,
    &'b [AccountInfo<'c>],
    &'d [u8],
) -> ProgramResult;

fn program_test_processor() -> ProgramTestEntry {
    unsafe { std::mem::transmute::<AnchorEntry, ProgramTestEntry>(renew_protocol::entry) }
}

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &renew_protocol::ID).0
}

fn vault_authority_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"vault-authority"], &renew_protocol::ID).0
}

fn fee_vault_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"fee-vault"], &renew_protocol::ID).0
}

fn merchant_pda(merchant_id: [u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"merchant", merchant_id.as_ref()], &renew_protocol::ID).0
}

fn merchant_vault_pda(merchant_id: [u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"merchant-vault", merchant_id.as_ref()], &renew_protocol::ID).0
}

fn ledger_pda(merchant_id: [u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"ledger", merchant_id.as_ref()], &renew_protocol::ID).0
}

fn plan_pda(merchant_id: [u8; 32], plan_code_hash: [u8; 32]) -> Pubkey {
    Pubkey::find_program_address(
        &[b"plan", merchant_id.as_ref(), plan_code_hash.as_ref()],
        &renew_protocol::ID,
    )
    .0
}

fn subscription_pda(merchant_id: [u8; 32], subscription_ref_hash: [u8; 32]) -> Pubkey {
    Pubkey::find_program_address(
        &[b"subscription", merchant_id.as_ref(), subscription_ref_hash.as_ref()],
        &renew_protocol::ID,
    )
    .0
}

fn charge_pda(merchant_id: [u8; 32], external_charge_ref_hash: [u8; 32]) -> Pubkey {
    Pubkey::find_program_address(
        &[b"charge", merchant_id.as_ref(), external_charge_ref_hash.as_ref()],
        &renew_protocol::ID,
    )
    .0
}

fn cycle_pda(subscription_ref_hash: [u8; 32], billing_period_start: i64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            b"cycle",
            subscription_ref_hash.as_ref(),
            &billing_period_start.to_le_bytes(),
        ],
        &renew_protocol::ID,
    )
    .0
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

async fn create_mint(
    context: &mut ProgramTestContext,
    mint_authority: &Pubkey,
    decimals: u8,
) -> Pubkey {
    let mint = Keypair::new();
    let rent = context.banks_client.get_rent().await.unwrap();
    let mint_space = SplMint::LEN;
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &context.payer.pubkey(),
                &mint.pubkey(),
                rent.minimum_balance(mint_space),
                mint_space as u64,
                &spl_token::id(),
            ),
            spl_token::instruction::initialize_mint(
                &spl_token::id(),
                &mint.pubkey(),
                mint_authority,
                None,
                decimals,
            )
            .unwrap(),
        ],
        Some(&context.payer.pubkey()),
        &[&context.payer, &mint],
        blockhash,
    );

    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    mint.pubkey()
}

async fn create_token_account(
    context: &mut ProgramTestContext,
    owner: &Keypair,
    mint: Pubkey,
) -> Pubkey {
    let token_account = Keypair::new();
    let rent = context.banks_client.get_rent().await.unwrap();
    let token_space = SplAccount::LEN;
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let transaction = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &context.payer.pubkey(),
                &token_account.pubkey(),
                rent.minimum_balance(token_space),
                token_space as u64,
                &spl_token::id(),
            ),
            spl_token::instruction::initialize_account3(
                &spl_token::id(),
                &token_account.pubkey(),
                &mint,
                &owner.pubkey(),
            )
            .unwrap(),
        ],
        Some(&context.payer.pubkey()),
        &[&context.payer, &token_account],
        blockhash,
    );

    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    let account = context
        .banks_client
        .get_account(token_account.pubkey())
        .await
        .unwrap()
        .unwrap();
    let token_account_state = SplAccount::unpack(&account.data).unwrap();
    assert_eq!(token_account_state.owner, owner.pubkey());
    assert_eq!(token_account_state.mint, mint);
    assert_eq!(token_account_state.delegate, COption::None);

    token_account.pubkey()
}
