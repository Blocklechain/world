# WORLD — world.blockle.org

A mobile-first, browser-native, medieval-fantasy 3D MMORPG. The game layer of the Blockle ecosystem.

- Every item is a BLOCK NFT (BLOCK-721 unique items, BLOCK-20 stackables), custodied by an on-chain Vault while in play, withdrawable at any time.
- BLOCK is the only in-game currency.
- Access is a $10/month PayPal subscription — the only thing the operator ever sells.
- Every 3D asset is the output of a bpy script in `assets/blender/`, executed through Blender MCP. No binary-only assets.
- Server-authoritative gameplay (Colyseus); the client renders and predicts, never decides.

## Layout

```
apps/client/        Babylon.js + Preact PWA (Vite, TypeScript)
apps/server/        Colyseus rooms, Fastify API, PayPal billing, BullMQ jobs
services/indexer/   BLOCK chain tailer (Vault / WorldKey / Market events)
services/minter/    per-block mint & withdrawal batches, operator keystore
services/metadata/  NFT metadata + thumbnails + IPFS pinning
packages/content/   items, recipes, monsters, drops, quests, zones, economy config
packages/shared/    types, protocol schema, ML-DSA helpers, address codec
contracts/          BLOCK-721, Vault, WorldKey, Market, material tokens, tests
assets/blender/     bpy generators: palette/, rig/, generators/, creatures/, zones/
assets/out/         committed GLBs, navmesh binaries, thumbnails
infra/              docker-compose, Caddyfile, CI, backup & alert scripts
```

## Development

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d   # postgres, redis, devnet node
pnpm dev                                            # client + server
```

Asset builds run through Blender MCP (`.mcp.json` configures the `blender` server).
Working docs: `PROGRESS.md` (status + device measurements), `DECISIONS.md`, `BACKLOG.md`.
