use anchor_lang::prelude::*;
use crate::state::{FleetVault, AgentWallet};

#[derive(Accounts)]
#[instruction(fleet_id: String, agent_key: String)]
pub struct FreezeAgentAccounts<'info> {
    #[account(
        seeds = [b"fleet-vault", authority.key().as_ref(), fleet_id.as_bytes()],
        bump = fleet_vault.bump,
        has_one = authority,
    )]
    pub fleet_vault: Account<'info, FleetVault>,

    #[account(
        mut,
        seeds = [b"agent-wallet", authority.key().as_ref(), fleet_id.as_bytes(), agent_key.as_bytes()],
        bump = agent_wallet.bump,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,

    pub authority: Signer<'info>,
}

pub fn freeze_agent(
    ctx: Context<FreezeAgentAccounts>,
    _fleet_id: String,
    _agent_key: String,
) -> Result<()> {
    ctx.accounts.agent_wallet.status = 1; // frozen
    Ok(())
}
