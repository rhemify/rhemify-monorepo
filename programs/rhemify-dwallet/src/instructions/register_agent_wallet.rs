use anchor_lang::prelude::*;
use crate::state::{FleetVault, AgentWallet};

#[derive(Accounts)]
#[instruction(fleet_id: String, agent_key: String)]
pub struct RegisterAgentWalletAccounts<'info> {
    #[account(
        seeds = [b"fleet-vault", fleet_id.as_bytes()],
        bump = fleet_vault.bump,
        has_one = authority,
    )]
    pub fleet_vault: Account<'info, FleetVault>,

    #[account(
        init,
        payer = authority,
        space = AgentWallet::DISCRIMINATOR.len() + AgentWallet::INIT_SPACE,
        seeds = [b"agent-wallet", fleet_id.as_bytes(), agent_key.as_bytes()],
        bump,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn register_agent_wallet(
    ctx: Context<RegisterAgentWalletAccounts>,
    fleet_id: String,
    agent_key: String,
    dwallet_id: String,
    max_per_tx: u64,
    daily_limit: u64,
    allowed_chains: Vec<String>,
) -> Result<()> {
    let wallet = &mut ctx.accounts.agent_wallet;
    wallet.fleet_id = fleet_id;
    wallet.agent_key = agent_key;
    wallet.dwallet_id = dwallet_id;
    wallet.max_per_tx = max_per_tx;
    wallet.daily_limit = daily_limit;
    wallet.daily_spent = 0;
    wallet.last_reset_day = 0;
    wallet.status = 0; // active
    wallet.allowed_chains = allowed_chains;
    wallet.bump = ctx.bumps.agent_wallet;
    Ok(())
}
