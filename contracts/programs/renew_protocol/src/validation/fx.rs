use anchor_lang::prelude::*;

use crate::{args::FxQuoteSnapshotArgs, errors::RenewError, validation::is_nonzero_id};

pub fn validate_fx_quote_snapshot(fx_quote: &FxQuoteSnapshotArgs) -> Result<()> {
    require!(
        is_nonzero_id(&fx_quote.fx_quote_ref_hash),
        RenewError::InvalidIdentifier
    );
    require!(
        is_nonzero_id(&fx_quote.fx_provider_ref_hash),
        RenewError::InvalidIdentifier
    );
    require!(fx_quote.quote_generated_at > 0, RenewError::InvalidTimestamp);
    require!(
        fx_quote.quote_expires_at >= fx_quote.quote_generated_at,
        RenewError::InvalidTimestamp
    );

    Ok(())
}
