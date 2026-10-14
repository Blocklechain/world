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

### Discrepancies vs build prompt
- **Blender is 5.3.0 Beta, not 4.x.** blender-mcp addon reports up to date and functional; proceeding on 5.3 — bpy API differences will be handled per-script.
- **Node on this machine is v20.19.4, not 22.** Dev proceeds on 20 (all deps compatible); CI and prod target Node 22. Revisit local upgrade when convenient.
- **Blocklechain/world existed on GitHub but was an empty repo** — scaffolded from scratch as specified.
- Repos live at `/Volumes/ExtremePro/{blockle,world}` (external drive), not under `~`.
