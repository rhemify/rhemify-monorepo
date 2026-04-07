use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account]
pub struct AgentWallet {
    #[max_len(32)]
    pub fleet_id: String,

    #[max_len(32)]
    pub agent_key: String,

    #[max_len(64)]
    pub dwallet_id: String,

    pub max_per_tx: u64,

    pub daily_limit: u64,

    pub daily_spent: u64,

    pub last_reset_day: i64, // Unix timestamp of start of current day

    /// 0 = active, 1 = frozen
    pub status: u8,

    /// Up to 5 allowed chains, each max 16 chars
    #[max_len(5, 16)]
    pub allowed_chains: Vec<String>,

    pub bump: u8,
}
