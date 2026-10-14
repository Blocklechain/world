import { createServer } from "node:http";

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import Fastify from "fastify";

import * as accounts from "./accounts.js";
import * as auth from "./auth.js";
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

api.post("/auth/register", async (req, reply) => {
  const { email, password, name } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string") {
    return reply.code(400).send({ error: "bad request" });
  }
  const res = accounts.register(email, password, name);
  if (!res.ok) return reply.code(400).send({ error: res.error });
  const token = auth.createSession(res.account.address);
  return { token, address: res.account.address, name: res.account.name, hasAppearance: false };
});

api.post("/auth/login", async (req, reply) => {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") {
    return reply.code(400).send({ error: "bad request" });
  }
  const account = accounts.login(email, password);
  if (!account) return reply.code(401).send({ error: "Wrong email or password." });
  const token = auth.createSession(account.address);
  return { token, address: account.address, name: account.name, hasAppearance: !!account.appearance };
});

api.post("/auth/appearance", async (req, reply) => {
  const { token, appearance } = (req.body ?? {}) as Record<string, unknown>;
  const address = auth.sessionAddress(token);
  if (!address) return reply.code(401).send({ error: "no session" });
  if (!accounts.setAppearance(address, appearance)) {
    return reply.code(400).send({ error: "bad appearance" });
  }
  return { ok: true };
});

api.post("/auth/challenge", async (req, reply) => {
  const { address } = (req.body ?? {}) as { address?: unknown };
  if (!auth.looksLikeAddress(address)) return reply.code(400).send({ error: "bad address" });
  return auth.makeChallenge(address);
});

api.post("/auth/verify", async (req, reply) => {
  const { address, publicKey, signature } = (req.body ?? {}) as Record<string, unknown>;
  if (
    !auth.looksLikeAddress(address) ||
    !auth.looksLikeHex(publicKey, 4096) ||
    !auth.looksLikeHex(signature, 8192)
  ) {
    return reply.code(400).send({ error: "bad request" });
  }
  const token = auth.verifyChallenge(address, publicKey, signature);
  if (!token) return reply.code(401).send({ error: "signature rejected" });
  return { token, address };
});

api.get("/auth/me", async (req, reply) => {
  const address = auth.sessionAddress(req.headers["x-world-token"]);
  if (!address) return reply.code(401).send({ error: "no session" });
  return { address };
});
await api.listen({ port: API_PORT, host: "0.0.0.0" });
console.log(`[world] api on :${API_PORT}`);
