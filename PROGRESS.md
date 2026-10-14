# PROGRESS

## Current milestone: M0 — Greybox

### Done
- 2026-10-13: Repo created (clone of empty Blocklechain/world), monorepo scaffold committed.
- 2026-10-13: Blender MCP verified connected (addon v1.8, protocol 13).

### Next
- Audit of Blocklechain/blockle in progress (chain crates, BLOCK-20 contract, RPC, DEX, extension signer, devnet path) — findings land here.
- Asset pipeline core: palette generator, sword generator, export.py, thumbs.py.
- PWA shell + embedded wallet sign-in.
- Greybox starter-town zone + navmesh bake + tap-to-move.
- Colyseus server, one zone room, player sync, zone chat.
- Docker Compose dev stack (postgres, redis, devnet node).

### Device measurements
_(none yet — first phone test due with M0 greybox via cloudflared tunnel)_

### Tunnel URL
_(not yet started)_

### Chain audit (2026-10-13, verified against /Volumes/ExtremePro/blockle)
Confirmed: chain in `chain/crates/{core,pow,chain,vm,zk,node}`, ML-DSA-44 (fips204, ctx `BlklTxV1`), 600 s target spacing, coinbase maturity 100; BLOCK-20 asm emitter `chain/crates/chain/src/block20.rs` with balances at `BLAKE2B(0x01‖addr)` and selector-byte ABI, conformance tests in `chain/crates/chain/tests/block20_token.rs`; Studio at `web/studio.js` (+ examples `chain/examples/contracts/`); native AMM in consensus (`pools.rs`, 30 bps); extension dApp provider (`blockle-extension/inpage.js`, signing only via `blockle-wasm`); Flutter app dApp browser; buy reserve curve in `src/biz.rs` + `web/buy.js`; regtest devnet built into the node (Equihash 48,5, 1 s spacing, maturity 5, `--mine --mine-interval`).

Key deltas that shape WORLD's design:
- **Basic-auth JSON-RPC is read-only** (`rpc.rs`). `submitrawtransaction`, `callcontract`, `tokeninfo`, `listpools` live on the **unauthenticated** `--aux-http` server (`pool.rs`, CORS `*`). WORLD services must treat aux-http as internal-only (firewalled / localhost).
- **No NFT standard exists on BLOCK** — BLOCK-721 is ours to define; template is `block20.rs` (asm emitter + BLAKE2B slot‖key storage).
- **VM is a u64 stack machine**: no contract-to-contract calls, no SHA256 opcode, no ML-DSA-verify opcode; contract ids are `blake2b("BlklCntr", deploy_txid)` (32-byte hex, not bech32). Vault authorization must therefore be `CALLER == operator` checks, not on-chain signature verification.
- **No pure-JS ML-DSA or block1 address codec** — the embedded wallet must use `blockle-wasm` (pkg/ browser build) or `@blockle/agent-sdk`; `@noble/post-quantum` dropped (see DECISIONS).
- Extension provider has **no generic contract-call method** (only deploy/tokenInit/pool ops) — extension support for WORLD needs a `blockle_callContract` PR or SDK path.
- Tx wire format: bincode hex via `submitrawtransaction` or `POST blockle.org/api/submit`; display txids are byte-reversed.
- SPEC.md omits pool action tags 3–7; `block20_asm` is duplicated in its test file (drift risk) — flag in the BLOCK-721 PR.
- No docker anywhere in blockle — devnet runs as a bare `blockle-chain --network regtest` process (compose entry stays a stub or wraps a local binary).

### Discrepancies vs build prompt
- **Blender is 5.3.0 Beta, not 4.x.** blender-mcp addon reports up to date and functional; proceeding on 5.3 — bpy API differences will be handled per-script.
- **Node on this machine is v20.19.4, not 22.** Dev proceeds on 20 (all deps compatible); CI and prod target Node 22. Revisit local upgrade when convenient.
- **Blocklechain/world existed on GitHub but was an empty repo** — scaffolded from scratch as specified.
- Repos live at `/Volumes/ExtremePro/{blockle,world}` (external drive), not under `~`.
