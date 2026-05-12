use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account]
pub struct FleetVault {
    #[max_len(32)]
    pub fleet_id: String,

    #[max_len(64)]
    pub treasury_dwallet_id: String,

    pub authority: Pubkey,

    pub co_signer: Pubkey,

    pub daily_cap: u64,

    pub daily_spent: u64,

    pub last_reset_day: i64,

    pub is_frozen: bool,

    pub created_at: i64,

    pub bump: u8,
}
