use anchor_lang::prelude::*;
use crate::state::{FleetVault, AgentWallet, SigningApproval};

#[error_code]
pub enum DWalletError {
    #[msg("Agent wallet is frozen")]
    AgentFrozen,
    #[msg("Fleet vault is frozen")]
    FleetFrozen,
    #[msg("Amount exceeds per-transaction limit")]
    ExceedsPerTxLimit,
    #[msg("Amount exceeds daily limit")]
    ExceedsDailyLimit,
    #[msg("Target chain not allowed for this agent")]
    ChainNotAllowed,
    #[msg("Unauthorized co-signer")]
    UnauthorizedCoSigner,
}

#[derive(Accounts)]
#[instruction(target_chain: String, target_address: String, amount: u64, nonce: String)]
pub struct ApproveSigningAccounts<'info> {
    #[account(
        mut,
        seeds = [b"agent-wallet", agent_wallet.fleet_id.as_bytes(), agent_wallet.agent_key.as_bytes()],
        bump = agent_wallet.bump,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,

    #[account(
        seeds = [b"fleet-vault", agent_wallet.fleet_id.as_bytes()],
        bump = fleet_vault.bump,
    )]
    pub fleet_vault: Account<'info, FleetVault>,

    #[account(
        init,
        payer = co_signer,
        space = SigningApproval::DISCRIMINATOR.len() + SigningApproval::INIT_SPACE,
        seeds = [b"signing-approval", agent_wallet.key().as_ref(), nonce.as_bytes()],
        bump,
    )]
    pub signing_approval: Account<'info, SigningApproval>,

    #[account(
        mut,
        constraint = co_signer.key() == fleet_vault.co_signer @ DWalletError::UnauthorizedCoSigner,
    )]
    pub co_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn approve_signing(
    ctx: Context<ApproveSigningAccounts>,
    target_chain: String,
    target_address: String,
    amount: u64,
    nonce: String,
) -> Result<()> {
    let wallet = &mut ctx.accounts.agent_wallet;
    let vault = &ctx.accounts.fleet_vault;

    // Policy checks
    require!(wallet.status == 0, DWalletError::AgentFrozen);
    require!(!vault.is_frozen, DWalletError::FleetFrozen);
    require!(amount <= wallet.max_per_tx, DWalletError::ExceedsPerTxLimit);

    // Check if chain is allowed
    require!(
        wallet.allowed_chains.iter().any(|c| c == &target_chain),
        DWalletError::ChainNotAllowed
    );

    // Reset daily spent if new day
    let now = Clock::get()?.unix_timestamp;
    let current_day = now / 86400;
    let last_day = wallet.last_reset_day / 86400;
    if current_day > last_day {
        wallet.daily_spent = 0;
        wallet.last_reset_day = current_day * 86400;
    }

    // Check daily limit
    let projected_spend = wallet.daily_spent
        .checked_add(amount)
        .ok_or(error!(DWalletError::ExceedsDailyLimit))?;
    require!(
        projected_spend <= wallet.daily_limit,
        DWalletError::ExceedsDailyLimit
    );

    // Update daily spent
    wallet.daily_spent = wallet.daily_spent
        .checked_add(amount)
        .ok_or(error!(DWalletError::ExceedsDailyLimit))?;

    // Create signing approval
    let approval = &mut ctx.accounts.signing_approval;
    approval.agent_wallet = ctx.accounts.agent_wallet.key();
    approval.target_chain = target_chain;
    approval.target_address = target_address;
    approval.amount = amount;
    approval.nonce = nonce;
    approval.approved_at = now;
    approval.bump = ctx.bumps.signing_approval;

    Ok(())
}
