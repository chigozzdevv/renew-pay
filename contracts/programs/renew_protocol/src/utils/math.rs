use anchor_lang::prelude::*;

use crate::errors::RenewError;

pub fn calculate_protocol_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .and_then(|value| value.checked_div(10_000))
        .ok_or(RenewError::ArithmeticOverflow)?;

    u64::try_from(fee).map_err(|_| RenewError::ArithmeticOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_fee_rounds_down_safely() {
        assert_eq!(calculate_protocol_fee(1_999_999, 250).unwrap(), 49_999);
    }
}
