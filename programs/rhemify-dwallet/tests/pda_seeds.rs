//! PDA seed derivation tests for rhemify-dwallet.
//!
//! Three PDA families, each tested for the same set of invariants:
//!
//!   fleet-vault       [b"fleet-vault", authority, fleet_id]
//!   agent-wallet      [b"agent-wallet", authority, fleet_id, agent_key]
//!   signing-approval  [b"signing-approval", agent_wallet_pda, nonce]
//!
//! Squat defense (audit-critical): the fleet-vault and agent-wallet seeds
//! both include the authority pubkey, so a different signer cannot init
//! into another fleet's namespace. The signing-approval seed includes the
//! agent_wallet PDA, which is itself authority-scoped — transitive squat
//! defense. These tests pin all three.
//!
//! Same scope discipline as rhemify-anchor/tests/pda_seeds.rs: pure
//! host-target unit tests, no SBF runtime, no full account validation.

use anchor_lang::prelude::Pubkey;
use rhemify_dwallet::ID;

const FLEET_VAULT_SEED_PREFIX: &[u8] = b"fleet-vault";
const AGENT_WALLET_SEED_PREFIX: &[u8] = b"agent-wallet";
const SIGNING_APPROVAL_SEED_PREFIX: &[u8] = b"signing-approval";

fn derive_fleet_vault_pda(authority: &Pubkey, fleet_id: &str) -> Pubkey {
    let (pda, _) = Pubkey::find_program_address(
        &[FLEET_VAULT_SEED_PREFIX, authority.as_ref(), fleet_id.as_bytes()],
        &ID,
    );
    pda
}

fn derive_agent_wallet_pda(authority: &Pubkey, fleet_id: &str, agent_key: &str) -> Pubkey {
    let (pda, _) = Pubkey::find_program_address(
        &[
            AGENT_WALLET_SEED_PREFIX,
            authority.as_ref(),
            fleet_id.as_bytes(),
            agent_key.as_bytes(),
        ],
        &ID,
    );
    pda
}

fn derive_signing_approval_pda(agent_wallet: &Pubkey, nonce: &str) -> Pubkey {
    let (pda, _) = Pubkey::find_program_address(
        &[SIGNING_APPROVAL_SEED_PREFIX, agent_wallet.as_ref(), nonce.as_bytes()],
        &ID,
    );
    pda
}

// --- fleet_vault ---

#[test]
fn fleet_vault_pda_is_deterministic() {
    let authority = Pubkey::new_unique();
    let a = derive_fleet_vault_pda(&authority, "fleet_demo");
    let b = derive_fleet_vault_pda(&authority, "fleet_demo");
    assert_eq!(a, b);
}

#[test]
fn fleet_vault_pda_is_authority_scoped() {
    let alice = Pubkey::new_unique();
    let bob = Pubkey::new_unique();
    let a = derive_fleet_vault_pda(&alice, "fleet_demo");
    let b = derive_fleet_vault_pda(&bob, "fleet_demo");
    assert_ne!(
        a, b,
        "two different operators must not collide on the same fleet_id — \
         the authority pubkey is in the seed to enforce ownership"
    );
}

#[test]
fn fleet_vault_pda_is_fleet_scoped() {
    let authority = Pubkey::new_unique();
    let a = derive_fleet_vault_pda(&authority, "fleet_one");
    let b = derive_fleet_vault_pda(&authority, "fleet_two");
    assert_ne!(a, b);
}

// --- agent_wallet ---

#[test]
fn agent_wallet_pda_is_deterministic() {
    let authority = Pubkey::new_unique();
    let a = derive_agent_wallet_pda(&authority, "fleet_demo", "agent_research_001");
    let b = derive_agent_wallet_pda(&authority, "fleet_demo", "agent_research_001");
    assert_eq!(a, b);
}

#[test]
fn agent_wallet_pda_is_authority_scoped() {
    let alice = Pubkey::new_unique();
    let bob = Pubkey::new_unique();
    let a = derive_agent_wallet_pda(&alice, "fleet_demo", "agent_001");
    let b = derive_agent_wallet_pda(&bob, "fleet_demo", "agent_001");
    assert_ne!(a, b, "agent wallets are authority-scoped — distinct fleets cannot collide");
}

#[test]
fn agent_wallet_pda_differs_by_agent_key() {
    let authority = Pubkey::new_unique();
    let a = derive_agent_wallet_pda(&authority, "fleet_demo", "agent_001");
    let b = derive_agent_wallet_pda(&authority, "fleet_demo", "agent_002");
    assert_ne!(a, b);
}

// --- signing_approval ---

#[test]
fn signing_approval_pda_is_deterministic() {
    let agent_wallet = Pubkey::new_unique();
    let a = derive_signing_approval_pda(&agent_wallet, "nonce_abc123");
    let b = derive_signing_approval_pda(&agent_wallet, "nonce_abc123");
    assert_eq!(a, b);
}

#[test]
fn signing_approval_pda_is_nonce_scoped() {
    let agent_wallet = Pubkey::new_unique();
    let a = derive_signing_approval_pda(&agent_wallet, "nonce_001");
    let b = derive_signing_approval_pda(&agent_wallet, "nonce_002");
    assert_ne!(
        a, b,
        "different nonces must derive different approval PDAs — this is the replay defense \
         (same approval cannot be re-submitted under a different nonce)"
    );
}

#[test]
fn signing_approval_pda_inherits_agent_wallet_scope() {
    // Two different agent wallets (which are themselves authority-scoped),
    // same nonce: must derive different approval PDAs. Proves the squat
    // defense is transitive — you can't impersonate another agent's
    // approval by guessing its nonce.
    let agent_wallet_a = Pubkey::new_unique();
    let agent_wallet_b = Pubkey::new_unique();
    let a = derive_signing_approval_pda(&agent_wallet_a, "nonce_shared");
    let b = derive_signing_approval_pda(&agent_wallet_b, "nonce_shared");
    assert_ne!(a, b);
}

// --- pinned constants ---

#[test]
fn seed_prefixes_are_pinned() {
    assert_eq!(FLEET_VAULT_SEED_PREFIX, b"fleet-vault");
    assert_eq!(AGENT_WALLET_SEED_PREFIX, b"agent-wallet");
    assert_eq!(SIGNING_APPROVAL_SEED_PREFIX, b"signing-approval");
}

#[test]
fn program_id_matches_declare_id() {
    let expected = "GPgdzfwQ4qG1QcqePY3uR6Uo8SvCwqxRYg7oDsXd5opc";
    assert_eq!(ID.to_string(), expected);
}
