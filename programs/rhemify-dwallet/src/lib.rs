use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("GPgdzfwQ4qG1QcqePY3uR6Uo8SvCwqxRYg7oDsXd5opc");

#[program]
pub mod rhemify_dwallet {
    use super::*;

    pub fn initialize_fleet_vault(
        ctx: Context<InitializeFleetVaultAccounts>,
        fleet_id: String,
        treasury_dwallet_id: String,
        co_signer: Pubkey,
        daily_cap: u64,
    ) -> Result<()> {
        instructions::initialize_fleet_vault(ctx, fleet_id, treasury_dwallet_id, co_signer, daily_cap)
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
        instructions::register_agent_wallet(ctx, fleet_id, agent_key, dwallet_id, max_per_tx, daily_limit, allowed_chains)
    }

    pub fn approve_signing(
        ctx: Context<ApproveSigningAccounts>,
        target_chain: String,
        target_address: String,
        amount: u64,
        nonce: String,
    ) -> Result<()> {
        instructions::approve_signing(ctx, target_chain, target_address, amount, nonce)
    }

    pub fn freeze_agent(
        ctx: Context<FreezeAgentAccounts>,
        fleet_id: String,
        agent_key: String,
    ) -> Result<()> {
        instructions::freeze_agent(ctx, fleet_id, agent_key)
    }
}
