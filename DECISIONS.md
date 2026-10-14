# DECISIONS

Decisions made beyond (or refining) the build prompt. Repo contradictions with the prompt are logged in PROGRESS.md.

- **2026-10-13 — pnpm workspaces** for the monorepo (client, server, services, packages share types via `packages/shared`); npm/yarn not considered further.
- **2026-10-13 — Blender 5.3 Beta accepted** as the asset-build Blender (it is what is installed and connected). Generator scripts must run headless-compatible bpy and avoid 4.x-removed APIs.
- **2026-10-13 — Embedded wallet uses `blockle-wasm`, not `@noble/post-quantum`.** The chain audit found consensus signing depends on fips204 ML-DSA-44 with context `BlklTxV1` and addresses on personalized BLAKE2B (`BlklAddr`) — neither reproducible from noble without reimplementing chain internals. `blockle-wasm` (browser pkg) is the signer the extension itself uses; reuse per the prompt's "prefer reuse".
- **2026-10-13 — Vault withdraw authorization = `CALLER == operator`** (operator submits withdrawal txs), because the VM has no ML-DSA-verify opcode, so `withdraw(..., operatorSig)` as literally specified cannot verify a signature in-contract. Nonce replay protection stays in the contract; the operator key signs the *transaction* instead of a payload. Logged as a spec deviation.
- **2026-10-13 — Devnet node runs as a host binary**, not in docker (blockle ships no container tooling; regtest is built into `blockle-chain`). `infra/devnet.sh` wraps init/start; compose carries only postgres + redis.
- **2026-10-13 — Asset GLBs committed under `assets/out/`** mirrored by category (`gear/`, `props/`, `creatures/`, `zones/`, `thumbs/`), filenames are `<generator>_<variant>_s<seed>.glb` so a file maps 1:1 to the generator call that made it.
