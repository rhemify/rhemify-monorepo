use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account]
pub struct DailyRoot {
    #[max_len(32)]
    pub fleet_id: String,

    #[max_len(10)]
    pub date: String,

    pub merkle_root: [u8; 32],

    pub trace_count: u32,

    pub authority: Pubkey,

    pub timestamp: i64,

    pub bump: u8,
}
