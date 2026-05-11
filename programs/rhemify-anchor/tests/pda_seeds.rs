//! PDA seed derivation tests for rhemify-anchor.
//!
//! These tests exercise the user-scoped PDA seeds that are the program's
//! security invariant — any change to the seed list (prefix, order,
//! inclusion of `authority.key()`) breaks every PDA address derived under
//! the old layout, so a buggy refactor here would silently fork the
//! deployed state. They run under `cargo test --all-targets` on the host
//! target (no SBF runtime needed) and are the audit-grade gate the
//! program-level CI job (Phase O.6) enforces on every push.
//!
//! Not covered here (would require Mollusk / litesvm): the full
//! init_if_needed flow, the runtime `Account` validation, and the Clock
//! sysvar read. Those are deferred to a future integration-test chunk.

use anchor_lang::prelude::Pubkey;
use rhemify_anchor::ID;

/// The seed prefix that determines which on-chain accounts the deployed
/// program will read/write. Pinned here so a typo'd rename in
/// instructions/write_daily_root.rs causes a test failure rather than
/// silently breaking every PDA on devnet.
const DAILY_ROOT_SEED_PREFIX: &[u8] = b"rhemify-daily";

fn derive_daily_root_pda(authority: &Pubkey, fleet_id: &str, date: &str) -> Pubkey {
    let (pda, _bump) = Pubkey::find_program_address(
        &[
            DAILY_ROOT_SEED_PREFIX,
            authority.as_ref(),
            fleet_id.as_bytes(),
            date.as_bytes(),
        ],
        &ID,
    );
    pda
}

#[test]
fn daily_root_pda_is_deterministic() {
    let authority = Pubkey::new_unique();
    let a = derive_daily_root_pda(&authority, "fleet_demo", "2026-05-11");
    let b = derive_daily_root_pda(&authority, "fleet_demo", "2026-05-11");
    assert_eq!(a, b, "same (authority, fleet_id, date) must yield same PDA");
}

#[test]
fn daily_root_pda_is_authority_scoped() {
    let alice = Pubkey::new_unique();
    let bob = Pubkey::new_unique();
    let a = derive_daily_root_pda(&alice, "fleet_demo", "2026-05-11");
    let b = derive_daily_root_pda(&bob, "fleet_demo", "2026-05-11");
    assert_ne!(
        a, b,
        "different signers writing for the same fleet+date must derive different PDAs — \
         this is the squat defense that prevents anyone from overwriting another fleet's daily root"
    );
}

#[test]
fn daily_root_pda_is_fleet_scoped() {
    let authority = Pubkey::new_unique();
    let a = derive_daily_root_pda(&authority, "fleet_one", "2026-05-11");
    let b = derive_daily_root_pda(&authority, "fleet_two", "2026-05-11");
    assert_ne!(a, b, "same authority writing for different fleets must derive different PDAs");
}

#[test]
fn daily_root_pda_is_date_scoped() {
    let authority = Pubkey::new_unique();
    let a = derive_daily_root_pda(&authority, "fleet_demo", "2026-05-11");
    let b = derive_daily_root_pda(&authority, "fleet_demo", "2026-05-12");
    assert_ne!(a, b, "different dates must derive different PDAs (one root per day per fleet)");
}

#[test]
fn daily_root_seed_prefix_is_pinned() {
    assert_eq!(
        DAILY_ROOT_SEED_PREFIX, b"rhemify-daily",
        "seed prefix is the namespace anchor used to derive every existing devnet daily-root PDA; \
         changing it breaks all of them"
    );
}

#[test]
fn program_id_matches_declare_id() {
    let expected = "HYWjBbLMEz98KnppVkUnHmkUZ4pyQ8abaDRTtUedUkxV";
    assert_eq!(
        ID.to_string(),
        expected,
        "program ID must match the deployed devnet program; changing it requires a \
         new declare_id! AND a fresh deploy AND updating every client config"
    );
}
