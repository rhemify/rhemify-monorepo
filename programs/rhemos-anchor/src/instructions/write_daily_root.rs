use anchor_lang::prelude::*;
use crate::state::DailyRoot;

#[derive(Accounts)]
#[instruction(fleet_id: String, date: String)]
pub struct WriteDailyRootAccountConstraints<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = DailyRoot::DISCRIMINATOR.len() + DailyRoot::INIT_SPACE,
        seeds = [b"rhemos-daily", fleet_id.as_bytes(), date.as_bytes()],
        bump,
    )]
    pub daily_root: Account<'info, DailyRoot>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn write_daily_root(
    context: Context<WriteDailyRootAccountConstraints>,
    fleet_id: String,
    date: String,
    merkle_root: [u8; 32],
    trace_count: u32,
) -> Result<()> {
    let root = &mut context.accounts.daily_root;

    root.fleet_id = fleet_id;
    root.date = date;
    root.merkle_root = merkle_root;
    root.trace_count = trace_count;
    root.authority = context.accounts.authority.key();
    root.timestamp = Clock::get()?.unix_timestamp;
    root.bump = context.bumps.daily_root;

    Ok(())
}
