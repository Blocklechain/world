# DECISIONS

Decisions made beyond (or refining) the build prompt. Repo contradictions with the prompt are logged in PROGRESS.md.

- **2026-10-13 — pnpm workspaces** for the monorepo (client, server, services, packages share types via `packages/shared`); npm/yarn not considered further.
- **2026-10-13 — Blender 5.3 Beta accepted** as the asset-build Blender (it is what is installed and connected). Generator scripts must run headless-compatible bpy and avoid 4.x-removed APIs.
- **2026-10-13 — Asset GLBs committed under `assets/out/`** mirrored by category (`gear/`, `props/`, `creatures/`, `zones/`, `thumbs/`), filenames are `<generator>_<variant>_s<seed>.glb` so a file maps 1:1 to the generator call that made it.
