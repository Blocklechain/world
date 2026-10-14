# PROGRESS

## 2026-10-14 mega-session — the game took shape
All live at https://world.blockle.org (deploy per phase):
- **Island of Veyra**: continuous 1536x2048m island in a deep ocean ring (p6 superellipse + noisy coast), beaches/sand splat layer, animated depth-tinted waves, snowcapped Worldspine, Greywater lake; swimming (0.45x speed, chest-deep float) in any shallow water.
- **Graphics**: ACES tonemap + vignette, sky dome, warm sun + PCF shadows, 5-texture splat terrain, denser layered-canopy forests, grass tufts.
- **Characters**: 3 races x 2 body types with faces (eyes/brow/nose/mouth, elf ears, dwarf noses), 3 hair styles + 2 beards x 5 colors, chip-based creation screen at first signup; appearance on account, rendered for everyone.
- **Combat**: 9 monster species, 651 world spawns by region table, aggro/chase/leash AI, melee/archery/magic styles (style selector UI), hit/damage rolls, drops, damage splats, arrow/bolt projectiles, player HP bar, death -> hearth respawn. Colyseus Encoder.BUFFER_SIZE raised to 512KB (651-monster initial state overflowed 8KB default — symptom: silent partial sync).
- **Fishing** (9th skill): 3 fish species from rippling water spots scattered along shores/lakes.
- **Skill books**: tap a skill -> level-by-level unlock list (data-driven from species tables).
- **Towns/NPCs/quests**: Hearthmere + Alderford + Brightshear with generated cottages/smithy; 6 NPCs with dialogue; 5 teaching quests with progress tracking + XP rewards; quest log; banker NPC opens bank.
- **World map**: baked from heightfield (render-map.ts), fullscreen overlay with towns + live player dot.
- **Auth hardening**: HMAC stateless session tokens (logins survive restarts — memory sessions silently downgraded reconnects to guests before).
- Dev gotcha: killing ports with `lsof -ti:2567` also matched vite's proxy sockets and killed the dev server — use `-sTCP:LISTEN`.

### Known issues / next
- Stray stretched-geometry artifact seen near Hearthmere (likely a degenerate thin-instance matrix) — investigate.
- Caves/dungeons interiors (instanced rooms with loading), prop collision + physics feel, sailing + dynamic ships on the wave system, dedicated combat/fishing/swim-polish clips, equipment/smithing/cooking, asset remodel round 2 (houses brighter, creature polish), NPC idle anims. Old base_body.glb removable after clients cache-bust.

## Current milestone: M0 — Greybox

### Done
- 2026-10-13: Repo created (clone of empty Blocklechain/world), monorepo scaffold committed.
- 2026-10-13: Blender MCP verified connected (addon v1.8, protocol 13).
- 2026-10-13: Blockle chain audit complete (see section below).
- 2026-10-13: Asset pipeline core live: gear palette (16 gradient bands), deterministic sword generator (3 silhouettes × 6 tiers, 74–106 tris), GLB export + 256px alpha thumbnails; 18 swords committed, screenshot-checked against the style guide.
- 2026-10-13: Regtest devnet running via `infra/devnet.sh` (blockle-chain release binary; p2p :18444, aux-http :8445, rpc :9790; 210k BLOCK premine in `~/.world-devnet/wallet.json`).
- 2026-10-13: M0 skeleton playable in Chrome: Colyseus `zone` room (20 Hz, server-auth tap-to-move, bounds clamp, chat), Babylon greybox Hearthmere, client prediction + remote smoothing, Preact HUD chat. Verified end-to-end in-browser: join, move, chat round-trip, two clients see each other.
- 2026-10-13: PWA production build: main chunk **311 KB gz** (budget 1500 KB); SW precache 1.6 MB, manifest + icons (derived from sword thumbnail).
- Known fix worth remembering: `@colyseus/schema` v3 needs `experimentalDecorators: true` **and** `useDefineForClassFields: false`, else the patch encoder dies with `Symbol(Symbol.metadata)` undefined.

### Next — user-directed phase (2026-10-14)
Requirements from the operator, in rough build order:
1. **World redesign: one massive island surrounded by ocean** (ocean floor terrain, beaches; later more continents/islands) — rework `packages/content/world.ts` regions onto an island mask; mountains with real height, caves/dungeon entrances (instanced rooms — loading allowed there only).
2. **Better lighting + graphics pass** (current lighting reads flat): warmer key, ambient occlusion-ish ground tint, sky gradient dome, tuned fog, denser/livelier forests (undergrowth scatter), grass tufts near camera.
3. **Movement/collision**: fix buggy map movement (client prediction now mirrors server walkability — shipped), add prop collision (trees/rocks/buildings block movement), simple slope limits, minor physics feel (step smoothing).
4. **Fishing skill + swimming & depth**: fishing spots in water, swim state in deeper water with slower speed + depth-based visuals.
5. **Cities/villages**: Hearthmere becomes a real town (building generator), plus 2–3 villages; NPCs (banker, vendors, quest givers) with dialogue.
6. **Monsters** (12 planned species) with combat loop; **quests** (10 teaching quests).
7. **World map UI** (terrain heights, region names, player marker).
8. **Character creation screen** on first signup (body/hair/tunic color presets on the modular body).

### Previously queued
- Phone test through the tunnel (two phones, 4G, measure fps on Pixel 6a / iPhone) — needs the human to open the URL.
- Embedded wallet sign-in (blockle-wasm keygen/sign, passphrase-encrypted IndexedDB, challenge–response auth).
- Replace flat-plane movement with baked navmesh (zone generator in assets/blender/zones + RecastJS).
- Rigged base body + walk/idle clips to replace capsules.
- Postgres/Drizzle accounts + characters; BLOCK-721 contract draft in contracts/.

### Device measurements
_(pending first phone test — tunnel below)_

### Live deployment
- **https://world.blockle.org is LIVE** (2026-10-13): nginx vhost + Let's Encrypt on the blockle.org box (144.126.133.21), static client at /opt/world/client, game server as `world.service` (tsx, ports 4567 game / 4580 api, localhost-only behind nginx). Deploy with `infra/deploy.sh`; first-time setup flag `--setup`. Verified from outside: healthz, matchmake, websocket join, movement + chat in browser.
- Character v2 shipped: lofted 892-tri body, layered gait clips; knee-flexion sign bug found via world-space bone dump (flexion = +X on down-pointing bones) and fixed.
- Chain side: BLOCK-721 standard drafted on blockle branch `block721` (asm emitter + conformance tests + docs, 95 tests green, not pushed) — needs review before PR.

### Tunnel URL (superseded by live deployment)
- 2026-10-13: https://gmbh-neutral-parenting-savannah.trycloudflare.com (vite dev :5173; quick tunnel, URL changes on restart)

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
