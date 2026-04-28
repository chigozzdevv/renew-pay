use anchor_lang::prelude::*;

#[error_code]
pub enum RenewError {
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("The commitment amount breakdown is invalid.")]
    AmountMismatch,
    #[msg("Insufficient outstanding route balance.")]
    InsufficientOutstandingAmount,
    #[msg("Invalid authority.")]
    InvalidAuthority,
    #[msg("Invalid amount.")]
    InvalidAmount,
    #[msg("Invalid commitment root.")]
    InvalidCommitmentRoot,
    #[msg("Invalid identifier.")]
    InvalidIdentifier,
    #[msg("Invalid item count.")]
    InvalidItemCount,
    #[msg("Invalid route.")]
    InvalidRoute,
    #[msg("Program is paused.")]
    ProgramPaused,
    #[msg("Settlement route is disabled.")]
    RouteDisabled,
    #[msg("Unauthorized.")]
    Unauthorized,
}
