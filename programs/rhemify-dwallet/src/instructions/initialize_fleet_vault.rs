use anchor_lang::prelude::*;
use crate::state::FleetVault;

#[derive(Accounts)]
#[instruction(fleet_id: String)]
pub struct InitializeFleetVaultAccounts<'info> {
    #[account(
        init,
        payer = authority,
        space = FleetVault::DISCRIMINATOR.len() + FleetVault::INIT_SPACE,
        seeds = [b"fleet-vault", fleet_id.as_bytes()],
        bump,
    )]
    pub fleet_vault: Account<'info, FleetVault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_fleet_vault(
    ctx: Context<InitializeFleetVaultAccounts>,
    fleet_id: String,
    treasury_dwallet_id: String,
    co_signer: Pubkey,
    daily_cap: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.fleet_vault;
    vault.fleet_id = fleet_id;
    vault.treasury_dwallet_id = treasury_dwallet_id;
    vault.authority = ctx.accounts.authority.key();
    vault.co_signer = co_signer;
    vault.daily_cap = daily_cap;
    vault.is_frozen = false;
    vault.created_at = Clock::get()?.unix_timestamp;
    vault.bump = ctx.bumps.fleet_vault;
    Ok(())
}
