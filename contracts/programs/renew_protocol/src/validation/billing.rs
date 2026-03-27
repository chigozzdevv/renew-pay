use anchor_lang::prelude::*;

use crate::{
    args::PlanTermsArgs,
    errors::RenewError,
    state::{BillingMode, Subscription, SubscriptionStatus},
};

pub fn validate_plan_terms(args: &PlanTermsArgs) -> Result<()> {
    require!(args.billing_interval_seconds > 0, RenewError::InvalidAmount);

    match args.billing_mode {
        BillingMode::Fixed => {
            require!(args.fixed_amount > 0, RenewError::InvalidAmount);
        }
        BillingMode::Metered => {
            require!(
                args.fixed_amount > 0 || args.usage_rate > 0,
                RenewError::InvalidAmount
            );
        }
    }

    Ok(())
}

pub fn set_subscription_status(subscription: &mut Subscription, status: SubscriptionStatus) {
    subscription.status = status;
    if status != SubscriptionStatus::Active {
        subscription.retry_count = 0;
        subscription.retry_available_at = 0;
    }
}

pub fn assert_chargeable(
    subscription: &Subscription,
    billing_period_start: i64,
    now: i64,
) -> Result<()> {
    require!(
        subscription.status == SubscriptionStatus::Active,
        RenewError::SubscriptionNotChargeable
    );
    require!(
        billing_period_start == subscription.next_charge_at,
        RenewError::SubscriptionNotChargeable
    );

    if subscription.retry_count == 0 {
        require!(
            subscription.next_charge_at <= now,
            RenewError::SubscriptionNotChargeable
        );
        return Ok(());
    }

    require!(
        subscription.retry_available_at != 0 && subscription.retry_available_at <= now,
        RenewError::SubscriptionNotChargeable
    );

    Ok(())
}

pub fn expected_usdc_amount(subscription: &Subscription, usage_units: u64) -> Result<u64> {
    match subscription.billing_mode {
        BillingMode::Fixed => {
            require!(usage_units == 0, RenewError::ChargeAmountMismatch);
            Ok(subscription.fixed_amount)
        }
        BillingMode::Metered => {
            subscription
                .usage_rate
                .checked_mul(usage_units)
                .and_then(|usage_total| usage_total.checked_add(subscription.fixed_amount))
                .ok_or(RenewError::ArithmeticOverflow.into())
        }
    }
}

pub fn register_charge_failure(subscription: &mut Subscription, now: i64) -> Result<()> {
    require!(
        subscription.retry_count < subscription.max_retry_count,
        RenewError::RetryLimitReached
    );

    subscription.retry_count = subscription
        .retry_count
        .checked_add(1)
        .ok_or(RenewError::ArithmeticOverflow)?;

    if subscription.retry_count >= subscription.max_retry_count {
        subscription.status = SubscriptionStatus::RetryExhausted;
        subscription.retry_available_at = 0;
        return Ok(());
    }

    subscription.retry_available_at = if subscription.retry_window_seconds == 0 {
        now
    } else {
        now.checked_add(subscription.retry_window_seconds as i64)
            .ok_or(RenewError::ArithmeticOverflow)?
    };

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::prelude::Pubkey;

    fn base_subscription(mode: BillingMode) -> Subscription {
        Subscription {
            merchant: Pubkey::new_unique(),
            plan: Pubkey::new_unique(),
            subscription_ref_hash: [1; 32],
            customer_ref_hash: [2; 32],
            mandate_hash: [3; 32],
            billing_currency: *b"USDC\0\0\0\0",
            status: SubscriptionStatus::Active,
            billing_mode: mode,
            fixed_amount: 5_000_000,
            usage_rate: 250_000,
            local_amount_snapshot: 0,
            billing_interval_seconds: 30 * 24 * 60 * 60,
            retry_window_seconds: 24 * 60 * 60,
            max_retry_count: 3,
            retry_count: 0,
            next_charge_at: 1_000,
            last_charge_at: 0,
            retry_available_at: 0,
            created_at: 0,
            bump: 0,
        }
    }

    #[test]
    fn fixed_billing_expected_amount_matches_snapshot() {
        let subscription = base_subscription(BillingMode::Fixed);
        assert_eq!(expected_usdc_amount(&subscription, 0).unwrap(), 5_000_000);
    }

    #[test]
    fn metered_billing_adds_usage_rate_to_base_amount() {
        let subscription = base_subscription(BillingMode::Metered);
        assert_eq!(expected_usdc_amount(&subscription, 12).unwrap(), 8_000_000);
    }

    #[test]
    fn metered_billing_allows_zero_usage_when_base_amount_exists() {
        let subscription = base_subscription(BillingMode::Metered);
        assert_eq!(expected_usdc_amount(&subscription, 0).unwrap(), 5_000_000);
    }

    #[test]
    fn retry_window_chargeability_requires_retry_time() {
        let mut subscription = base_subscription(BillingMode::Fixed);
        subscription.retry_count = 1;
        subscription.retry_available_at = 2_000;

        assert!(assert_chargeable(&subscription, 1_000, 1_500).is_err());
        assert!(assert_chargeable(&subscription, 1_000, 2_000).is_ok());
    }

    #[test]
    fn final_retry_marks_subscription_retry_exhausted() {
        let mut subscription = base_subscription(BillingMode::Fixed);
        subscription.max_retry_count = 2;
        subscription.retry_count = 1;

        register_charge_failure(&mut subscription, 5_000).unwrap();

        assert_eq!(subscription.retry_count, 2);
        assert_eq!(subscription.status, SubscriptionStatus::RetryExhausted);
        assert_eq!(subscription.retry_available_at, 0);
    }
}
