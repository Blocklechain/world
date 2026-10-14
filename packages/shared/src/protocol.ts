/** Wire protocol shared by client and server. Server is authoritative. */

export const TICK_RATE = 20; // Hz
export const TICK_MS = 1000 / TICK_RATE;
export const INTERP_MS = 100; // client render delay for remote entities
export const ZONE_SHARD_CAP = 150; // players per overworld instance

export const WALK_SPEED = 2.2; // m/s
export const RUN_SPEED = 4.4; // m/s

/** The single seamless overworld; caves/dungeons become their own rooms. */
export const DEFAULT_ZONE = "overworld";

/** Client -> server messages (Colyseus message types). */
export const MSG = {
  move: "move", // { x, z } tap-to-move target
  chat: "chat", // { text }
  stop: "stop",
  interact: "interact", // { nodeId }
  invDrop: "inv:drop", // { slot }
  bankOpen: "bank:open",
  bankDeposit: "bank:deposit", // { slot, all? }
  bankWithdraw: "bank:withdraw", // { itemId, qty }
} as const;

/** Server -> client messages. */
export const EVT = {
  chat: "chat", // { from, text, ts }
  system: "system", // { text }
  profile: "profile", // { address, skills, inv, bankPos }
  inv: "inv", // { inv: (itemId|null)[] }
  xp: "xp", // { skill, xp, total, level }
  bank: "bank", // { open, entries? }
  msg: "msg", // { text } — local game feedback
} as const;

export interface MoveMsg {
  x: number;
  z: number;
}
export interface ChatMsg {
  text: string;
}
export const CHAT_MAX_LEN = 240;
