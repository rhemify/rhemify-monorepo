use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("AnNz2XESvXbyt2uNnFaZD3Wr6qZpmHC4iuHzmcxMoPRg");

#[program]
pub mod rhemos_anchor {
    use super::*;

    pub fn write_daily_root(
        context: Context<WriteDailyRootAccountConstraints>,
        fleet_id: String,
        date: String,
        merkle_root: [u8; 32],
        trace_count: u32,
    ) -> Result<()> {
        instructions::write_daily_root(context, fleet_id, date, merkle_root, trace_count)
    }
}
