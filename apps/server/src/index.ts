import { createServer } from "node:http";

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import Fastify from "fastify";

import { ZoneRoom } from "./rooms/ZoneRoom.js";

const GAME_PORT = Number(process.env.WORLD_GAME_PORT ?? 2567);
const API_PORT = Number(process.env.WORLD_API_PORT ?? 8080);

// -- game server (Colyseus over WebSocket) -----------------------------------
const game = new Server({
  transport: new WebSocketTransport({ server: createServer() }),
});
game.define("zone", ZoneRoom).filterBy(["zone"]);
await game.listen(GAME_PORT);
console.log(`[world] game server on :${GAME_PORT}`);

// -- REST API (auth, inventory, billing land here in M1) ---------------------
const api = Fastify({ logger: false });
api.get("/healthz", async () => ({ ok: true, ts: Date.now() }));
await api.listen({ port: API_PORT, host: "0.0.0.0" });
console.log(`[world] api on :${API_PORT}`);
