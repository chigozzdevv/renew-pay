use anchor_lang::prelude::*;

use crate::{errors::RenewError, state::Merchant};

pub fn prepare_payout_destination_update(
    merchant: &mut Merchant,
    new_payout_token_account: Pubkey,
    payout_change_delay_seconds: i64,
    now: i64,
) -> Result<()> {
    require!(
        merchant.pending_payout_token_account.is_none(),
        RenewError::PayoutChangeAlreadyPending
    );
    require!(
        merchant.payout_token_account != new_payout_token_account,
        RenewError::PayoutDestinationUnchanged
    );

    merchant.pending_payout_token_account = Some(new_payout_token_account);
    merchant.payout_change_ready_at = now
        .checked_add(payout_change_delay_seconds)
        .ok_or(RenewError::ArithmeticOverflow)?;

    Ok(())
}

pub fn clear_pending_payout_destination_update(merchant: &mut Merchant) -> Result<Pubkey> {
    let pending = merchant
        .pending_payout_token_account
        .ok_or(RenewError::NoPendingPayoutDestination)?;

    merchant.pending_payout_token_account = None;
    merchant.payout_change_ready_at = 0;

    Ok(pending)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn merchant_fixture() -> Merchant {
        Merchant {
            merchant_id: [9; 32],
            authority: Pubkey::new_unique(),
            payout_token_account: Pubkey::new_unique(),
            pending_payout_token_account: None,
            metadata_hash: [7; 32],
            billing_enabled: true,
            payout_change_ready_at: 0,
            vault_token_account: Pubkey::new_unique(),
            bump: 254,
        }
    }

    #[test]
    fn payout_change_rejects_same_destination() {
        let mut merchant = merchant_fixture();
        let current_payout = merchant.payout_token_account;

        let result = prepare_payout_destination_update(&mut merchant, current_payout, 60, 100);

        assert!(matches!(
            result,
            Err(error) if error == RenewError::PayoutDestinationUnchanged.into()
        ));
    }

    #[test]
    fn payout_change_rejects_parallel_pending_request() {
        let mut merchant = merchant_fixture();
        let first_destination = Pubkey::new_unique();
        let second_destination = Pubkey::new_unique();

        prepare_payout_destination_update(&mut merchant, first_destination, 60, 100).unwrap();
        let result = prepare_payout_destination_update(&mut merchant, second_destination, 60, 120);

        assert!(matches!(
            result,
            Err(error) if error == RenewError::PayoutChangeAlreadyPending.into()
        ));
    }

    #[test]
    fn clearing_pending_payout_resets_delay_state() {
        let mut merchant = merchant_fixture();
        let pending_destination = Pubkey::new_unique();

        prepare_payout_destination_update(&mut merchant, pending_destination, 60, 100).unwrap();
        let cleared = clear_pending_payout_destination_update(&mut merchant).unwrap();

        assert_eq!(cleared, pending_destination);
        assert_eq!(merchant.pending_payout_token_account, None);
        assert_eq!(merchant.payout_change_ready_at, 0);
    }
}
