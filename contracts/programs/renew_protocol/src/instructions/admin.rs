use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    errors::RenewError,
    events::{AuthoritiesUpdated, ConfigInitialized, ProgramPauseUpdated},
    state::Config,
};

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    operator: Pubkey,
    pauser: Pubkey,
) -> Result<()> {
    require!(
        operator != Pubkey::default() && pauser != Pubkey::default(),
        RenewError::InvalidAuthority
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.operator = operator;
    config.pauser = pauser;
    config.route_count = 0;
    config.commitment_count = 0;
    config.paused = false;
    config.bump = ctx.bumps.config;

    emit!(ConfigInitialized {
        admin: config.admin,
        operator,
        pauser,
    });

    Ok(())
}

pub fn update_authorities(
    ctx: Context<AdminOnly>,
    operator: Option<Pubkey>,
    pauser: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(next_operator) = operator {
        require!(
            next_operator != Pubkey::default(),
            RenewError::InvalidAuthority
        );
        config.operator = next_operator;
    }

    if let Some(next_pauser) = pauser {
        require!(
            next_pauser != Pubkey::default(),
            RenewError::InvalidAuthority
        );
        config.pauser = next_pauser;
    }

    emit!(AuthoritiesUpdated {
        admin: config.admin,
        operator: config.operator,
        pauser: config.pauser,
    });

    Ok(())
}

pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;

    emit!(ProgramPauseUpdated {
        pauser: ctx.accounts.authority.key(),
        paused,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == authority.key() || config.pauser == authority.key()
            @ RenewError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}
