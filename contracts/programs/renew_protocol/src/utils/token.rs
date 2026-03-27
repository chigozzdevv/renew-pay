use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use solana_program::{
    program::{invoke, invoke_signed},
    program_pack::Pack,
};
use solana_system_interface::instruction as system_instruction;

use crate::constants::{MERCHANT_SEED, VAULT_AUTHORITY_SEED};

pub fn create_program_token_account<'info>(
    payer: AccountInfo<'info>,
    token_account: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    authority: Pubkey,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let rent = Rent::get()?;
    let account_len = spl_token::state::Account::LEN;
    let create_ix = system_instruction::create_account(
        payer.key,
        token_account.key,
        rent.minimum_balance(account_len),
        account_len as u64,
        token_program.key,
    );

    invoke_signed(
        &create_ix,
        &[payer.clone(), token_account.clone(), system_program],
        &[signer_seeds],
    )?;

    let initialize_ix = spl_token::instruction::initialize_account3(
        token_program.key,
        token_account.key,
        mint.key,
        &authority,
    )?;

    invoke(&initialize_ix, &[token_account, mint]).map_err(Into::into)
}

pub fn transfer_from_settlement_source<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        from.key,
        to.key,
        authority.key,
        &[],
        amount,
    )?;

    invoke(&transfer_ix, &[from, to, authority]).map_err(Into::into)
}

pub fn transfer_with_vault_authority<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    vault_authority_bump: u8,
    amount: u64,
) -> Result<()> {
    let signer_seeds: &[&[u8]] = &[VAULT_AUTHORITY_SEED, &[vault_authority_bump]];
    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        from.key,
        to.key,
        vault_authority.key,
        &[],
        amount,
    )?;

    invoke_signed(&transfer_ix, &[from, to, vault_authority], &[signer_seeds]).map_err(Into::into)
}

pub fn transfer_with_merchant_authority<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    merchant: AccountInfo<'info>,
    merchant_id: &[u8; 32],
    merchant_bump: u8,
    amount: u64,
) -> Result<()> {
    let signer_seeds: &[&[u8]] = &[MERCHANT_SEED, merchant_id.as_ref(), &[merchant_bump]];
    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        from.key,
        to.key,
        merchant.key,
        &[],
        amount,
    )?;

    invoke_signed(&transfer_ix, &[from, to, merchant], &[signer_seeds]).map_err(Into::into)
}
