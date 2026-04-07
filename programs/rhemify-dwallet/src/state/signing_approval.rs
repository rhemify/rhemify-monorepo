use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account]
pub struct SigningApproval {
    pub agent_wallet: Pubkey,

    #[max_len(16)]
    pub target_chain: String,

    #[max_len(64)]
    pub target_address: String,

    pub amount: u64,

    #[max_len(32)]
    pub nonce: String,

    pub approved_at: i64,

    pub bump: u8,
}
